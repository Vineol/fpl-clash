
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    id: string;
    gameweek: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  const { id, gameweek } = await params;

  if (!/^\d+$/.test(id) || !/^\d+$/.test(gameweek)) {
    return NextResponse.json(
      { error: "Team ID and gameweek must be positive numbers." },
      { status: 400 }
    );
  }

  const teamId = Number(id);
  const gameweekNumber = Number(gameweek);

  if (
    !Number.isSafeInteger(teamId) ||
    teamId <= 0 ||
    !Number.isSafeInteger(gameweekNumber) ||
    gameweekNumber < 1 ||
    gameweekNumber > 38
  ) {
    return NextResponse.json(
      { error: "Invalid team ID or gameweek. Gameweeks must be 1–38." },
      { status: 400 }
    );
  }

  const url =
    `https://fantasy.premierleague.com/api/entry/${teamId}` +
    `/event/${gameweekNumber}/picks/`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "FPL-Clash-Development/1.0",
      },
    });

    if (response.status === 404) {
      return NextResponse.json(
        {
          error:
            "No gameweek data was found. Check the team ID and gameweek, or try again later.",
        },
        { status: 404 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "The official FPL service could not provide the data.",
          upstreamStatus: response.status,
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    const history = data?.entry_history;

    if (
      !history ||
      typeof history.points !== "number" ||
      typeof history.total_points !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "FPL returned a response, but gameweek points are not available yet.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      source: "Official Fantasy Premier League API",
      teamId,
      gameweek: gameweekNumber,
      points: history.points,
      totalPoints: history.total_points,
      pointsOnBench: history.points_on_bench,
      transferCost: history.event_transfers_cost,
      playersSelected: Array.isArray(data.picks)
        ? data.picks.length
        : null,
      note: "Read-only test. No scores have been saved to Supabase.",
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not connect to the official FPL service. Please try again.",
      },
      { status: 502 }
    );
  }
}
