
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Please sign in first." },
      { status: 401 }
    );
  }

  const token = authorization.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Your session is invalid. Please sign in again." },
      { status: 401 }
    );
  }

  const { data: team, error: teamError } = await supabaseAdmin
    .from("fpl_teams")
    .select("id, verified")
    .eq("user_id", user.id)
    .maybeSingle();

  if (teamError || !team) {
    return NextResponse.json(
      { error: "Could not find your linked FPL team." },
      { status: 404 }
    );
  }

  if (team.verified) {
    return NextResponse.json({
      message: "Your team is already verified.",
    });
  }

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";

  for (let i = 0; i < 6; i++) {
    suffix += alphabet[randomInt(alphabet.length)];
  }

  const code = `FCLASH-${suffix}`;
  const expiresAt = new Date(
    Date.now() + 15 * 60 * 1000
  ).toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("fpl_teams")
    .update({
      verification_code: code,
      verification_expires_at: expiresAt,
    })
    .eq("id", team.id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not generate a verification code." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    code,
    expiresAt,
    instructions:
      "Temporarily add this code to your official FPL team name, then return to FPL Clash to verify ownership.",
  });
}
