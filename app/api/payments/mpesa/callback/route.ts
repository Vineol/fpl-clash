import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "M-Pesa callbacks are disabled." },
    { status: 503 }
  );
}