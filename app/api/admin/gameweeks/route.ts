
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const allowedStatuses = [
  "upcoming",
  "open",
  "locked",
  "completed",
] as const;

type GameweekStatus = (typeof allowedStatuses)[number];

async function authorizeAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !key || allowedEmails.length === 0) {
    return { error: "Admin access is not configured.", status: 500 };
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return { error: "Please sign in first.", status: 401 };
  }

  const authClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.email) {
    return { error: "Your session is invalid.", status: 401 };
  }

  if (!allowedEmails.includes(user.email.toLowerCase())) {
    return { error: "Admin access denied.", status: 403 };
  }

  return { user, status: 200 };
}

export async function GET(request: Request) {
  const auth = await authorizeAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("gameweeks")
    .select("id, fpl_gameweek_number, name, deadline, status, created_at")
    .order("fpl_gameweek_number", { ascending: true });

  if (error) {
    console.error("Could not load gameweeks:", error);
    return NextResponse.json(
      { error: "Could not load gameweeks." },
      { status: 500 }
    );
  }

  return NextResponse.json({ gameweeks: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorizeAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (body.action === "create") {
    const number = Number(body.fpl_gameweek_number);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const deadlineText =
      typeof body.deadline === "string" ? body.deadline : "";
    const deadline = new Date(deadlineText);

    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > 38 ||
      !name ||
      name.length > 100 ||
      !deadlineText ||
      Number.isNaN(deadline.getTime())
    ) {
      return NextResponse.json(
        { error: "Enter a valid gameweek number, name and deadline." },
        { status: 400 }
      );
    }

    if (deadline.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "The deadline must be in the future." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("gameweeks")
      .insert({
        fpl_gameweek_number: number,
        name,
        deadline: deadline.toISOString(),
        status: "upcoming",
      })
      .select("id, fpl_gameweek_number, name, deadline, status, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "That gameweek number already exists." },
          { status: 409 }
        );
      }

      console.error("Could not create gameweek:", error);
      return NextResponse.json(
        { error: "Could not create gameweek." },
        { status: 500 }
      );
    }

    return NextResponse.json({ gameweek: data }, { status: 201 });
  }

  if (body.action === "status") {
    const id = Number(body.id);
    const status = body.status;

    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof status !== "string" ||
      !allowedStatuses.includes(status as GameweekStatus)
    ) {
      return NextResponse.json(
        { error: "Invalid gameweek ID or status." },
        { status: 400 }
      );
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("gameweeks")
      .select("id, status, deadline")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "Could not check the gameweek." },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Gameweek not found." },
        { status: 404 }
      );
    }

    const current = existing.status as GameweekStatus;
    const next = status as GameweekStatus;

    // Updated: completed gameweeks can now be reopened.
    const allowedTransitions: Record<GameweekStatus, GameweekStatus[]> = {
      upcoming: ["open"],
      open: ["locked"],
      locked: ["completed"],
      completed: ["open"],
    };

    if (!allowedTransitions[current].includes(next)) {
      return NextResponse.json(
        { error: `Cannot change status from ${current} to ${next}.` },
        { status: 400 }
      );
    }

    if (
      next === "open" &&
      new Date(existing.deadline).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "A gameweek cannot be opened after its deadline." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("gameweeks")
      .update({ status: next })
      .eq("id", id)
      .eq("status", current)
      .select("id, fpl_gameweek_number, name, deadline, status, created_at")
      .maybeSingle();

    if (error) {
      console.error("Could not update gameweek:", error);
      return NextResponse.json(
        { error: "Could not update gameweek status." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "The gameweek changed. Refresh and try again." },
        { status: 409 }
      );
    }

    return NextResponse.json({ gameweek: data });
  }

  return NextResponse.json(
    { error: "Unknown action." },
    { status: 400 }
  );
}
