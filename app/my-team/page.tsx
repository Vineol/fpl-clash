
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Player = {
  id: number;
  name: string;
  fullName: string;
  club: string;
  clubCode: string;
  position: string;
  elementType: number;
  totalPoints: number;
  form: string;
  price: string;
  photo: string;
  squadPosition: number;
  multiplier: number;
  captain: boolean;
  viceCaptain: boolean;
  sellingPrice: string;
  purchasePrice: string;
};

type TeamData = {
  id: number;
  name: string;
  verified: boolean;
  playerFirstName: string;
  playerLastName: string;
  overallPoints: number | null;
  overallRank: number | null;
  teamValue: string | null;
  bank: string | null;
};

type SquadResponse = {
  team: TeamData;
  gameweek: {
    id: number;
    name: string;
    finished: boolean;
  };
  picks: Player[];
  picksAvailable: boolean;
  picksMessage: string;
  updatedAt: string;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-KE");
}

function PlayerCard({ player }: { player: Player }) {
  const imageUrl = `https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo}`;

  return (
    <div className="flex w-[76px] flex-col items-center text-center sm:w-[92px]">
      <div className="relative flex h-[76px] w-[76px] items-end justify-center overflow-hidden rounded-t-xl border border-white/20 bg-gradient-to-b from-emerald-800 to-emerald-950 sm:h-[88px] sm:w-[88px]">
        <img
          src={imageUrl}
          alt={player.fullName}
          className="h-[72px] w-auto max-w-full object-contain sm:h-[84px]"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />

        {player.captain && (
          <span className="absolute -right-0.5 -top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-amber-400 text-xs font-black text-slate-950">
            C
          </span>
        )}

        {player.viceCaptain && (
          <span className="absolute -right-0.5 -top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-black text-slate-950">
            V
          </span>
        )}
      </div>

      <div className="w-full rounded-b-lg bg-white px-1.5 py-2 shadow-sm">
        <p className="truncate text-[11px] font-black text-slate-900 sm:text-xs">
          {player.name}
        </p>
        <p className="truncate text-[9px] text-slate-500">
          {player.clubCode}
        </p>
        <div className="mt-1 border-t border-slate-100 pt-1">
          <p className="text-[10px] font-bold text-emerald-700">
            {player.totalPoints} pts
          </p>
          <p className="text-[9px] text-slate-400">
            £{player.price}m
          </p>
        </div>
      </div>
    </div>
  );
}

function PitchRow({
  players,
  columns,
}: {
  players: Player[];
  columns: number;
}) {
  return (
    <div
      className="flex flex-wrap items-start justify-center gap-x-3 gap-y-5 sm:gap-x-7"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </div>
  );
}

