
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
    value("year") + value("month") + value("day") +
    value("hour") + value("minute") + value("second")
  );
}

function normalizePhone(phone: string) {
  let cleaned = phone.replace(/[\s+\-()]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.slice(1);
  }

  return /^254[17]\d{8}$/.test(cleaned) ? cleaned : null;
}

export async function POST(request: Request) {
  try {
    if (process.env.MPESA_ENVIRONMENT !== "sandbox") {
      return NextResponse.json(
        { error: "Wallet deposits are currently sandbox-only." },
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
    const amountKes = Number(body.amount);
    const phone = normalizePhone(String(body.phone ?? ""));

    if (
      !Number.isSafeInteger(amountKes) ||
      amountKes < 1 ||
      amountKes > 150000 ||
      !phone
    ) {
      return NextResponse.json(
        { error: "Enter a whole-number deposit amount and a valid Kenyan phone number." },
        { status: 400 }
      );
    }

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallets")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: "Your wallet could not be found." },
        { status: 404 }
      );
    }

    const callbackUrl = process.env.WALLET_MPESA_CALLBACK_URL;
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const passkey = process.env.MPESA_PASSKEY;
    const shortcode = process.env.MPESA_SHORTCODE;

    if (
      !callbackUrl ||
      !consumerKey ||
      !consumerSecret ||
      !passkey ||
      !shortcode ||
      !callbackUrl.startsWith("https://")
    ) {
      return NextResponse.json(
        { error: "Wallet M-Pesa configuration is incomplete." },
        { status: 500 }
      );
    }

    const { data: deposit, error: depositError } = await supabaseAdmin
      .from("wallet_deposits")
      .insert({
        wallet_id: wallet.id,
        user_id: authData.user.id,
        amount_minor_units: amountKes * 100,
        phone_number: phone,
        provider: "mpesa",
        status: "pending",
      })
      .select("id")
      .single();

    if (depositError || !deposit) {
      console.error("Wallet deposit creation failed:", depositError);
      return NextResponse.json(
        { error: "Could not prepare your wallet deposit." },
        { status: 500 }
      );
    }

    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: { Authorization: `Basic ${credentials}` },
        cache: "no-store",
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      await supabaseAdmin
        .from("wallet_deposits")
        .update({ status: "failed" })
        .eq("id", deposit.id);

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
          Amount: amountKes,
          PartyA: phone,
          PartyB: shortcode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl,
          AccountReference: "FPLWALLET",
          TransactionDesc: "FPL Clash Wallet Deposit",
        }),
        cache: "no-store",
      }
    );

    const stkData = await stkResponse.json();

    if (
      !stkResponse.ok ||
      stkData.ResponseCode !== "0" ||
      !stkData.CheckoutRequestID ||
      !stkData.MerchantRequestID
    ) {
      await supabaseAdmin
        .from("wallet_deposits")
        .update({ status: "failed" })
        .eq("id", deposit.id);

      console.error("Wallet STK Push failed:", stkData);

      return NextResponse.json(
        { error: stkData.errorMessage ?? stkData.ResponseDescription ?? "M-Pesa could not initiate the deposit." },
        { status: 502 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("wallet_deposits")
      .update({
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
      })
      .eq("id", deposit.id);

    if (updateError) {
      console.error("Could not save wallet STK identifiers:", updateError);

      return NextResponse.json(
        { error: "The payment prompt was sent, but its tracking record needs attention." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Wallet deposit prompt sent.",
      depositId: deposit.id,
      amount: amountKes,
      phone,
    });
  } catch (error) {
    console.error("Wallet STK Push error:", error);

    return NextResponse.json(
      { error: "Something went wrong while initiating your deposit." },
      { status: 500 }
    );
  }
}
