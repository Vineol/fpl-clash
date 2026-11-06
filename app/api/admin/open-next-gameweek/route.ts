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
      { error: "Gameweek updating is not configured." },
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
    // Get official FPL gameweek information.
    const bootstrapResponse = await fetch(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      { cache: "no-store" }
    );

    if (!bootstrapResponse.ok) {
      throw new Error("Could not retrieve FPL gameweeks.");
    }

    const bootstrap = await bootstrapResponse.json();

    // Get official FPL fixtures.
    const fixturesResponse = await fetch(
      "https://fantasy.premierleague.com/api/fixtures/",
      { cache: "no-store" }
    );

    if (!fixturesResponse.ok) {
      throw new Error("Could not retrieve FPL fixtures.");
    }

    const fixtures = await fixturesResponse.json();

    // Find FPL Clash gameweeks that are still upcoming.
    const { data: gameweeks, error: gameweeksError } =
      await supabaseAdmin
        .from("gameweeks")
        .select("id, fpl_gameweek_number, status")
        .eq("status", "upcoming")
        .order("fpl_gameweek_number", { ascending: true });

    if (gameweeksError) throw gameweeksError;

    if (!gameweeks || gameweeks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "There are no upcoming gameweeks to open.",
      });
    }

    // Only consider the earliest upcoming gameweek.
    const nextGameweek = gameweeks[0];
    const nextNumber = Number(nextGameweek.fpl_gameweek_number);
    const previousNumber = nextNumber - 1;

    if (nextNumber < 2 || nextNumber > 38) {
      return NextResponse.json({
        success: true,
        message: "No eligible next gameweek was found.",
      });
    }

    // Confirm that the previous gameweek exists in official FPL data.
    const previousEvent = bootstrap.events?.find(
      (event: { id: number }) => event.id === previousNumber
    );

    if (!previousEvent) {
      throw new Error("Previous gameweek was not found in FPL data.");
    }

    // Check every fixture from the previous gameweek.
    const previousFixtures = fixtures.filter(
      (fixture: { event?: number | null }) =>
        fixture.event === previousNumber
    );

    if (previousFixtures.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No previous-gameweek fixtures were returned. Nothing changed.",
        previousGameweek: previousNumber,
      });
    }

    const allFixturesFinished = previousFixtures.every(
      (fixture: { finished?: boolean }) => fixture.finished === true
    );

    if (!allFixturesFinished) {
      return NextResponse.json({
        success: true,
        opened: false,
        previousGameweek: previousNumber,
        nextGameweek: nextNumber,
        finishedFixtures: previousFixtures.filter(
          (fixture: { finished?: boolean }) => fixture.finished === true
        ).length,
        totalFixtures: previousFixtures.length,
        message: "The previous gameweek still has unfinished fixtures.",
      });
    }

    // Open the next gameweek.
    const { data: updatedGameweek, error: updateError } =
      await supabaseAdmin
        .from("gameweeks")
        .update({ status: "open" })
        .eq("id", nextGameweek.id)
        .eq("status", "upcoming")
        .select("id, fpl_gameweek_number, status")
        .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedGameweek) {
      return NextResponse.json({
        success: true,
        opened: false,
        message: "The gameweek was not updated. It may already have changed.",
      });
    }

    return NextResponse.json({
      success: true,
      opened: true,
      previousGameweek: previousNumber,
      nextGameweek: updatedGameweek.fpl_gameweek_number,
      status: updatedGameweek.status,
      message: `Gameweek ${nextNumber} is now open for entries.`,
    });
  } catch (error) {
    console.error("Automatic gameweek opening failed:", error);

    return NextResponse.json(
      {
        error: "Could not automatically open the next gameweek.",
      },
      { status: 500 }
    );
  }
}