export default function MyTeamPage() {
  const router = useRouter();

  const [data, setData] = useState<SquadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTeam = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session?.access_token) {
        router.replace("/auth");
        return;
      }

      const response = await fetch("/api/fpl-team/my-team", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      const result = await response.json();

      if (response.status === 401) {
        router.replace("/auth");
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || "Could not load your FPL team.");
      }

      setData(result as SquadResponse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your FPL team."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const goalkeepers = data?.picks.filter((player) => player.elementType === 1) ?? [];
  const defenders = data?.picks.filter((player) => player.elementType === 2) ?? [];
  const midfielders = data?.picks.filter((player) => player.elementType === 3) ?? [];
  const forwards = data?.picks.filter((player) => player.elementType === 4) ?? [];

  const startingPlayers = data?.picks.filter(
    (player) => player.squadPosition >= 1 && player.squadPosition <= 11
  ) ?? [];

  const benchPlayers = data?.picks
    .filter((player) => player.squadPosition >= 12)
    .sort((a, b) => a.squadPosition - b.squadPosition) ?? [];

  const startingGoalkeepers = startingPlayers.filter((p) => p.elementType === 1);
  const startingDefenders = startingPlayers.filter((p) => p.elementType === 2);
  const startingMidfielders = startingPlayers.filter((p) => p.elementType === 3);
  const startingForwards = startingPlayers.filter((p) => p.elementType === 4);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-emerald-100 border-t-emerald-600" />
          <p className="text-sm text-slate-500">Loading your official FPL squad...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#f4f7f5] px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-2xl font-black">My Team</h1>
          <p className="mt-3 text-sm leading-6 text-red-600">
            {error || "Your team could not be loaded."}
          </p>
          <button
            onClick={() => void loadTeam(true)}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="ml-4 text-sm font-semibold text-slate-500"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
            >
              ← FPL CLASH
            </Link>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              Official FPL squad
            </p>
            <h1 className="mt-1 text-3xl font-black">My Team</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data.team.name} · Team ID {data.team.id}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadTeam(true)}
              disabled={refreshing}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm disabled:opacity-50"
            >
              {refreshing ? "Refreshing..." : "↻ Refresh squad"}
            </button>
            <Link
              href="/link-team"
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Team settings
            </Link>
          </div>
        </header>

        {/* Team summary */}
        <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">Overall points</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">
              {formatNumber(data.team.overallPoints)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">Overall rank</p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(data.team.overallRank)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">Team value</p>
            <p className="mt-2 text-3xl font-black">
              {data.team.teamValue ? `£${data.team.teamValue}m` : "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">In the bank</p>
            <p className="mt-2 text-3xl font-black">
              {data.team.bank ? `£${data.team.bank}m` : "—"}
            </p>
          </div>
        </section>

        {/* Squad information */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Your squad
              </p>
              <h2 className="mt-1 text-xl font-black">
                {data.gameweek.name}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-slate-500">
                Official FPL data
              </span>
            </div>
          </div>

          {!data.picksAvailable ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-bold text-amber-900">
                Squad picks are not available yet
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                {data.picksMessage}
              </p>
              <p className="mt-2 text-xs text-amber-700">
                Your linked team is still verified. Try refreshing when FPL makes the gameweek picks available.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-emerald-900/20 bg-gradient-to-b from-[#16734d] via-[#08603d] to-[#06452f] p-4 sm:p-7">
                <div className="mb-5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/80">
                  <span>Starting XI</span>
                  <span>Pitch view</span>
                </div>

                <div className="relative space-y-7 overflow-hidden rounded-xl border border-white/20 bg-white/[0.04] px-1 py-7 sm:px-4">
                  <div className="pointer-events-none absolute inset-3 rounded-lg border border-white/20" />
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 border-t border-white/20" />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />

                  <div className="relative z-10 space-y-7">
                    <PitchRow players={startingForwards} columns={3} />
                    <PitchRow players={startingMidfielders} columns={5} />
                    <PitchRow players={startingDefenders} columns={5} />
                    <PitchRow players={startingGoalkeepers} columns={2} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-5 text-[11px] font-semibold text-emerald-100">
                  <span>Ⓒ Captain</span>
                  <span>Ⓥ Vice-captain</span>
                  <span>Points · Price</span>
                </div>
              </div>

              {/* Bench */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-black">Substitutes</h3>
                  <span className="text-xs text-slate-400">Bench players</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {benchPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-lg bg-emerald-100">
                        <img
                          src={`https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.photo}`}
                          alt={player.fullName}
                          className="h-11 w-auto object-contain"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs font-black">
                          {player.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {player.clubCode} · {player.position}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-emerald-700">
                          {player.totalPoints} pts
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Full squad list */}
              <details className="mt-6 rounded-xl border border-slate-200">
                <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-slate-700">
                  View all 15 players and detailed stats
                </summary>

                <div className="overflow-x-auto px-4 pb-4">
                  <table className="w-full min-w-[540px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400">
                        <th className="py-3">Player</th>
                        <th>Club</th>
                        <th>Position</th>
                        <th>Points</th>
                        <th>Form</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.picks
                        .slice()
                        .sort((a, b) => a.squadPosition - b.squadPosition)
                        .map((player) => (
                          <tr
                            key={player.id}
                            className="border-b border-slate-100"
                          >
                            <td className="py-3 font-bold">
                              {player.name}
                              {player.captain && " (C)"}
                              {player.viceCaptain && " (V)"}
                            </td>
                            <td>{player.club}</td>
                            <td>{player.position}</td>
                            <td className="font-bold text-emerald-700">
                              {player.totalPoints}
                            </td>
                            <td>{player.form}</td>
                            <td>£{player.price}m</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5">
          <Link
            href="/dashboard"
            className="text-sm font-bold text-emerald-700"
          >
            ← Back to dashboard
          </Link>
          <p className="text-sm font-semibold italic text-slate-500">
            Owned by <span className="font-black not-italic text-emerald-700">Vineol</span>
          </p>
        </footer>
      </div>
    </main>
  );
}
