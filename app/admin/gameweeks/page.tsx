
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Gameweek = {
  id: number;
  fpl_gameweek_number: number;
  name: string;
  deadline: string;
  status: "upcoming" | "open" | "locked" | "completed";
  created_at: string;
};

export default function GameweekManagementPage() {
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");

  const requestApi = useCallback(
    async (body?: Record<string, unknown>) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error("Please sign in before managing gameweeks.");
      }

      const response = await fetch("/api/admin/gameweeks", {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "The request failed.");
      }

      return result;
    },
    []
  );

  const loadGameweeks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await requestApi();
      setGameweeks(result.gameweeks ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load gameweeks."
      );
    } finally {
      setLoading(false);
    }
  }, [requestApi]);

  useEffect(() => {
    void loadGameweeks();
  }, [loadGameweeks]);

  async function createGameweek(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await requestApi({
        action: "create",
        fpl_gameweek_number: Number(number),
        name,
        deadline: new Date(deadline).toISOString(),
      });

      setGameweeks((current) =>
        [...current, result.gameweek].sort(
          (a, b) => a.fpl_gameweek_number - b.fpl_gameweek_number
        )
      );

      setNumber("");
      setName("");
      setDeadline("");
      setMessage("Gameweek created successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create gameweek."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(gameweek: Gameweek) {
    const nextStatus: Gameweek["status"] | undefined = {
      upcoming: "open",
      open: "locked",
      locked: "completed",
      completed: "open",
    }[gameweek.status];

    if (!nextStatus) return;

    const actionLabel =
      gameweek.status === "completed" && nextStatus === "open"
        ? "reopen"
        : "change the status of";

    const confirmed = window.confirm(
      gameweek.status === "completed"
        ? `Reopen ${gameweek.name}? This will allow new entries if the deadline has not passed. Existing entries and scores will not be reset.`
        : `Change ${gameweek.name} from ${gameweek.status} to ${nextStatus}?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await requestApi({
        action: "status",
        id: gameweek.id,
        status: nextStatus,
      });

      setGameweeks((current) =>
        current.map((item) =>
          item.id === gameweek.id ? result.gameweek : item
        )
      );

      setMessage(
        nextStatus === "open"
          ? `${gameweek.name} has been reopened.`
          : `${gameweek.name} is now ${nextStatus}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update status."
      );
    } finally {
      setSaving(false);
    }
  }

  function statusClass(status: Gameweek["status"]) {
    switch (status) {
      case "open":
        return "bg-emerald-950 text-emerald-300";
      case "locked":
        return "bg-amber-950 text-amber-300";
      case "completed":
        return "bg-slate-700 text-slate-300";
      default:
        return "bg-sky-950 text-sky-300";
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← Back to Admin Dashboard
        </Link>

        <header className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">
            FPL CLASH
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Gameweek Management
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Create gameweeks, set deadlines and manage competition status.
          </p>
        </header>

        {error && (
          <div className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-emerald-300">
            {message}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">Create a gameweek</h2>
          <p className="mt-2 text-sm text-slate-400">
            New gameweeks start as upcoming. You can open them when ready.
          </p>

          <form
            onSubmit={createGameweek}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm text-slate-300">
              Official gameweek number
              <input
                type="number"
                min="1"
                max="38"
                required
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="e.g. 12"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
              />
            </label>

            <label className="text-sm text-slate-300">
              Gameweek name
              <input
                type="text"
                maxLength={100}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Gameweek 12"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
              />
            </label>

            <label className="text-sm text-slate-300 sm:col-span-2">
              Entry deadline (your computer&apos;s local time)
              <input
                type="datetime-local"
                required
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
            >
              {saving ? "Please wait..." : "Create Gameweek"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Existing gameweeks</h2>
              <p className="mt-1 text-sm text-slate-400">
                {gameweeks.length} gameweek records
              </p>
            </div>

            <button
              onClick={() => void loadGameweeks()}
              disabled={loading || saving}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="mt-6 text-slate-300">Loading gameweeks...</p>
          ) : gameweeks.length === 0 ? (
            <p className="mt-6 text-slate-400">
              No gameweeks found. Create your first one above.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {gameweeks.map((gameweek) => {
                const nextAction: Partial<
                  Record<Gameweek["status"], string>
                > = {
                  upcoming: "Open entries",
                  open: "Lock entries",
                  locked: "Mark completed",
                  completed: "Reopen Gameweek",
                };

                return (
                  <article
                    key={gameweek.id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{gameweek.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          Official Gameweek {gameweek.fpl_gameweek_number}
                          {" · "}Record ID {gameweek.id}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(gameweek.status)}`}
                      >
                        {gameweek.status}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-slate-400">
                      Deadline: {new Date(gameweek.deadline).toLocaleString()}
                    </p>

                    {nextAction[gameweek.status] ? (
                      <button
                        onClick={() => void changeStatus(gameweek)}
                        disabled={saving}
                        className={`mt-4 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                          gameweek.status === "completed"
                            ? "border-emerald-700 text-emerald-300 hover:bg-emerald-950"
                            : "border-slate-700 hover:border-emerald-500 hover:text-emerald-300"
                        }`}
                      >
                        {nextAction[gameweek.status]}
                      </button>
                    ) : (
                      <p className="mt-4 text-xs text-slate-500">
                        This gameweek is finalized.
                      </p>
                    )}

                    {gameweek.status === "completed" && (
                      <p className="mt-2 text-xs text-slate-500">
                        Reopening does not reset existing entries or scores.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-slate-500">
          Development mode. Opening a gameweek permits new entries through
          the existing entry flow. No payments or payouts are enabled.
        </p>
      </div>
    </main>
  );
}
