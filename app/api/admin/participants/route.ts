
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

  const { data: entries, error } = await supabaseAdmin
    .from("entries")
    .select(`
      id,
      user_id,
      gameweek_id,
      group_id,
      fpl_team_id,
      status,
      created_at,
      gameweeks (
        fpl_gameweek_number,
        name,
        status,
        deadline
      ),
      competition_groups (
        group_number,
        max_participants,
        status
      ),
      fpl_teams (
        fpl_team_id,
        team_name,
        manager_name,
        verified
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load participant entries:", error);

    return NextResponse.json(
      { error: "Could not load participants." },
      { status: 500 }
    );
  }

  const userIds = [
    ...new Set((entries ?? []).map((entry) => entry.user_id)),
  ];

  const { data: users, error: usersError } =
    userIds.length > 0
      ? await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        })
      : { data: { users: [] }, error: null };

  if (usersError) {
    console.error("Could not load participant accounts:", usersError);

    return NextResponse.json(
      { error: "Could not load participant account details." },
      { status: 500 }
    );
  }

  const emailMap = new Map(
    (users?.users ?? [])
      .filter((user) => userIds.includes(user.id))
      .map((user) => [user.id, user.email ?? "No email"])
  );

  const participants = (entries ?? []).map((entry) => {
    const gameweekData = Array.isArray(entry.gameweeks)
      ? entry.gameweeks[0]
      : entry.gameweeks;

    const groupData = Array.isArray(entry.competition_groups)
      ? entry.competition_groups[0]
      : entry.competition_groups;

    const teamData = Array.isArray(entry.fpl_teams)
      ? entry.fpl_teams[0]
      : entry.fpl_teams;

    return {
      entry_id: entry.id,
      user_id: entry.user_id,
      email: emailMap.get(entry.user_id) ?? "No email",
      entry_status: entry.status,
      created_at: entry.created_at,
      gameweek_number: gameweekData?.fpl_gameweek_number ?? null,
      gameweek_name: gameweekData?.name ?? "Unknown gameweek",
      gameweek_status: gameweekData?.status ?? "unknown",
      deadline: gameweekData?.deadline ?? null,
      group_number: groupData?.group_number ?? null,
      group_capacity: groupData?.max_participants ?? null,
      group_status: groupData?.status ?? "unknown",
      official_fpl_team_id: teamData?.fpl_team_id ?? null,
      team_name: teamData?.team_name ?? "Unknown team",
      manager_name: teamData?.manager_name ?? null,
      team_verified: teamData?.verified ?? false,
    };
  });

  return NextResponse.json({
    participants,
    summary: {
      total_entries: participants.length,
      pending_entries: participants.filter(
        (entry) => entry.entry_status === "pending"
      ).length,
      confirmed_entries: participants.filter(
        (entry) => entry.entry_status === "confirmed"
      ).length,
      cancelled_entries: participants.filter(
        (entry) => entry.entry_status === "cancelled"
      ).length,
    },
  });
}
