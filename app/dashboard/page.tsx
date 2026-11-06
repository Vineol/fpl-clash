"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type FPLTeam = {
  fpl_team_id: number;
  team_name: string | null;
  verified: boolean;
};

type Entry = {
  entry_id: number;
  entry_status: string;
  entry_created_at: string;
  gameweek_number: number;
  gameweek_name: string;
  gameweek_deadline: string;
  gameweek_status: string;
  group_number: number;
  max_participants: number;
  group_status: string;
  team_name: string;
  official_fpl_team_id: number;
  participant_count: number;
};

type LeaderboardRow = Record<string, unknown>;

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  });
}

function getCountdown(deadline: string, now: number) {
  const target = new Date(deadline).getTime();

  if (!Number.isFinite(target)) return "Deadline unavailable";

  const difference = target - now;

  if (difference <= 0) return "Deadline passed";

  const days = Math.floor(difference / 86400000);
  const hours = Math.floor((difference % 86400000) / 3600000);
  const minutes = Math.floor((difference % 3600000) / 60000);
  const seconds = Math.floor((difference % 60000) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;

  return `${minutes}m ${seconds}s`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  return "—";
}

function getRowValue(
  row: LeaderboardRow,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }

  return null;
}

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [team, setTeam] = useState<FPLTeam | null>(null);
  const [teamError, setTeamError] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesError, setEntriesError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardEntryId, setLeaderboardEntryId] = useState<number | null>(
    null,
  );
  const [leaderboardError, setLeaderboardError] = useState("");
  const [now, setNow] = useState(0);
  const refreshInProgress = useRef(false);

  const loadDashboard = useCallback(async (showRefresh = false) => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;

    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setTeamError("");
    setEntriesError("");
    setLeaderboardError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/auth");
        return;
      }

      setEmail(authData.user.email ?? "");

      const [teamResult, entriesResult] = await Promise.all([
        supabase
          .from("fpl_teams")
          .select("fpl_team_id, team_name, verified")
          .eq("user_id", authData.user.id)
          .maybeSingle(),
        supabase.rpc("get_my_entries"),
      ]);

      if (teamResult.error) {
        console.error("Could not load FPL team:", teamResult.error.message);
        setTeamError("Team details could not be loaded.");
        setTeam(null);
      } else if (teamResult.data) {
        setTeam({
          fpl_team_id: Number(teamResult.data.fpl_team_id),
          team_name: teamResult.data.team_name,
          verified: teamResult.data.verified,
        });
      } else {
        setTeam(null);
      }

      if (entriesResult.error) {
        console.error("Could not load entries:", entriesResult.error.message);
        setEntriesError("Your entries could not be loaded. Try refreshing.");
        setEntries([]);
      } else {
        const loadedEntries = (entriesResult.data ?? []) as Entry[];
        setEntries(loadedEntries);

        const preferredEntry =
          loadedEntries.find(
            (entry) =>
              entry.entry_status !== "cancelled" &&
              entry.gameweek_number >= 1 &&
              entry.gameweek_number <= 38,
          ) ??
          loadedEntries.find((entry) => entry.entry_status !== "cancelled");

        if (preferredEntry) {
          setLeaderboardEntryId(preferredEntry.entry_id);

          const { data: leaderboardData, error: leaderboardQueryError } =
            await supabase.rpc("get_my_group_leaderboard", {
              p_entry_id: preferredEntry.entry_id,
            });

          if (leaderboardQueryError) {
            console.error(
              "Could not load leaderboard:",
              leaderboardQueryError.message,
            );
            setLeaderboardError("Leaderboard preview is temporarily unavailable.");
            setLeaderboard([]);
          } else {
            setLeaderboard(
              (leaderboardData ?? []) as LeaderboardRow[],
            );
          }
        } else {
          setLeaderboard([]);
          setLeaderboardEntryId(null);
        }
      }
    } catch (error) {
      console.error("Dashboard refresh failed:", error);
      setEntriesError("Something went wrong while loading your dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshInProgress.current = false;
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();

    const countdownTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadDashboard(true);
      }
    }, 60000);

    return () => {
      window.clearInterval(countdownTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadDashboard]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  const teamReady = Boolean(team?.verified);
  const activeEntries = entries.filter(
    (entry) => entry.entry_status !== "cancelled",
  );

  // Show only entries for gameweeks that are still upcoming or open.
  // Historical entries remain available through My Entries and leaderboards.
  const visibleEntries = activeEntries.filter((entry) =>
    ["upcoming", "open"].includes(
      (entry.gameweek_status || "").toLowerCase(),
    ),
  );

  const firstEntry =
    activeEntries.find(
      (entry) =>
        entry.gameweek_number >= 1 &&
        entry.gameweek_number <= 38,
    ) ?? activeEntries[0];

  const personalLeaderboardRow = leaderboard.find((row) => {
    const rowEntryId = getRowValue(row, ["entry_id", "my_entry_id"]);
    return rowEntryId !== null && Number(rowEntryId) === leaderboardEntryId;
  });

  const myRank = personalLeaderboardRow
    ? getRowValue(personalLeaderboardRow, [
        "rank",
        "position",
        "group_rank",
        "rank_position",
      ])
    : null;

  const myPoints = personalLeaderboardRow
    ? getRowValue(personalLeaderboardRow, [
        "points",
        "total_points",
        "gameweek_points",
        "score",
      ])
    : null;

  const leaderboardRows = leaderboard.slice(0, 5);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080D0B] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-green-400/20 border-t-green-400" />
          <p className="text-sm text-slate-400">Loading your FPL Clash dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080D0B] px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <Link href="/" className="text-xl font-black tracking-widest">
            FPL <span className="text-green-400">CLASH</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-green-400/50 hover:text-white disabled:opacity-50"
            >
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>
            <button
              onClick={() => void signOut()}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="mt-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-green-400">
              Player dashboard
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Welcome back.
            </h1>
            <p className="mt-2 break-all text-sm text-slate-400">{email}</p>
          </div>

          <div className="flex items-center gap-2 self-start rounded-full border border-green-400/20 bg-green-400/5 px-3 py-2 text-sm text-green-300 sm:self-auto">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            {teamReady ? "FPL team verified" : "Account overview"}
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#101814] p-5">
            <p className="text-sm text-slate-400">My entries</p>
            <p className="mt-3 text-3xl font-black">{activeEntries.length}</p>
            <p className="mt-2 text-xs text-slate-500">Non-cancelled entries</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#101814] p-5">
            <p className="text-sm text-slate-400">Group format</p>
            <p className="mt-3 text-3xl font-black">10 <span className="text-base font-medium text-slate-400">players</span></p>
            <p className="mt-2 text-xs text-slate-500">Participants per group</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#101814] p-5">
            <p className="text-sm text-slate-400">Planned entry fee</p>
            <p className="mt-3 text-3xl font-black">KSh 50</p>
            <p className="mt-2 text-xs text-amber-300">Payments not enabled</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#101814] p-5">
            <p className="text-sm text-slate-400">FPL account</p>
            <p className={`mt-3 text-2xl font-black ${teamReady ? "text-green-400" : "text-amber-300"}`}>
              {teamError ? "Unavailable" : teamReady ? "Verified" : team ? "Pending" : "Not linked"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {team?.team_name || "Official FPL team"}
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-[#101814] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-400">
                  Competition centre
                </p>
                <h2 className="mt-2 text-2xl font-black">My gameweeks</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Track your entries, group progress and upcoming deadlines.
                </p>
              </div>
              <Link
                href="/competitions"
                className="rounded-xl bg-green-400 px-4 py-2.5 text-sm font-bold text-[#07100A] transition hover:bg-green-300"
              >
                Find a gameweek ↗
              </Link>
            </div>

            {entriesError ? (
              <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                <p className="text-sm text-amber-200">{entriesError}</p>
                <button
                  onClick={() => void loadDashboard(true)}
                  className="mt-3 text-sm font-bold text-green-300"
                >
                  Try again →
                </button>
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-white/15 p-6">
                <p className="font-bold">Your first competition starts here.</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Browse available gameweeks and join a group to see your competition progress here.
                </p>
                <Link
                  href="/competitions"
                  className="mt-4 inline-block text-sm font-bold text-green-300 hover:text-green-200"
                >
                  Browse competitions →
                </Link>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {visibleEntries.slice(0, 4).map((entry) => {
                  const deadlinePassed =
                    !entry.gameweek_deadline ||
                    new Date(entry.gameweek_deadline).getTime() <= now;

                  const maxPlayers = Number(entry.max_participants) || 10;
                  const players = Number(entry.participant_count) || 0;
                  const progress = Math.min(100, (players / maxPlayers) * 100);

                  return (
                    <article
                      key={entry.entry_id}
                      className="rounded-xl border border-white/10 bg-[#0B110E] p-4 transition hover:border-green-400/30 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-green-400">
                            FPL Gameweek {entry.gameweek_number}
                          </p>
                          <h3 className="mt-1 text-lg font-bold">
                            {entry.gameweek_name || `Gameweek ${entry.gameweek_number}`}
                          </h3>
                          <p className="mt-1 text-sm text-slate-400">
                            Group {entry.group_number}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold capitalize text-slate-300">
                          {entry.entry_status}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-slate-500">Group progress</p>
                          <p className="mt-1 font-bold">
                            {players}/{maxPlayers} players
                          </p>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-green-400 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Gameweek deadline</p>
                          <p className="mt-1 font-semibold">
                            {getCountdown(entry.gameweek_deadline, now)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(entry.gameweek_deadline)} EAT
                          </p>
                        </div>
                      </div>

                      {deadlinePassed && (
                        <p className="mt-3 text-xs text-amber-300">
                          The deadline has passed or is unavailable.
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-3 border-t border-white/10 pt-4">
                        <Link
                          href={`/leaderboard?entryId=${entry.entry_id}`}
                          className="text-sm font-bold text-green-300 hover:text-green-200"
                        >
                          View group leaderboard →
                        </Link>
                        <Link
                          href="/my-entries"
                          className="text-sm text-slate-400 hover:text-white"
                        >
                          Entry details
                        </Link>
                      </div>
                    </article>
                  );
                })}

                {visibleEntries.length > 4 && (
                  <Link
                    href="/my-entries"
                    className="block pt-2 text-sm font-bold text-green-300"
                  >
                    View all {visibleEntries.length} entries →
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-green-400/20 bg-gradient-to-br from-[#14241A] to-[#101814] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-400">
                  My FPL team
                </p>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${teamReady ? "bg-green-400/10 text-green-300" : "bg-amber-400/10 text-amber-300"}`}>
                  {teamReady ? "✓ Verified" : team ? "Unverified" : "Not linked"}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-black">
                {team?.team_name || "Your FPL team"}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {team
                  ? `Official FPL team ID: ${team.fpl_team_id}`
                  : "Link your official FPL team to get started."}
              </p>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-slate-400">Latest competition points</p>
                <p className="mt-2 text-3xl font-black">
                  {displayValue(myPoints)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {myPoints === null
                    ? "Points appear when available in your group leaderboard."
                    : "Based on the selected entry's leaderboard data."}
                </p>
              </div>

              <button
                onClick={() => router.push("/link-team")}
                className="mt-5 w-full rounded-xl bg-green-400 px-4 py-3 font-bold text-[#07100A] transition hover:bg-green-300"
              >
                {team ? "Manage FPL team" : "Link FPL team"} →
              </button>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#101814] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-400">
                    Group standings
                  </p>
                  <h2 className="mt-2 text-xl font-black">Leaderboard preview</h2>
                </div>
                <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                  Top 5
                </span>
              </div>

              {!firstEntry ? (
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  Join a competition to unlock your group standings.
                </p>
              ) : leaderboardError ? (
                <div className="mt-4">
                  <p className="text-sm text-slate-400">{leaderboardError}</p>
                  <Link
                    href={`/leaderboard?entryId=${firstEntry.entry_id}`}
                    className="mt-3 inline-block text-sm font-bold text-green-300"
                  >
                    Open full leaderboard →
                  </Link>
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  No leaderboard rows are available yet. Scores will appear here when the leaderboard data is available.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {leaderboardRows.map((row, index) => {
                    const rowRank = getRowValue(row, [
                      "rank",
                      "position",
                      "group_rank",
                      "rank_position",
                    ]);
                    const rowName = getRowValue(row, [
                      "team_name",
                      "fpl_team_name",
                      "name",
                      "display_name",
                    ]);
                    const rowPoints = getRowValue(row, [
                      "points",
                      "total_points",
                      "gameweek_points",
                      "score",
                    ]);
                    const isMe =
                      leaderboardEntryId !== null &&
                      Number(getRowValue(row, ["entry_id", "my_entry_id"])) ===
                        leaderboardEntryId;

                    return (
                      <div
                        key={`${displayValue(rowRank)}-${index}`}
                        className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-green-400/30 bg-green-400/5" : "border-white/5 bg-black/10"}`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-black text-slate-300">
                          {displayValue(rowRank) === "—" ? index + 1 : displayValue(rowRank)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {displayValue(rowName)}
                            {isMe && <span className="ml-2 text-xs text-green-300">You</span>}
                          </p>
                        </div>
                        <p className="text-sm font-black text-green-300">
                          {displayValue(rowPoints)} <span className="text-xs font-normal text-slate-500">pts</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {firstEntry && (
                <Link
                  href={`/leaderboard?entryId=${firstEntry.entry_id}`}
                  className="mt-5 block rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-bold transition hover:border-green-400/40 hover:text-green-300"
                >
                  View full leaderboard →
                </Link>
              )}
            </section>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/competitions"
            className="group rounded-2xl border border-white/10 bg-[#101814] p-5 transition hover:border-green-400/40"
          >
            <p className="text-sm text-slate-400">Ready for another round?</p>
            <h3 className="mt-2 text-lg font-bold group-hover:text-green-300">
              Explore competitions ↗
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Browse eligible gameweeks and join an available group.
            </p>
          </Link>

          <Link
            href="/my-entries"
            className="group rounded-2xl border border-white/10 bg-[#101814] p-5 transition hover:border-green-400/40"
          >
            <p className="text-sm text-slate-400">Your competition history</p>
            <h3 className="mt-2 text-lg font-bold group-hover:text-green-300">
              Manage my entries ↗
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Review entry statuses and open your group leaderboards.
            </p>
          </Link>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-6 text-center text-xs leading-6 text-slate-500">
          Planned entry fee: KSh 50. Payments are not enabled.
          <br />
          FPL Clash is an independent concept and is not affiliated with or endorsed by the Premier League or Fantasy Premier League.
        </footer>
      </div>
    </main>
  );
}