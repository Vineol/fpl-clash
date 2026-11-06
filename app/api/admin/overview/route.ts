
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (!supabaseUrl || !publishableKey || adminEmails.length === 0) {
      return NextResponse.json(
        { error: "Admin access is not configured." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return NextResponse.json(
        { error: "Please sign in first." },
        { status: 401 }
      );
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user?.email) {
      return NextResponse.json(
        { error: "Your session is invalid. Please sign in again." },
        { status: 401 }
      );
    }

    if (!adminEmails.includes(user.email.toLowerCase())) {
      return NextResponse.json(
        { error: "You are not authorized to access the admin dashboard." },
        { status: 403 }
      );
    }

    const [
      gameweeksResult,
      groupsResult,
      entriesResult,
      scoresResult,
      recentEntriesResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("gameweeks")
        .select("*", { count: "exact", head: true }),

      supabaseAdmin
        .from("competition_groups")
        .select("*", { count: "exact", head: true }),

      supabaseAdmin
        .from("entries")
        .select("*", { count: "exact", head: true })
        .neq("status", "cancelled"),

      supabaseAdmin
        .from("scores")
        .select("*", { count: "exact", head: true }),

      supabaseAdmin
        .from("entries")
        .select("id, status, gameweek_id, group_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const errors = [
      gameweeksResult.error,
      groupsResult.error,
      entriesResult.error,
      scoresResult.error,
      recentEntriesResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Admin overview query failed:", errors);
      return NextResponse.json(
        { error: "Could not load admin statistics." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      stats: {
        gameweeks: gameweeksResult.count ?? 0,
        groups: groupsResult.count ?? 0,
        entries: entriesResult.count ?? 0,
        scores: scoresResult.count ?? 0,
      },
      recentEntries: recentEntriesResult.data ?? [],
    });
  } catch (error) {
    console.error("Admin overview failed:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
