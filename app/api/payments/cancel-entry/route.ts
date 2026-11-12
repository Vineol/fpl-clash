import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "Please sign in again." },
        { status: 401 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authData.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Your session has expired. Please sign in again.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const entryId = Number(body.entryId);

    if (!Number.isSafeInteger(entryId) || entryId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid entry." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "cancel_pending_entry",
      {
        p_entry_id: entryId,
        p_user_id: authData.user.id,
      }
    );

    if (error) {
      console.error("Cancel pending entry failed:", error);

      return NextResponse.json(
        {
          success: false,
          error: "Could not cancel this reservation. Please try again.",
        },
        { status: 500 }
      );
    }

    if (!data?.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            data?.message ||
            "This reservation can no longer be cancelled.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data.message,
    });
  } catch (error) {
    console.error("Cancel entry route error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to process the cancellation.",
      },
      { status: 500 }
    );
  }
}