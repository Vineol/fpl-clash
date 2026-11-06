
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type FplEvent = {
  id: number;
  name: string;
  deadline_time: string | null;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
};

export async function POST(request: NextRequest) {
  const secret = process.env.FPL_SYNC_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "FPL_SYNC_SECRET is not configured." },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      { cache: "no-store" }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not retrieve official FPL data." },
        { status: 502 }
      );
    }

    const fplData = await response.json();
    const events = fplData.events as FplEvent[];

    if (
      !Array.isArray(events) ||
      events.length === 0 ||
      !events.some((event) => event.id >= 1 && event.id <= 38)
    ) {
      return NextResponse.json(
        { error: "The official FPL response was invalid." },
        { status: 502 }
      );
    }

    const now = Date.now();

    const rows = events
      .filter((event) => event.id >= 1 && event.id <= 38)
      .map((event) => {
        const deadline = event.deadline_time
          ? new Date(event.deadline_time)
          : null;

        let status: "upcoming" | "open" | "locked" | "completed";

        if (event.finished) {
          status = "completed";
        } else if (deadline && deadline.getTime() <= now) {
          status = "locked";
        } else if (event.is_next || event.is_current) {
          status = "open";
        } else {
          status = "upcoming";
        }

        return {
          fpl_gameweek_number: event.id,
          name: event.name,
          deadline: deadline?.toISOString() ?? null,
          status,
        };
      });

    const { error } = await supabaseAdmin
      .from("gameweeks")
      .upsert(rows, {
        onConflict: "fpl_gameweek_number",
      });

    if (error) {
      console.error("Gameweek sync failed:", error.message);

      return NextResponse.json(
        { error: "Could not save gameweeks to the database." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      synced: rows.length,
      gameweeks: rows,
    });
  } catch (error) {
    console.error("Gameweek sync error:", error);

    return NextResponse.json(
      { error: "Gameweek sync failed. Check the server logs." },
      { status: 500 }
    );
  }
}
