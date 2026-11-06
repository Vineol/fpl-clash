
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Overview = {
  stats: {
    gameweeks: number;
    groups: number;
    entries: number;
    scores: number;
  };
  recentEntries: {
    id: number;
    status: string;
    gameweek_id: number;
    group_id: number;
    created_at: string;
  }[];
};

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error("Please sign in to your FPL Clash account first.");
      }

      setEmail(session.user.email ?? "");

      const response = await fetch("/api/admin/overview", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not load admin dashboard.");
      }

      setOverview(result as Overview);
    } catch (err) {
      setOverview(null);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const cards = [
    {
      label: "Gameweeks",
      value: overview?.stats.gameweeks ?? 0,
    },
    {
      label: "Competition groups",
      value: overview?.stats.groups ?? 0,
    },
    {
      label: "Active entries",
      value: overview?.stats.entries ?? 0,
    },
    {
      label: "Saved scores",
      value: overview?.stats.scores ?? 0,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/dashboard"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← Back to Dashboard
        </Link>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
            FPL CLASH
          </p>
          <h1 className="mt-2 text-3xl font-bold">Admin Dashboard</h1>
          <p className="mt-3 text-sm text-slate-400">
            Private development overview · Signed in as {email || "checking account..."}
          </p>
        </div>

        {loading && (
          <p className="mt-6 text-slate-300">Loading statistics...</p>
        )}

        {!loading && error && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => void loadOverview()}
              className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && overview && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-5"
                >
                  <p className="text-sm text-slate-400">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-5">
                <div>
                  <h2 className="text-lg font-bold">Recent entries</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Latest 10 entry records
                  </p>
                </div>

                <button
                  onClick={() => void loadOverview()}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Refresh
                </button>
              </div>

              {overview.recentEntries.length === 0 ? (
                <p className="p-5 text-slate-400">
                  No entries found yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-slate-300">
                      <tr>
                        <th className="px-5 py-3">Entry ID</th>
                        <th className="px-5 py-3">Gameweek record</th>
                        <th className="px-5 py-3">Group record</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentEntries.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-t border-slate-800"
                        >
                          <td className="px-5 py-4">#{entry.id}</td>
                          <td className="px-5 py-4">
                            {entry.gameweek_id}
                          </td>
                          <td className="px-5 py-4">
                            {entry.group_id}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-slate-800 px-3 py-1">
                              {entry.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-400">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="mt-6 text-xs text-slate-500">
              Development mode. Entries and scores shown here do not indicate
              that payments have been received. No live payments or prize
              payouts are enabled.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
