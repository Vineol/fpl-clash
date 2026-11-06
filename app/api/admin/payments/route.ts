
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";


async function authorizeAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return { error: "Unauthorized", status: 401 };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return { error: "Server configuration error", status: 500 };
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user?.email) {
    return { error: "Unauthorized", status: 401 };
  }

  const allowedEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedEmails.includes(data.user.email.toLowerCase())) {
    return { error: "Forbidden", status: 403 };
  }

  return { user: data.user };
}

export async function GET(request: Request) {
  const auth = await authorizeAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { data: entries, error: entriesError } =
    await supabaseAdmin
      .from("entries")
      .select(`
        id,
        user_id,
        gameweek_id,
        group_id,
        status,
        created_at,
        gameweeks (
          fpl_gameweek_number,
          name,
          deadline
        ),
        competition_groups (
          group_number
        ),
        fpl_teams (
          team_name,
          fpl_team_id,
          verified
        ),
        payments (
          id,
          amount_kes,
          provider,
          provider_reference,
          status,
          created_at
        )
      `)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

  if (entriesError) {
    console.error("Payment entries error:", entriesError);
    return NextResponse.json(
      { error: "Could not load payment records." },
      { status: 500 }
    );
  }

  const { data: usersData, error: usersError } =
    await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

  if (usersError) {
    console.error("Payment users error:", usersError);
    return NextResponse.json(
      { error: "Could not load participant details." },
      { status: 500 }
    );
  }

  const emailByUserId = new Map(
    usersData.users.map((user) => [
      user.id,
      user.email || "",
    ])
  );

  const records = (entries || []).map((entry: any) => {
    const payments = Array.isArray(entry.payments)
      ? entry.payments
      : [];

    const payment = payments[0] || null;

    return {
      entry_id: entry.id,
      user_id: entry.user_id,
      email: emailByUserId.get(entry.user_id) || "",
      entry_status: entry.status,
      joined_at: entry.created_at,
      gameweek: Array.isArray(entry.gameweeks)
        ? entry.gameweeks[0] || null
        : entry.gameweeks,
      group: Array.isArray(entry.competition_groups)
        ? entry.competition_groups[0] || null
        : entry.competition_groups,
      team: Array.isArray(entry.fpl_teams)
        ? entry.fpl_teams[0] || null
        : entry.fpl_teams,
      payment,
    };
  });

  const summary = {
    total_entries: records.length,
    paid: records.filter(
      (record) => record.payment?.status === "paid"
    ).length,
    pending: records.filter(
      (record) =>
        !record.payment ||
        record.payment.status === "pending"
    ).length,
    failed: records.filter(
      (record) => record.payment?.status === "failed"
    ).length,
    refunded: records.filter(
      (record) => record.payment?.status === "refunded"
    ).length,
  };

  return NextResponse.json({ records, summary });
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  let body: {
    entryId?: number;
    status?: string;
    providerReference?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const entryId = Number(body.entryId);
  const status = body.status;
  const reference =
    typeof body.providerReference === "string"
      ? body.providerReference.trim()
      : "";

  const allowedStatuses = [
    "pending",
    "paid",
    "failed",
    "refunded",
  ];

  if (
    !Number.isSafeInteger(entryId) ||
    entryId <= 0 ||
    !allowedStatuses.includes(status || "")
  ) {
    return NextResponse.json(
      { error: "Invalid entry ID or payment status." },
      { status: 400 }
    );
  }

  if (status === "paid" && !reference) {
    return NextResponse.json(
      {
        error:
          "A payment reference is required before marking a payment as paid.",
      },
      { status: 400 }
    );
  }

  if (reference.length > 100) {
    return NextResponse.json(
      { error: "Payment reference is too long." },
      { status: 400 }
    );
  }

  const { data: entry, error: entryError } =
    await supabaseAdmin
      .from("entries")
      .select("id, user_id, status")
      .eq("id", entryId)
      .maybeSingle();

  if (entryError) {
    console.error("Payment entry lookup error:", entryError);
    return NextResponse.json(
      { error: "Could not verify the entry." },
      { status: 500 }
    );
  }

  if (!entry || entry.status === "cancelled") {
    return NextResponse.json(
      { error: "Active entry not found." },
      { status: 404 }
    );
  }

  const { data: existingPayments, error: lookupError } =
    await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: false })
      .limit(1);

  if (lookupError) {
    console.error("Payment lookup error:", lookupError);
    return NextResponse.json(
      { error: "Could not check the existing payment." },
      { status: 500 }
    );
  }

  const paymentData = {
    status,
    provider: "mpesa",
    provider_reference: reference || null,
  };

  const existingPayment = existingPayments?.[0];

  const result = existingPayment
    ? await supabaseAdmin
        .from("payments")
        .update(paymentData)
        .eq("id", existingPayment.id)
        .select()
        .single()
    : await supabaseAdmin
        .from("payments")
        .insert({
          ...paymentData,
          entry_id: entry.id,
          user_id: entry.user_id,
          amount_kes: 50,
        })
        .select()
        .single();

  if (result.error) {
    console.error("Payment save error:", result.error);

    return NextResponse.json(
      {
        error:
          "Could not save the payment. Check whether the reference is already in use.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Payment record updated.",
    payment: result.data,
  });
}
