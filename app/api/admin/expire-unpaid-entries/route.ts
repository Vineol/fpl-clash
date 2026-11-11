
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

function authorized(request: Request) {
  const secret = process.env.FPL_SYNC_SECRET;
  const supplied = request.headers.get("authorization") ?? "";

  if (!secret || !supplied.startsWith("Bearer ")) {
    return false;
  }

  const expectedBuffer = Buffer.from(`Bearer ${secret}`);
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request: Request) {
  if (!process.env.FPL_SYNC_SECRET) {
    return NextResponse.json(
      { error: "Expiry service is not configured." },
      { status: 500 }
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "expire_unpaid_entries"
    );

    if (error) {
      console.error("Expiry database function failed:", error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      expiredCount: data?.expired_count ?? 0,
      affectedGroups: data?.affected_groups ?? 0,
      message: "Unpaid entry expiry check completed.",
    });
  } catch (error) {
    console.error("Unpaid entry expiry failed:", error);

    return NextResponse.json(
      { error: "Could not expire unpaid entries." },
      { status: 500 }
    );
  }
}
