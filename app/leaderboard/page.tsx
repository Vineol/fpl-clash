
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type LeaderboardEntry = {
  rank_position: number | null;
  entry_id: number;
  team_name: string;
  official_fpl_team_id: number;
  points: number | null;
  score_status: string;
  entry_status: string;
  is_current_user: boolean;
  group_number: number;
  gameweek_number: number;
  participant_count: number;
  max_participants: number;
};

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const entryId = Number(searchParams.get("entryId"));

  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadLeaderboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      if (!Number.isSafeInteger(entryId) || entryId <= 0) {
        throw new Error(
          "Please open the leaderboard from one of your entries."
        );
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Please sign in to view your leaderboard.");
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_my_group_leaderboard",
        { p_entry_id: entryId }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setRows((data ?? []) as LeaderboardEntry[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the leaderboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entryId]);

  useEffect(() => {
    void loadLeaderboard();

  }, [loadLeaderboard]);

  const first = rows[0];
  const scoredEntries = rows.filter((row) => row.points !== null).length;

  const standingsMessage = !first
    ? ""
    : scoredEntries === 0
      ? "Waiting for scores. Standings will appear when FPL points are available."
      : first.entry_status === "cancelled"
        ? "This entry is cancelled."
        : "Provisional standings · Scores may change until the gameweek is finalized.";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/my-entries"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← Back to My Entries
        </Link>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
            FPL CLASH
          </p>

          <h1 className="mt-2 text-3xl font-bold">Group Leaderboard</h1>

          {first && (
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg bg-slate-800 px-3 py-2">
                Gameweek {first.gameweek_number}
              </span>

              <span className="rounded-lg bg-slate-800 px-3 py-2">
                Group {first.group_number}
              </span>

              <span className="rounded-lg bg-slate-800 px-3 py-2">
                {first.participant_count} / {first.max_participants} players
              </span>
            </div>
          )}

          {first && (
            <p className="mt-4 text-sm text-slate-300">
              {standingsMessage}
            </p>
          )}

          {first && scoredEntries > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              {scoredEntries} of {rows.length} participants have scores.
            </p>
          )}

          <button
            type="button"
            onClick={() => void loadLeaderboard(true)}
            disabled={loading || refreshing}
            className="mt-5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Leaderboard"}
          </button>
        </div>

        {loading && (
          <p className="mt-8 text-slate-300">Loading leaderboard...</p>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
            {error}
            <button
              type="button"
              onClick={() => void loadLeaderboard(true)}
              className="ml-3 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-300">
            No participants were found for this entry.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800">
            <div className="grid grid-cols-[48px_minmax(0,1fr)_80px] gap-3 bg-slate-800 px-4 py-3 text-xs font-semibold uppercase text-slate-300 sm:grid-cols-[60px_minmax(0,1fr)_100px_100px]">
              <span>Rank</span>
              <span>FPL Team</span>
              <span className="text-right">Points</span>
              <span className="hidden text-right sm:block">Status</span>
            </div>

            {rows.map((row) => (
              <div
                key={row.entry_id}
                className={`grid grid-cols-[48px_minmax(0,1fr)_80px] gap-3 border-t border-slate-800 px-4 py-4 sm:grid-cols-[60px_minmax(0,1fr)_100px_100px] ${
                  row.is_current_user
                    ? "bg-emerald-950/40"
                    : "bg-slate-900"
                }`}
              >
                <div className="font-bold text-emerald-400">
                  {row.rank_position ?? "—"}
                </div>

                <div className="min-w-0">
                  <p className="break-words font-semibold">
                    {row.team_name}

                    {row.is_current_user && (
                      <span className="ml-2 text-xs text-emerald-400">
                        You
                      </span>
                    )}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    FPL Team ID: {row.official_fpl_team_id}
                  </p>

                  <p className="mt-1 text-xs text-slate-500 sm:hidden">
                    {row.score_status}
                  </p>
                </div>

                <div className="text-right font-semibold">
                  {row.points ?? "—"}
                </div>

                <div className="hidden text-right text-sm text-slate-400 sm:block">
                  {row.score_status}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Test mode · No payments taken · Scores are retrieved through the
          development FPL sync process.
        </p>
      </div>
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 p-8 text-white">
          Loading leaderboard...
        </main>
      }
    >
      <LeaderboardContent />
    </Suspense>
  );
}
