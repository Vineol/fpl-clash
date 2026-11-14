
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type MpesaEnvironment = "sandbox" | "production";

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
  const cleaned = phone.replace(/[\s+\-()]/g, "");

  let normalized = cleaned;

  if (normalized.startsWith("0")) {
    normalized = "254" + normalized.slice(1);
  }

  return /^254[17]\d{8}$/.test(normalized)
    ? normalized
    : null;
}

export async function POST(request: Request) {
  let depositId: string | null = null;

  try {
    // --------------------------------------------------
    // 1. ENVIRONMENT CONFIGURATION
    // --------------------------------------------------

    const environment =
      (process.env.MPESA_ENVIRONMENT || "sandbox") as MpesaEnvironment;

    if (environment !== "sandbox" && environment !== "production") {
      return NextResponse.json(
        { error: "Invalid M-Pesa environment configuration." },
        { status: 500 }
      );
    }

    // Production remains disabled until explicitly approved.
    if (
      environment === "production" &&
      process.env.MPESA_PRODUCTION_ENABLED !== "true"
    ) {
      return NextResponse.json(
        {
          error:
            "Live M-Pesa payments are disabled. Production activation is required.",
        },
        { status: 503 }
      );
    }

    const baseUrl =
      environment === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    // Use separate credentials to prevent mixing environments.
    const consumerKey =
      environment === "production"
        ? process.env.MPESA_PRODUCTION_CONSUMER_KEY
        : process.env.MPESA_CONSUMER_KEY;

    const consumerSecret =
      environment === "production"
        ? process.env.MPESA_PRODUCTION_CONSUMER_SECRET
        : process.env.MPESA_CONSUMER_SECRET;

    const passkey =
      environment === "production"
        ? process.env.MPESA_PRODUCTION_PASSKEY
        : process.env.MPESA_PASSKEY;

    const shortcode =
      environment === "production"
        ? process.env.MPESA_PRODUCTION_SHORTCODE
        : process.env.MPESA_SHORTCODE;

    const callbackUrl = process.env.WALLET_MPESA_CALLBACK_URL;

    if (
      !consumerKey ||
      !consumerSecret ||
      !passkey ||
      !shortcode ||
      !callbackUrl ||
      !callbackUrl.startsWith("https://")
    ) {
      console.error("Wallet M-Pesa configuration incomplete.", {
        environment,
        callbackUrlConfigured: Boolean(callbackUrl),
        callbackUrlIsHttps: callbackUrl?.startsWith("https://") ?? false,
        consumerKeyConfigured: Boolean(consumerKey),
        consumerSecretConfigured: Boolean(consumerSecret),
        passkeyConfigured: Boolean(passkey),
        shortcodeConfigured: Boolean(shortcode),
      });

      return NextResponse.json(
        { error: "Wallet M-Pesa configuration is incomplete." },
        { status: 500 }
      );
    }

    // --------------------------------------------------
    // 2. AUTHENTICATE USER
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 3. VALIDATE DEPOSIT DETAILS
    // --------------------------------------------------

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
        {
          error:
            "Enter a whole-number deposit amount and a valid Kenyan phone number.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. FIND USER WALLET
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 5. CREATE PENDING DEPOSIT
    // --------------------------------------------------

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

    depositId = deposit.id;

    // --------------------------------------------------
    // 6. GENERATE DARAJA ACCESS TOKEN
    // --------------------------------------------------

    const credentials = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
        cache: "no-store",
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      await supabaseAdmin
        .from("wallet_deposits")
        .update({ status: "failed" })
        .eq("id", deposit.id);

      console.error("Wallet Daraja OAuth failed:", {
        environment,
        httpStatus: tokenResponse.status,
        response: tokenData,
      });

      return NextResponse.json(
        { error: "Could not connect to M-Pesa." },
        { status: 502 }
      );
    }

    // --------------------------------------------------
    // 7. GENERATE STK PASSWORD
    // --------------------------------------------------

    const timestamp = getNairobiTimestamp();

    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`
    ).toString("base64");

    // --------------------------------------------------
    // 8. INITIATE STK PUSH
    // --------------------------------------------------

    console.log("Initiating wallet STK Push:", {
      depositId: deposit.id,
      amountKes,
      callbackUrl,
      environment,
      shortcode,
    });

    const stkResponse = await fetch(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
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

    console.log("Wallet STK Push response:", {
      depositId: deposit.id,
      environment,
      httpStatus: stkResponse.status,
      responseCode: stkData.ResponseCode,
      responseDescription: stkData.ResponseDescription,
      checkoutRequestId: stkData.CheckoutRequestID,
      merchantRequestId: stkData.MerchantRequestID,
      customerMessage: stkData.CustomerMessage,
      errorCode: stkData.errorCode,
      errorMessage: stkData.errorMessage,
    });

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

      return NextResponse.json(
        {
          error:
            stkData.errorMessage ??
            stkData.ResponseDescription ??
            "M-Pesa could not initiate the deposit.",
        },
        { status: 502 }
      );
    }

    // --------------------------------------------------
    // 9. SAVE DARAJA TRANSACTION IDENTIFIERS
    // --------------------------------------------------

    const { error: updateError } = await supabaseAdmin
      .from("wallet_deposits")
      .update({
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
      })
      .eq("id", deposit.id);

    if (updateError) {
      console.error("Could not save wallet STK identifiers:", {
        depositId: deposit.id,
        error: updateError,
      });

      return NextResponse.json(
        {
          error:
            "The payment prompt was sent, but its tracking record needs attention.",
        },
        { status: 500 }
      );
    }

    console.log("Wallet STK request successfully registered:", {
      depositId: deposit.id,
      checkoutRequestId: stkData.CheckoutRequestID,
      merchantRequestId: stkData.MerchantRequestID,
      callbackUrl,
      environment,
    });

    return NextResponse.json({
      success: true,
      message: "Wallet deposit prompt sent.",
      depositId: deposit.id,
      amount: amountKes,
      phone,
    });
  } catch (error) {
    console.error("Wallet STK Push error:", {
      depositId,
      error,
    });

    return NextResponse.json(
      { error: "Something went wrong while initiating your deposit." },
      { status: 500 }
    );
  }
}
