"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Gameweek = {
  id: number;
  fpl_gameweek_number: number;
  name: string;
  deadline: string | null;
  status: "upcoming" | "open" | "locked" | "completed";
};

type Tier = {
  name: string;
  feePence: number;
  price: string;
  description: string;
  accent: string;
};

type JoinResult = {
  success: boolean;
  entry_id: number;
  group_id: number;
  group_number: number;
  participant_count: number;
  max_participants: number;
  group_status: string;
  entry_fee_pence: number;
};

const TIERS: Tier[] = [
  {
    name: "Regular Clash",
    feePence: 5000,
    price: "KSh 50",
    description: "Enter the regular gameweek battle.",
    accent: "border-green-400/40",
  },
  {
    name: "Standard Clash",
    feePence: 10000,
    price: "KSh 100",
    description: "Step up to the standard tier.",
    accent: "border-sky-400/40",
  },
  {
    name: "Premium Clash",
    feePence: 25000,
    price: "KSh 250",
    description: "Compete in the premium tier.",
    accent: "border-amber-400/40",
  },
];

export default function CompetitionsPage() {
  const router = useRouter();
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<JoinResult | null>(null);

  async function loadCompetitions() {
    setLoading(true);
    setMessage("");

    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      router.replace("/auth");
      return;
    }

    const { data: team, error: teamError } = await supabase
      .from("fpl_teams")
      .select("verified")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (teamError) {
      setMessage("Could not check your FPL team. Please refresh.");
      setLoading(false);
      return;
    }

    if (!team?.verified) {
      setMessage(
        "Please link and verify your FPL team before joining competitions."
      );
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("gameweeks")
      .select("id, fpl_gameweek_number, name, deadline, status")
      .gte("fpl_gameweek_number", 1)
      .lte("fpl_gameweek_number", 38)
      .in("status", ["upcoming", "open"])
      .order("fpl_gameweek_number", { ascending: true });

    if (error) {
      console.error("Could not load gameweeks:", error.message);
      setMessage("Could not load competitions. Please refresh the page.");
    } else {
      setGameweeks((data ?? []) as Gameweek[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadCompetitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function joinCompetition(gameweekId: number, tier: Tier) {
    const requestId = `${gameweekId}-${tier.feePence}`;

    setJoiningId(requestId);
    setMessage("");
    setSuccess(null);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.push("/auth");
        return;
      }

      const selectedGameweek = gameweeks.find(
        (gameweek) => gameweek.id === gameweekId
      );

      const isValidGameweek =
        selectedGameweek &&
        selectedGameweek.status === "open" &&
        selectedGameweek.fpl_gameweek_number >= 1 &&
        selectedGameweek.fpl_gameweek_number <= 38 &&
        selectedGameweek.deadline !== null &&
        new Date(selectedGameweek.deadline).getTime() > Date.now();

      if (!isValidGameweek) {
        setMessage(
          "This gameweek is not currently available to join. Please refresh and try another gameweek."
        );
        await loadCompetitions();
        return;
      }

      const { data, error } = await supabase.rpc("join_gameweek", {
        p_gameweek_id: gameweekId,
        p_entry_fee_pence: tier.feePence,
      });

      if (error) {
        setMessage(error.message || "Could not join this competition.");
        return;
      }

      const result = data as JoinResult;

      if (!result?.success) {
        setMessage("The competition could not be joined. Please try again.");
        return;
      }

      setSuccess(result);
      await loadCompetitions();
    } catch (error) {
      console.error("Join competition error:", error);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setJoiningId(null);
    }
  }

  function formatDeadline(deadline: string | null) {
    if (!deadline) return "Not yet announced";

    const date = new Date(deadline);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return date.toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Nairobi",
    });
  }

  function formatFee(feePence: number) {
    return `KSh ${(feePence / 100).toLocaleString("en-KE")}`;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <a
            href="/"
            className="text-xl font-black tracking-widest text-green-400"
          >
            FPL CLASH
          </a>

          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
          >
            Dashboard
          </button>
        </header>

        <section className="mt-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-green-400">
            Gameweek competitions
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Choose your battle.
          </h1>

          <p className="mt-3 max-w-2xl leading-7 text-slate-400">
            Choose your entry tier, join a one-gameweek competition, and
            compete against up to nine other managers for the highest official
            FPL score.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Entry tiers</p>
            <p className="mt-2 text-2xl font-black">3 options</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Managers per group</p>
            <p className="mt-2 text-2xl font-black">10</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Competition duration</p>
            <p className="mt-2 text-2xl font-black">1 Gameweek</p>
          </div>
        </section>

        {success && (
          <section
            role="status"
            className="mt-8 rounded-2xl border border-green-400/30 bg-green-400/10 p-6"
          >
            <h2 className="text-xl font-bold text-green-300">
              Entry created successfully!
            </h2>

            <p className="mt-3 text-slate-200">
              {formatFee(success.entry_fee_pence)} · Group{" "}
              {success.group_number}
            </p>

            <p className="mt-2 text-sm text-slate-300">
              Participants: {success.participant_count} of{" "}
              {success.max_participants}
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Entry #{success.entry_id} · Pending status · No payment taken
            </p>

            <button
              onClick={() => router.push("/my-entries")}
              className="mt-5 rounded-lg bg-green-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-green-300"
            >
              View my entries
            </button>
          </section>
        )}

        {message && (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-amber-200"
          >
            {message}
          </div>
        )}

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Available gameweeks</h2>

            <button
              onClick={() => void loadCompetitions()}
              disabled={loading || joiningId !== null}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh gameweeks"}
            </button>
          </div>

          {loading ? (
            <p className="mt-5 text-slate-400">
              Loading available gameweeks...
            </p>
          ) : message && gameweeks.length === 0 ? (
            <p className="mt-5 text-slate-400">
              Check the message above for details.
            </p>
          ) : gameweeks.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-8">
              <h3 className="text-lg font-bold">
                No gameweeks available yet
              </h3>

              <p className="mt-2 leading-7 text-slate-400">
                There are currently no upcoming gameweeks available to join.
                Please check again later.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              {gameweeks.map((gameweek) => {
                const deadlineTime = gameweek.deadline
                  ? new Date(gameweek.deadline).getTime()
                  : 0;

                const deadlinePassed =
                  !deadlineTime || deadlineTime <= Date.now();

                const canJoin =
                  gameweek.status === "open" &&
                  gameweek.fpl_gameweek_number >= 1 &&
                  gameweek.fpl_gameweek_number <= 38 &&
                  !deadlinePassed;

                return (
                  <section
                    key={gameweek.id}
                    className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-green-400">
                          FPL GAMEWEEK {gameweek.fpl_gameweek_number}
                        </p>

                        <h3 className="mt-1 text-2xl font-black">
                          {gameweek.name}
                        </h3>

                        <p className="mt-2 text-sm text-slate-400">
                          Deadline: {formatDeadline(gameweek.deadline)} (EAT)
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          canJoin
                            ? "bg-green-400/10 text-green-400"
                            : "bg-white/10 text-slate-300"
                        }`}
                      >
                        {canJoin
                          ? "Open"
                          : deadlinePassed
                            ? "Deadline passed"
                            : "Upcoming"}
                      </span>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      {TIERS.map((tier) => {
                        const requestId = `${gameweek.id}-${tier.feePence}`;
                        const isJoining = joiningId === requestId;

                        return (
                          <article
                            key={tier.feePence}
                            className={`flex flex-col rounded-xl border ${tier.accent} bg-slate-950 p-5`}
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-300">
                                {tier.name}
                              </p>

                              <p className="mt-2 text-3xl font-black">
                                {tier.price}
                              </p>

                              <p className="mt-2 min-h-10 text-sm leading-5 text-slate-400">
                                {tier.description}
                              </p>

                              <p className="mt-4 text-xs text-slate-500">
                                One gameweek · 10 managers per group
                              </p>
                            </div>

                            <button
                              onClick={() =>
                                void joinCompetition(gameweek.id, tier)
                              }
                              disabled={!canJoin || joiningId !== null}
                              className="mt-5 w-full rounded-lg bg-green-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-green-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                            >
                              {isJoining
                                ? "Joining..."
                                : canJoin
                                  ? "Join Competition"
                                  : "Not currently available"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-10 text-center text-xs leading-6 text-slate-500">
          Entries remain pending. No payments or cash prizes are enabled.
          Displayed entry fees are for tier selection and testing only. FPL
          Clash is an independent concept and is not affiliated with or
          endorsed by the Premier League.
        </p>
      </div>
    </main>
  );
}