
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

function getNairobiTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return (
    value("year") +
    value("month") +
    value("day") +
    value("hour") +
    value("minute") +
    value("second")
  );
}

function normalizePhone(phone: string) {
  let cleaned = phone.replace(/[\s+\-()]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.slice(1);
  }

  if (!/^254[17]\d{8}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export async function POST(request: Request) {
  try {
    // Sandbox-only protection
    if (process.env.MPESA_ENVIRONMENT !== "sandbox") {
      return NextResponse.json(
        { error: "M-Pesa sandbox mode is not configured." },
        { status: 503 }
      );
    }

    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!accessToken) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: "Your session is invalid. Please sign in again." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const entryId = Number(body.entryId);
    const phone = normalizePhone(String(body.phone ?? ""));

    if (!Number.isSafeInteger(entryId) || entryId <= 0 || !phone) {
      return NextResponse.json(
        { error: "Please provide a valid entry and Kenyan phone number." },
        { status: 400 }
      );
    }

    // Verify that this entry belongs to the signed-in user.
    const { data: entry, error: entryError } = await supabaseAdmin
      .from("entries")
      .select(
        "id, user_id, entry_fee_pence, status, payment_expires_at"
      )
      .eq("id", entryId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (entryError || !entry) {
      return NextResponse.json(
        { error: "Entry not found." },
        { status: 404 }
      );
    }

    if (entry.status !== "pending") {
      return NextResponse.json(
        { error: "This entry is no longer awaiting payment." },
        { status: 409 }
      );
    }

    if (
      !entry.payment_expires_at ||
      new Date(entry.payment_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "Your payment window has expired. Please refresh your entries." },
        { status: 409 }
      );
    }

    const allowedFees = [5000, 10000, 25000];

    if (!allowedFees.includes(entry.entry_fee_pence)) {
      return NextResponse.json(
        { error: "Invalid competition entry fee." },
        { status: 400 }
      );
    }

    const amount = entry.entry_fee_pence / 100;

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const passkey = process.env.MPESA_PASSKEY;
    const shortcode = process.env.MPESA_SHORTCODE;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (
      !consumerKey ||
      !consumerSecret ||
      !passkey ||
      !shortcode ||
      !callbackUrl
    ) {
      return NextResponse.json(
        { error: "M-Pesa sandbox configuration is incomplete." },
        { status: 500 }
      );
    }

    if (!callbackUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "The M-Pesa callback URL must use HTTPS." },
        { status: 500 }
      );
    }

    // Create a pending payment record before contacting Daraja.
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: authData.user.id,
        entry_id: entry.id,
        amount_kes: amount,
        provider: "mpesa",
        status: "pending",
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      console.error("Payment record creation failed:", paymentError);
      return NextResponse.json(
        { error: "Could not prepare your payment. Please try again." },
        { status: 500 }
      );
    }

    // Request a Daraja sandbox access token.
    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${credentials}`,
        },
        cache: "no-store",
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          callback_result_desc: "Could not obtain Daraja sandbox access token.",
        })
        .eq("id", payment.id);

      console.error("Daraja token request failed:", tokenData);

      return NextResponse.json(
        { error: "Could not connect to M-Pesa sandbox." },
        { status: 502 }
      );
    }

    const timestamp = getNairobiTimestamp();

    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`
    ).toString("base64");

    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: "FPLCLASH",
          TransactionDesc: `FPL Clash Entry ${entry.id}`,
        }),
        cache: "no-store",
      }
    );

    const stkData = await stkResponse.json();

    if (
      !stkResponse.ok ||
      stkData.ResponseCode !== "0" ||
      !stkData.CheckoutRequestID
    ) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          callback_result_desc:
            stkData.errorMessage ??
            stkData.ResponseDescription ??
            "Daraja rejected the STK Push request.",
        })
        .eq("id", payment.id);

      console.error("Daraja STK Push failed:", stkData);

      return NextResponse.json(
        {
          error:
            stkData.errorMessage ??
            stkData.ResponseDescription ??
            "M-Pesa could not initiate the payment.",
        },
        { status: 502 }
      );
    }

    // Save the identifiers used to match the callback.
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID ?? null,
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("Could not save Daraja request IDs:", updateError);

      return NextResponse.json(
        {
          error: "The payment prompt was initiated, but its tracking record needs attention.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "M-Pesa payment prompt sent.",
      paymentId: payment.id,
      entryId: entry.id,
      amount,
      phone,
      checkoutRequestId: stkData.CheckoutRequestID,
    });
  } catch (error) {
    console.error("STK Push route error:", error);

    return NextResponse.json(
      { error: "Something went wrong while initiating payment." },
      { status: 500 }
    );
  }
}
