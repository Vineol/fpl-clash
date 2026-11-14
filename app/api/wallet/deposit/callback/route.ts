
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type CallbackItem = {
  Name?: string;
  Value?: string | number;
};

type DarajaCallback = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: CallbackItem[];
      };
    };
  };
};

export async function POST(request: Request) {
  console.log("WALLET CALLBACK RECEIVED:", {
    timestamp: new Date().toISOString(),
    method: request.method,
    contentType: request.headers.get("content-type"),
  });

  try {
    const payload = (await request.json()) as DarajaCallback;
    const callback = payload?.Body?.stkCallback;

    if (
      !callback?.CheckoutRequestID ||
      !callback.MerchantRequestID ||
      typeof callback.ResultCode !== "number"
    ) {
      console.error("Invalid wallet callback payload.");

      return NextResponse.json(
        { ResultCode: 1, ResultDesc: "Invalid callback." },
        { status: 400 }
      );
    }

    console.log("WALLET CALLBACK DETAILS:", {
      checkoutRequestId: callback.CheckoutRequestID,
      merchantRequestId: callback.MerchantRequestID,
      resultCode: callback.ResultCode,
    });

    const items = callback.CallbackMetadata?.Item ?? [];

    const getItem = (name: string) =>
      items.find((item) => item.Name === name)?.Value;

    const amountValue = getItem("Amount");
    const receiptValue = getItem("MpesaReceiptNumber");

    const amount =
      typeof amountValue === "number"
        ? amountValue
        : typeof amountValue === "string"
          ? Number(amountValue)
          : null;

    const receiptNumber =
      typeof receiptValue === "string" ? receiptValue : null;

    if (
      callback.ResultCode === 0 &&
      (!Number.isFinite(amount) || amount === null || !receiptNumber)
    ) {
      console.error("Wallet callback missing payment details.", {
        checkoutRequestId: callback.CheckoutRequestID,
      });

      return NextResponse.json(
        { ResultCode: 1, ResultDesc: "Payment details missing." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "process_wallet_deposit_callback",
      {
        p_checkout_request_id: callback.CheckoutRequestID,
        p_merchant_request_id: callback.MerchantRequestID,
        p_result_code: callback.ResultCode,
        p_result_desc: callback.ResultDesc ?? "No description supplied.",
        p_amount: amount,
        p_receipt_number: receiptNumber,
      }
    );

    if (error || data?.success !== true) {
      console.error("Wallet callback processing failed:", error ?? data);

      return NextResponse.json(
        { ResultCode: 1, ResultDesc: "Wallet deposit processing failed." },
        { status: 500 }
      );
    }

    console.log("Wallet deposit callback processed:", data);

    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: "Wallet deposit processed.",
    });
  } catch (error) {
    console.error("Wallet callback route error:", error);

    return NextResponse.json(
      { ResultCode: 1, ResultDesc: "Callback processing failed." },
      { status: 500 }
    );
  }
}
