
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

async function authorizeAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !key || allowedEmails.length === 0) {
    return {
      error: "Admin access is not configured.",
      status: 500,
    };
  }

  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return { error: "Please sign in first.", status: 401 };
  }

  const authClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.email) {
    return { error: "Your session is invalid.", status: 401 };
  }

  if (!allowedEmails.includes(user.email.toLowerCase())) {
    return { error: "Admin access denied.", status: 403 };
  }

  return { user, status: 200 };
}

export async function GET(request: Request) {
  const auth = await authorizeAdmin(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const [
    { data: groups, error: groupsError },
    { data: gameweeks, error: gameweeksError },
    { data: entries, error: entriesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("competition_groups")
      .select("id, gameweek_id, group_number, max_participants, status")
      .order("gameweek_id", { ascending: true })
      .order("group_number", { ascending: true }),

    supabaseAdmin
      .from("gameweeks")
      .select("id, fpl_gameweek_number, name, deadline, status"),

    supabaseAdmin
      .from("entries")
      .select("group_id, status")
      .neq("status", "cancelled"),
  ]);

  if (groupsError || gameweeksError || entriesError) {
    console.error("Could not load group management data:", {
      groupsError,
      gameweeksError,
      entriesError,
    });

    return NextResponse.json(
      { error: "Could not load competition groups." },
      { status: 500 }
    );
  }

  const gameweekMap = new Map(
    (gameweeks ?? []).map((gameweek) => [gameweek.id, gameweek])
  );

  const participantCounts = new Map<number, number>();

  for (const entry of entries ?? []) {
    if (entry.group_id === null) continue;

    participantCounts.set(
      entry.group_id,
      (participantCounts.get(entry.group_id) ?? 0) + 1
    );
  }

  const result = (groups ?? []).map((group) => {
    const gameweek = gameweekMap.get(group.gameweek_id);
    const participantCount = participantCounts.get(group.id) ?? 0;

    return {
      ...group,
      gameweek_number: gameweek?.fpl_gameweek_number ?? null,
      gameweek_name: gameweek?.name ?? "Unknown gameweek",
      gameweek_status: gameweek?.status ?? "unknown",
      deadline: gameweek?.deadline ?? null,
      participant_count: participantCount,
      spaces_remaining: Math.max(
        0,
        group.max_participants - participantCount
      ),
      is_full: participantCount >= group.max_participants,
    };
  });

  return NextResponse.json({
    groups: result,
    summary: {
      total_groups: result.length,
      total_participants: result.reduce(
        (total, group) => total + group.participant_count,
        0
      ),
      full_groups: result.filter((group) => group.is_full).length,
      filling_groups: result.filter(
        (group) =>
          !group.is_full &&
          group.status !== "locked" &&
          group.status !== "completed"
      ).length,
    },
  });
}
