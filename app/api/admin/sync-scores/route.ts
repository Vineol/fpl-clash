
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

  let gameweekNumber: number;

  try {
    const body = await request.json();
    gameweekNumber = Number(body.gameweek);
  } catch {
    return NextResponse.json(
      { error: "Provide a gameweek number in the request body." },
      { status: 400 }
    );
  }

  if (
    !Number.isInteger(gameweekNumber) ||
    gameweekNumber < 1 ||
    gameweekNumber > 38
  ) {
    return NextResponse.json(
      { error: "Gameweek must be a whole number from 1 to 38." },
      { status: 400 }
    );
  }

  try {
    // Confirm that the official FPL gameweek has finished.
    const bootstrapResponse = await fetch(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      { cache: "no-store" }
    );

    if (!bootstrapResponse.ok) {
      throw new Error("Could not retrieve official FPL gameweek status.");
    }

    const bootstrap = await bootstrapResponse.json();
    const event = bootstrap.events?.find(
      (item: { id: number }) => item.id === gameweekNumber
    );

    if (!event) {
      return NextResponse.json(
        { error: "That gameweek was not found in the official FPL data." },
        { status: 404 }
      );
    }

    if (event.finished !== true) {
      return NextResponse.json(
        {
          error:
            "This gameweek is not marked finished by FPL. Scores were not saved.",
        },
        { status: 409 }
      );
    }

    // Find the matching gameweek in FPL Clash.
    const { data: gameweek, error: gameweekError } =
      await supabaseAdmin
        .from("gameweeks")
        .select("id, fpl_gameweek_number")
        .eq("fpl_gameweek_number", gameweekNumber)
        .maybeSingle();

    if (gameweekError) throw gameweekError;

    if (!gameweek) {
      return NextResponse.json(
        {
          error:
            "This gameweek does not exist in FPL Clash. Create it first.",
        },
        { status: 404 }
      );
    }

    // Include pending entries for development testing, but exclude cancelled entries.
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
        gameweek: gameweekNumber,
        updated: 0,
        message: "There are no eligible entries for this gameweek.",
      });
    }

    // entries.fpl_team_id references fpl_teams.id, not the external FPL ID.
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

    // Process sequentially to reduce pressure on the FPL API.
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
        const response = await fetch(
          `https://fantasy.premierleague.com/api/entry/${officialTeamId}/event/${gameweekNumber}/picks/`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          failures.push({
            entryId: entry.id,
            error: `FPL returned HTTP ${response.status}.`,
          });
          continue;
        }

        const data = await response.json();
        const points = data?.entry_history?.points;

        if (!Number.isInteger(points) || points < 0) {
          failures.push({
            entryId: entry.id,
            error: "Valid gameweek points are not available.",
          });
          continue;
        }

        const { error: saveError } = await supabaseAdmin
          .from("scores")
          .upsert(
            {
              entry_id: entry.id,
              gameweek_id: gameweek.id,
              points,
            },
            { onConflict: "entry_id" }
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
              : "Unknown error while retrieving or saving scores.",
        });
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      gameweek: gameweekNumber,
      updated: results.length,
      failed: failures.length,
      results,
      failures,
      message:
        "Scores were retrieved from FPL and saved where possible. Re-running sync updates existing scores.",
    });
  } catch (error) {
    console.error("FPL score sync failed:", error);

    return NextResponse.json(
      { error: "Score syncing failed. Check the server terminal logs." },
      { status: 500 }
    );
  }
}
