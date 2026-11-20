
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type FPLPlayer = {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  total_points: number;
  now_cost: number;
  photo: string;
  form: string;
};

type FPLTeam = {
  id: number;
  name: string;
  short_name: string;
};

type FPLEvent = {
  id: number;
  name: string;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
};

type FPLBootstrap = {
  elements: FPLPlayer[];
  teams: FPLTeam[];
  events: FPLEvent[];
  element_types: {
    id: number;
    singular_name_short: string;
  }[];
};

type FPLPick = {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  selling_price: number;
  purchase_price: number;
};

export async function GET(request: Request) {
  try {
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

    const { data: linkedTeam, error: teamError } = await supabaseAdmin
      .from("fpl_teams")
      .select("fpl_team_id, team_name, verified")
      .eq("user_id", user.id)
      .maybeSingle();

    if (teamError) {
      console.error("FPL team lookup error:", teamError);
      return NextResponse.json(
        { error: "Could not load your linked FPL team." },
        { status: 500 }
      );
    }

    if (!linkedTeam) {
      return NextResponse.json(
        { error: "You have not linked an FPL team yet." },
        { status: 404 }
      );
    }

    if (!linkedTeam.verified) {
      return NextResponse.json(
        { error: "Please verify ownership of your FPL team first." },
        { status: 403 }
      );
    }

    const teamId = Number(linkedTeam.fpl_team_id);

    const [bootstrapResponse, entryResponse] = await Promise.all([
      fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
        cache: "no-store",
        headers: { "User-Agent": "FPL-Clash/1.0" },
      }),
      fetch(`https://fantasy.premierleague.com/api/entry/${teamId}/`, {
        cache: "no-store",
        headers: { "User-Agent": "FPL-Clash/1.0" },
      }),
    ]);

    if (!bootstrapResponse.ok || !entryResponse.ok) {
      return NextResponse.json(
        { error: "The official FPL service is temporarily unavailable." },
        { status: 502 }
      );
    }

    const [bootstrap, entry] = (await Promise.all([
      bootstrapResponse.json(),
      entryResponse.json(),
    ])) as [FPLBootstrap, Record<string, unknown>];

    if (Number(entry.id) !== teamId) {
      return NextResponse.json(
        { error: "FPL returned an unexpected team." },
        { status: 502 }
      );
    }

    const currentEvent =
      bootstrap.events.find((event) => event.is_current) ??
      bootstrap.events.find((event) => event.is_next) ??
      [...bootstrap.events].reverse().find((event) => event.finished);

    if (!currentEvent) {
      return NextResponse.json(
        { error: "No available FPL gameweek was found." },
        { status: 503 }
      );
    }

    const picksResponse = await fetch(
      `https://fantasy.premierleague.com/api/entry/${teamId}/event/${currentEvent.id}/picks/`,
      {
        cache: "no-store",
        headers: { "User-Agent": "FPL-Clash/1.0" },
      }
    );

    const teamsById = new Map(
      bootstrap.teams.map((team) => [team.id, team])
    );

    const positionsById = new Map(
      bootstrap.element_types.map((position) => [
        position.id,
        position.singular_name_short,
      ])
    );

    const playersById = new Map(
      bootstrap.elements.map((player) => [player.id, player])
    );

    let picks: Array<Record<string, unknown>> = [];
    let picksAvailable = false;
    let picksMessage = "";

    if (picksResponse.ok) {
      const picksData = await picksResponse.json();
      const officialPicks = (picksData.picks ?? []) as FPLPick[];

      picks = officialPicks
        .map((pick) => {
          const player = playersById.get(pick.element);

          if (!player) return null;

          const club = teamsById.get(player.team);

          return {
            id: player.id,
            name: player.web_name,
            fullName: `${player.first_name} ${player.second_name}`,
            club: club?.name ?? "Unknown",
            clubCode: club?.short_name ?? "",
            position: positionsById.get(player.element_type) ?? "",
            elementType: player.element_type,
            totalPoints: player.total_points,
            form: player.form,
            price: (player.now_cost / 10).toFixed(1),
            photo: player.photo,
            squadPosition: pick.position,
            multiplier: pick.multiplier,
            captain: pick.is_captain,
            viceCaptain: pick.is_vice_captain,
            sellingPrice: (pick.selling_price / 10).toFixed(1),
            purchasePrice: (pick.purchase_price / 10).toFixed(1),
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      picksAvailable = picks.length > 0;
    } else {
      picksMessage =
        "Official FPL picks are not available for this gameweek yet.";
    }

    return NextResponse.json({
      team: {
        id: teamId,
        name: linkedTeam.team_name || entry.name,
        verified: true,
        playerFirstName: entry.player_first_name ?? "",
        playerLastName: entry.player_last_name ?? "",
        overallPoints: entry.summary_overall_points ?? null,
        overallRank: entry.summary_overall_rank ?? null,
        teamValue:
          typeof entry.last_deadline_value === "number"
            ? (entry.last_deadline_value / 10).toFixed(1)
            : null,
        bank:
          typeof entry.last_deadline_bank === "number"
            ? (entry.last_deadline_bank / 10).toFixed(1)
            : null,
      },
      gameweek: {
        id: currentEvent.id,
        name: currentEvent.name,
        finished: currentEvent.finished,
      },
      picks,
      picksAvailable,
      picksMessage,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("My FPL team API error:", error);

    return NextResponse.json(
      { error: "Could not retrieve your FPL squad. Please try again." },
      { status: 500 }
    );
  }
}
