
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
      { error: "Score syncing is not configured on the server." },
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
    const body = await request.json().catch(() => ({}));
    const requestedGameweek =
      body.gameweek === undefined || body.gameweek === null
        ? null
        : Number(body.gameweek);

    if (
      requestedGameweek !== null &&
      (!Number.isInteger(requestedGameweek) ||
        requestedGameweek < 1 ||
        requestedGameweek > 38)
    ) {
      return NextResponse.json(
        { error: "Gameweek must be a whole number from 1 to 38." },
        { status: 400 }
      );
    }

    // Read the official FPL gameweek status.
    const bootstrapResponse = await fetch(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      { cache: "no-store" }
    );

    if (!bootstrapResponse.ok) {
      throw new Error("Could not retrieve official FPL gameweek data.");
    }

    const bootstrap = await bootstrapResponse.json();

    const event = requestedGameweek === null
      ? bootstrap.events?.find(
          (item: { is_current?: boolean }) => item.is_current === true
        )
      : bootstrap.events?.find(
          (item: { id: number }) => item.id === requestedGameweek
        );

    if (!event) {
      return NextResponse.json(
        {
          error:
            "No matching gameweek was found. Specify a gameweek number if needed.",
        },
        { status: 404 }
      );
    }

    if (event.finished === true) {
      return NextResponse.json(
        {
          error:
            "This gameweek is finished. Use the existing completed-gameweek sync instead.",
          gameweek: event.id,
        },
        { status: 409 }
      );
    }

    if (
      !event.deadline_time ||
      new Date(event.deadline_time).getTime() > Date.now()
    ) {
      return NextResponse.json(
        {
          error: "This gameweek has not started. No scores were changed.",
          gameweek: event.id,
        },
        { status: 409 }
      );
    }

    // Find the matching gameweek in FPL Clash.
    const { data: gameweek, error: gameweekError } =
      await supabaseAdmin
        .from("gameweeks")
        .select("id, fpl_gameweek_number")
        .eq("fpl_gameweek_number", event.id)
        .maybeSingle();

    if (gameweekError) throw gameweekError;

    if (!gameweek) {
      return NextResponse.json(
        { error: "This gameweek does not exist in FPL Clash." },
        { status: 404 }
      );
    }

    // Retrieve official live player points.
    const liveResponse = await fetch(
      `https://fantasy.premierleague.com/api/event/${event.id}/live/`,
      { cache: "no-store" }
    );

    if (!liveResponse.ok) {
      throw new Error("Could not retrieve live FPL player points.");
    }

    const liveData = await liveResponse.json();

    const playerPoints = new Map<number, number>(
      (liveData.elements ?? []).map(
        (element: {
          id: number;
          stats?: { total_points?: number };
        }) => [element.id, Number(element.stats?.total_points ?? 0)]
      )
    );

    // Include pending entries for development, but exclude cancelled entries.
    const { data: entries, error: entriesError } =
      await supabaseAdmin
        .from("entries")
        .select("id, fpl_team_id, status")
        .eq("gameweek_id", gameweek.id)
        .neq("status", "cancelled");

    if (entriesError) throw entriesError;

    if (!entries || entries.length === 0) {
      return NextResponse.json({
        success: true,
        gameweek: event.id,
        updated: 0,
        failed: 0,
        message: "There are no eligible entries for this gameweek.",
      });
    }

    // entries.fpl_team_id is the internal database ID.
    // fpl_teams.fpl_team_id is the official FPL team ID.
    const internalTeamIds = [
      ...new Set(entries.map((entry) => entry.fpl_team_id)),
    ];

    const { data: teams, error: teamsError } =
      await supabaseAdmin
        .from("fpl_teams")
        .select("id, fpl_team_id")
        .in("id", internalTeamIds);

    if (teamsError) throw teamsError;

    const officialTeamIds = new Map(
      (teams ?? []).map((team) => [team.id, team.fpl_team_id])
    );

    const results: Array<{
      entryId: number;
      points: number;
    }> = [];

    const failures: Array<{
      entryId: number;
      error: string;
    }> = [];

    // Process sequentially to avoid excessive requests to the FPL API.
    for (const entry of entries) {
      const officialTeamId = officialTeamIds.get(entry.fpl_team_id);

      if (!officialTeamId) {
        failures.push({
          entryId: entry.id,
          error: "Linked FPL team was not found.",
        });
        continue;
      }

      try {
        const picksResponse = await fetch(
          `https://fantasy.premierleague.com/api/entry/${officialTeamId}/event/${event.id}/picks/`,
          { cache: "no-store" }
        );

        if (!picksResponse.ok) {
          failures.push({
            entryId: entry.id,
            error: `FPL returned HTTP ${picksResponse.status} for team picks.`,
          });
          continue;
        }

        const picksData = await picksResponse.json();
        const picks = picksData?.picks;

        if (!Array.isArray(picks) || picks.length === 0) {
          failures.push({
            entryId: entry.id,
            error: "FPL picks are not available for this team yet.",
          });
          continue;
        }

        // Sum the official live player points using the multipliers
        // supplied by FPL for each pick.
        let points = 0;

        for (const pick of picks) {
          const elementId = Number(pick.element);
          const multiplier = Number(pick.multiplier ?? 0);
          const elementPoints = playerPoints.get(elementId);

          if (
            !Number.isFinite(elementId) ||
            !Number.isFinite(multiplier) ||
            elementPoints === undefined
          ) {
            throw new Error("Incomplete live points or pick data.");
          }

          points += elementPoints * multiplier;
        }

        // Subtract the official transfer cost when available.
        const transferCost = Number(
          picksData?.entry_history?.event_transfers_cost ?? 0
        );

        if (Number.isFinite(transferCost)) {
          points -= transferCost;
        }

        if (!Number.isFinite(points)) {
          throw new Error("The calculated score is invalid.");
        }

        const { error: saveError } = await supabaseAdmin
          .from("scores")
          .upsert(
            {
              entry_id: entry.id,
              gameweek_id: gameweek.id,
              points,
              finalized: false,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "entry_id,gameweek_id",
            }
          );

        if (saveError) throw saveError;

        results.push({
          entryId: entry.id,
          points,
        });
      } catch (error) {
        failures.push({
          entryId: entry.id,
          error:
            error instanceof Error
              ? error.message
              : "Unknown error while calculating or saving live points.",
        });
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      gameweek: event.id,
      updated: results.length,
      failed: failures.length,
      results,
      failures,
      finalized: false,
      message:
        "Provisional live scores were saved. Official final scores should be synced after FPL marks the gameweek finished.",
    });
  } catch (error) {
    console.error("FPL live-score sync failed:", error);

    return NextResponse.json(
      {
        error:
          "Live-score syncing failed. Check the server terminal logs.",
      },
      { status: 500 }
    );
  }
}
