
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

export default function MyEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const [phones, setPhones] = useState<Record<number, string>>({});
  const [paymentMessages, setPaymentMessages] = useState<
    Record<number, string>
  >({});
  const [processingEntryId, setProcessingEntryId] = useState<number | null>(
    null
  );

  async function loadEntries() {
    setLoading(true);
    setError("");

    const { data: userData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !userData.user) {
      setSignedIn(false);
      setEntries([]);
      setLoading(false);
      return;
    }

    setSignedIn(true);

    const { data, error: entriesError } = await supabase.rpc(
      "get_my_entries"
    );

    if (entriesError) {
      setError(entriesError.message);
      setEntries([]);
    } else {
      setEntries((data ?? []) as Entry[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  function formatDate(date: string) {
    if (!date) return "Not set";

    return new Date(date).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function statusStyle(status: string) {
    switch (status.toLowerCase()) {
      case "confirmed":
      case "completed":
      case "full":
        return "bg-green-100 text-green-800";

      case "pending":
      case "filling":
      case "open":
        return "bg-amber-100 text-amber-800";

      case "cancelled":
      case "locked":
        return "bg-gray-200 text-gray-700";

      default:
        return "bg-blue-100 text-blue-800";
    }
  }

  async function payWithMpesa(entryId: number) {
    const phone = phones[entryId]?.trim() ?? "";

    if (!phone) {
      setPaymentMessages((previous) => ({
        ...previous,
        [entryId]: "Enter the M-Pesa phone number to use.",
      }));
      return;
    }

    setProcessingEntryId(entryId);

    setPaymentMessages((previous) => ({
      ...previous,
      [entryId]: "Requesting an M-Pesa prompt. Please wait...",
    }));

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/payments/mpesa/stk-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          entryId,
          phone,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not initiate the payment request."
        );
      }

      setPaymentMessages((previous) => ({
        ...previous,
        [entryId]:
          result.message ||
          "Daraja accepted the request. Check your phone for the M-Pesa prompt. This does not yet confirm payment.",
      }));
    } catch (err) {
      setPaymentMessages((previous) => ({
        ...previous,
        [entryId]:
          err instanceof Error
            ? err.message
            : "Something went wrong while requesting payment.",
      }));
    } finally {
      setProcessingEntryId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-xl font-black tracking-wide">
            FPL <span className="text-green-400">CLASH</span>
          </Link>

          <Link
            href="/dashboard"
            className="text-sm text-slate-300 hover:text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-green-400">
              Your competitions
            </p>

            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              My Entries
            </h1>

            <p className="mt-3 text-slate-400">
              Track your gameweeks, groups and entry status.
            </p>
          </div>

          <button
            onClick={() => void loadEntries()}
            disabled={loading}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh entries"}
          </button>
        </div>

        {!signedIn && !loading && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold">Sign in to continue</h2>

            <p className="mt-2 text-slate-400">
              Your competition entries are available after you sign in.
            </p>

            <Link
              href="/auth"
              className="mt-5 inline-block rounded-lg bg-green-400 px-5 py-3 font-bold text-slate-950 hover:bg-green-300"
            >
              Sign in
            </Link>
          </div>
        )}

        {signedIn && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-slate-400">Total entries</p>
                <p className="mt-2 text-3xl font-black">
                  {entries.length}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-slate-400">Pending entries</p>
                <p className="mt-2 text-3xl font-black">
                  {
                    entries.filter(
                      (entry) => entry.entry_status === "pending"
                    ).length
                  }
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm text-slate-400">Active groups</p>
                <p className="mt-2 text-3xl font-black">
                  {
                    new Set(
                      entries
                        .filter(
                          (entry) => entry.entry_status !== "cancelled"
                        )
                        .map(
                          (entry) =>
                            `${entry.gameweek_number}-${entry.group_number}`
                        )
                    ).size
                  }
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                <p className="font-bold">Could not load your entries</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {loading ? (
              <p className="py-12 text-center text-slate-400">
                Loading your entries...
              </p>
            ) : !error && entries.length === 0 ? (
              <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                <h2 className="text-xl font-bold">No entries yet</h2>

                <p className="mt-2 text-slate-400">
                  Join an available competition to see it here.
                </p>

                <Link
                  href="/competitions"
                  className="mt-5 inline-block rounded-lg bg-green-400 px-5 py-3 font-bold text-slate-950 hover:bg-green-300"
                >
                  Browse competitions
                </Link>
              </div>
            ) : (
              !error && (
                <div className="mt-8 space-y-5">
                  {entries.map((entry) => (
                    <article
                      key={entry.entry_id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-7"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-green-400">
                            Entry #{entry.entry_id}
                          </p>

                          <h2 className="mt-1 text-xl font-bold">
                            {entry.gameweek_name ||
                              `Gameweek ${entry.gameweek_number}`}
                          </h2>

                          <p className="mt-1 text-sm text-slate-400">
                            Official FPL Gameweek {entry.gameweek_number}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyle(
                            entry.entry_status
                          )}`}
                        >
                          {entry.entry_status}
                        </span>
                      </div>

                      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="text-sm text-slate-400">Group</p>
                          <p className="mt-1 text-lg font-bold">
                            Group {entry.group_number}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">
                            Group participants
                          </p>

                          <p className="mt-1 text-lg font-bold">
                            {entry.participant_count} of{" "}
                            {entry.max_participants}
                          </p>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-green-400"
                              style={{
                                width: `${
                                  entry.max_participants > 0
                                    ? Math.min(
                                        100,
                                        (entry.participant_count /
                                          entry.max_participants) *
                                          100
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">
                            Group status
                          </p>

                          <span
                            className={`mt-1 inline-block rounded-full px-3 py-1 text-sm capitalize ${statusStyle(
                              entry.group_status
                            )}`}
                          >
                            {entry.group_status}
                          </span>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">FPL team</p>
                          <p className="mt-1 font-semibold">
                            {entry.team_name}
                          </p>
                          <p className="text-xs text-slate-400">
                            Team ID: {entry.official_fpl_team_id}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">
                            Gameweek deadline
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {formatDate(entry.gameweek_deadline)}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-slate-400">
                            Entry created
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {formatDate(entry.entry_created_at)}
                          </p>
                        </div>
                      </div>

                      {entry.entry_status !== "cancelled" && (
                        <div className="mt-6 rounded-xl border border-green-400/20 bg-green-400/5 p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold">
                                Pay with M-Pesa
                              </h3>
                              <p className="mt-1 text-sm text-slate-300">
                                Sandbox test · KSh 50
                              </p>
                            </div>

                            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
                              Test mode
                            </span>
                          </div>

                          <label
                            htmlFor={`phone-${entry.entry_id}`}
                            className="mt-4 block text-sm font-medium text-slate-300"
                          >
                            M-Pesa phone number
                          </label>

                          <input
                            id={`phone-${entry.entry_id}`}
                            type="tel"
                            autoComplete="tel"
                            placeholder="0712345678 or 254712345678 or 0112345678"
                            value={phones[entry.entry_id] ?? ""}
                            onChange={(event) =>
                              setPhones((previous) => ({
                                ...previous,
                                [entry.entry_id]: event.target.value,
                              }))
                            }
                            disabled={
                              processingEntryId !== null
                            }
                            className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-green-400 disabled:opacity-60"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void payWithMpesa(entry.entry_id)
                            }
                            disabled={
                              processingEntryId !== null
                            }
                            className="mt-4 w-full rounded-lg bg-green-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                          >
                            {processingEntryId === entry.entry_id
                              ? "Requesting prompt..."
                              : "Request M-Pesa prompt"}
                          </button>

                          {paymentMessages[entry.entry_id] && (
                            <p
                              role="status"
                              aria-live="polite"
                              className="mt-3 text-sm text-slate-300"
                            >
                              {paymentMessages[entry.entry_id]}
                            </p>
                          )}

                          <p className="mt-3 text-xs text-slate-500">
                            Sandbox only. A request being accepted does not
                            mean payment succeeded. Do not retry if a prompt
                            may already have been sent; check the payment
                            record first.
                          </p>
                        </div>
                      )}

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
                        <p className="text-sm text-slate-400">
                          Payment status is tracked separately from entry
                          status.
                        </p>

                        <Link
                          href={`/leaderboard?entryId=${entry.entry_id}`}
                          className="inline-block rounded-lg bg-green-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-green-300"
                        >
                          View Group Leaderboard →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            <div className="mt-8">
              <Link
                href="/competitions"
                className="font-semibold text-green-400 hover:text-green-300"
              >
                ← Browse competitions
              </Link>
            </div>
          </>
        )}

        <p className="mt-12 text-center text-xs text-slate-500">
          FPL Clash is a development prototype. M-Pesa payments are
          currently limited to sandbox testing.
        </p>
      </section>
    </main>
  );
}
