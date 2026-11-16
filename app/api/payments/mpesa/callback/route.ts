
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
  try {
    const payload = (await request.json()) as DarajaCallback;
    const callback = payload?.Body?.stkCallback;

    if (
      !callback ||
      !callback.CheckoutRequestID ||
      !callback.MerchantRequestID ||
      typeof callback.ResultCode !== "number"
    ) {
      console.error("Invalid Daraja callback payload.");

      return NextResponse.json(
        {
          ResultCode: 1,
          ResultDesc: "Invalid callback payload.",
        },
        { status: 400 }
      );
    }

    // Do not process competition payments while payments are disabled.
    if (process.env.PAYMENTS_ENABLED !== "true") {
      console.error("Competition payment callback received while payments are disabled.", {
        checkoutRequestId: callback.CheckoutRequestID,
        merchantRequestId: callback.MerchantRequestID,
        resultCode: callback.ResultCode,
        resultDescription: callback.ResultDesc,
      });

      // Acknowledge receipt to Safaricom, but do not confirm the entry.
      // The callback details remain in the server logs for manual investigation.
      return NextResponse.json({
        ResultCode: 0,
        ResultDesc: "Callback received but payment processing is disabled.",
      });
    }

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

    // Successful callbacks must contain payment details.
    if (
      callback.ResultCode === 0 &&
      (!Number.isFinite(amount) || amount === null || !receiptNumber)
    ) {
      console.error("Successful callback missing amount or receipt number.", {
        checkoutRequestId: callback.CheckoutRequestID,
      });

      return NextResponse.json({
        ResultCode: 0,
        ResultDesc: "Callback received for investigation.",
      });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "process_mpesa_callback",
      {
        p_checkout_request_id: callback.CheckoutRequestID,
        p_merchant_request_id: callback.MerchantRequestID,
        p_result_code: callback.ResultCode,
        p_result_desc: callback.ResultDesc ?? "No description supplied.",
        p_amount: amount,
        p_receipt_number: receiptNumber,
      }
    );

    if (error) {
      console.error("M-Pesa callback processing failed:", error);

      return NextResponse.json(
        {
          ResultCode: 1,
          ResultDesc: "Callback processing failed.",
        },
        { status: 500 }
      );
    }

    console.log("M-Pesa callback processed:", data);

    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: "Callback processed.",
    });
  } catch (error) {
    console.error("M-Pesa callback route error:", error);

    return NextResponse.json(
      {
        ResultCode: 1,
        ResultDesc: "Callback processing failed.",
      },
      { status: 500 }
    );
  }
}
