import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "M-Pesa payments are currently unavailable.",
    },
    { status: 503 }
  );
}