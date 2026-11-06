
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
    .select(
      "id, fpl_team_id, team_name, verified, verification_code, verification_expires_at"
    )
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
      verified: true,
      message: "Your team is already verified.",
      teamName: team.team_name,
    });
  }

  if (!team.verification_code || !team.verification_expires_at) {
    return NextResponse.json(
      { error: "Generate a verification code first." },
      { status: 400 }
    );
  }

  if (new Date(team.verification_expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Your code has expired. Generate a new one." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://fantasy.premierleague.com/api/entry/${team.fpl_team_id}/`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "FPL is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    const entry = await response.json();

    if (Number(entry.id) !== Number(team.fpl_team_id)) {
      return NextResponse.json(
        { error: "FPL returned an unexpected team ID." },
        { status: 502 }
      );
    }

    const officialTeamName = String(entry.name ?? "");

    if (!officialTeamName.includes(team.verification_code)) {
      return NextResponse.json(
        {
          verified: false,
          error:
            "The code was not found in your official FPL team name. Update the name and try again.",
        },
        { status: 400 }
      );
    }

    const { data: updatedTeam, error: updateError } =
      await supabaseAdmin
        .from("fpl_teams")
        .update({
          verified: true,
          verification_code: null,
          verification_expires_at: null,
          team_name: officialTeamName,
        })
        .eq("id", team.id)
        .eq("user_id", user.id)
        .eq("verified", false)
        .select("fpl_team_id, team_name, verified")
        .maybeSingle();

    if (updateError || !updatedTeam) {
      return NextResponse.json(
        { error: "Could not save verification. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      verified: true,
      teamName: updatedTeam.team_name,
      message: "FPL team ownership verified successfully.",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to FPL. Please try again later." },
      { status: 502 }
    );
  }
}
