
"use client";

import { useEffect, useState } from "react";

type TopPlayer = {
  id: number;
  name: string;
  fullName: string;
  club: string;
  clubCode: string;
  position: string;
  points: number;
  price: string;
  photo: string;
};

type PlayerCategory = {
  category: string;
  shortLabel: string;
  player: TopPlayer | null;
};

type TopPlayersResponse = {
  players: PlayerCategory[];
  updatedAt: string;
};

export default function Home() {
  const [showJoin, setShowJoin] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState("");

  const [topPlayers, setTopPlayers] = useState<PlayerCategory[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const whatsappLink =
    "https://wa.me/254745532294?text=Hi%2C%20I%27d%20like%20to%20know%20more%20about%20FPL%20Clash.";

  async function loadTopPlayers() {
    try {
      setPlayersError("");

      const response = await fetch("/api/fpl/top-players", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to retrieve FPL rankings.");
      }

      const data: TopPlayersResponse = await response.json();

      setTopPlayers(data.players);
      setLastUpdated(data.updatedAt);
    } catch (error) {
      console.error("Top players loading error:", error);
      setPlayersError("Player rankings are temporarily unavailable.");
    } finally {
      setPlayersLoading(false);
    }
  }

  useEffect(() => {
    loadTopPlayers();

    const interval = setInterval(loadTopPlayers, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  function handleJoin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!/^\d+$/.test(teamId.trim())) {
      setMessage("Please enter a numeric FPL team ID.");
      return;
    }

    setMessage(
      "Demo only: your ID has been entered. Team verification and registration are not connected yet."
    );
  }

  function playerImage(photo: string) {
    return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${photo}`;
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-slate-900">
      {/* Navigation */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <a href="/" className="text-2xl font-black">
          FPL<span className="text-emerald-600">CLASH</span>
        </a>

        <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">
          Kenya 🇰🇪
        </span>
      </nav>

      {/* Hero Image */}
      <section className="mx-auto max-w-7xl px-4 pt-2 md:px-6">
        <div className="overflow-hidden rounded-3xl shadow-2xl">
          <img
            src="/images/fpl-clash-hero.png"
            alt="FPL Clash - Every gameweek. A new battle."
            className="block h-auto w-full"
          />
        </div>
      </section>

      {/* Live Top FPL Players */}
      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black tracking-widest text-emerald-700">
              THE SEASON'S TOP PERFORMERS
            </p>

            <h2 className="mt-2 text-3xl font-black md:text-4xl">
              FPL Top 5
            </h2>

            <p className="mt-2 text-slate-600">
              The highest-scoring player in each position, plus the overall
              number one.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTopPlayers}
            disabled={playersLoading}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
          >
            {playersLoading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Official FPL season points
          {lastUpdated && (
            <span>
              · Updated {new Date(lastUpdated).toLocaleTimeString("en-KE", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {playersLoading && topPlayers.length === 0 ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-64 animate-pulse rounded-2xl bg-white shadow-sm"
              />
            ))}
          </div>
        ) : playersError && topPlayers.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <p className="font-semibold">{playersError}</p>
            <button
              onClick={loadTopPlayers}
              className="mt-3 font-bold underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {topPlayers.map((item, index) => (
              <article
                key={item.shortLabel}
                className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
                  item.shortLabel === "TOP PLAYER"
                    ? "border-emerald-400 ring-2 ring-emerald-100"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                    {item.shortLabel}
                  </span>

                  {item.shortLabel === "TOP PLAYER" && (
                    <span className="text-lg" aria-label="Number one">
                      👑
                    </span>
                  )}
                </div>

                {item.player ? (
                  <>
                    <div className="mt-4 flex h-32 items-end justify-center overflow-hidden rounded-xl bg-gradient-to-b from-slate-50 to-emerald-50">
                      <img
                        src={playerImage(item.player.photo)}
                        alt={item.player.fullName}
                        className="h-32 w-auto object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>

                    <p className="mt-4 text-lg font-black leading-tight">
                      {item.player.name}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {item.player.club}
                    </p>

                    <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500">
                          TOTAL POINTS
                        </p>
                        <p className="mt-1 text-3xl font-black text-emerald-700">
                          {item.player.points}
                        </p>
                      </div>

                      <p className="text-xs font-semibold text-slate-500">
                        £{item.player.price}m
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="mt-8 text-sm text-slate-500">
                    Player information unavailable.
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {playersError && topPlayers.length > 0 && (
          <p className="mt-4 text-sm text-amber-700">
            Refresh failed. Showing the last successfully loaded rankings.
          </p>
        )}

        <p className="mt-5 text-xs leading-5 text-slate-500">
          Rankings are based on official FPL season total points and are not
          affiliated with or endorsed by the Premier League.
        </p>
      </section>

      {/* Join Competition Button */}
      <section className="mx-auto flex max-w-7xl justify-center px-4 py-8">
        <a
          href="/competitions"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-9 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-emerald-600 hover:shadow-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-emerald-300"
        >
          Join a Competition
          <span aria-hidden="true">→</span>
        </a>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-white px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black">How it works</h2>

          <p className="mt-3 text-slate-600">
            Three simple steps to compete.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                number: "01",
                title: "Enter your FPL team ID",
                description:
                  "Use your existing official FPL team. Never share your password.",
              },
              {
                number: "02",
                title: "Join a group of 10",
                description:
                  "The planned system will allocate eligible participants to groups.",
              },
              {
                number: "03",
                title: "Compare your score",
                description:
                  "A leaderboard will rank verified gameweek scores using published rules.",
              },
            ].map((step) => (
              <article
                key={step.number}
                className="rounded-2xl border border-slate-200 p-6"
              >
                <p className="font-black text-emerald-600">
                  STEP {step.number}
                </p>

                <h3 className="mt-3 text-xl font-bold">
                  {step.title}
                </h3>

                <p className="mt-3 leading-7 text-slate-600">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Demo CTA */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="rounded-3xl bg-emerald-600 p-8 text-white md:flex md:items-center md:justify-between md:gap-8 md:p-10">
          <div>
            <h2 className="text-3xl font-black">
              Ready for the next gameweek?
            </h2>

            <p className="mt-3 text-emerald-50">
              Your next FPL challenge starts here.
            </p>
          </div>

          <button
            onClick={() => {
              setMessage("");
              setShowJoin(true);
            }}
            className="mt-6 rounded-xl bg-white px-6 py-4 font-bold text-emerald-800 hover:bg-emerald-50 md:mt-0"
          >
            Try the demo →
          </button>
        </div>
      </section>

      {/* WhatsApp Contact */}
      <section className="border-t border-slate-200 bg-white px-6 py-16">
        <div className="mx-auto max-w-7xl text-center">
          <p className="text-sm font-bold tracking-widest text-emerald-700">
            WE'RE HERE TO HELP
          </p>

          <h2 className="mt-3 text-3xl font-black">
            Have questions about FPL Clash?
          </h2>

          <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-600">
            Need help getting started or want to know more about the
            competitions? Get in touch with us directly on WhatsApp.
          </p>

          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-3 rounded-xl bg-[#25D366] px-7 py-4 font-bold text-white shadow-lg transition hover:bg-[#1ebe5d]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M20.52 3.48A11.87 11.87 0 0 0 12.05 0C5.48 0 .13 5.35.13 11.92c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 0 0 5.77 1.47h.01c6.57 0 11.92-5.35 11.92-11.92 0-3.18-1.24-6.17-3.45-8.43ZM12.05 21.8a9.9 9.9 0 0 1-5.05-1.39l-.36-.21-3.72.97.99-3.63-.24-.37a9.85 9.85 0 0 1-1.52-5.25c0-5.47 4.45-9.92 9.92-9.92 2.65 0 5.14 1.03 7.01 2.91a9.86 9.86 0 0 1 2.9 7.01c0 5.47-4.45 9.92-9.93 9.92Zm5.45-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.79-1.68-2.09-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
            </svg>

            Chat with us on WhatsApp
          </a>

          <p className="mt-4 text-sm text-slate-500">
            +254 745 532 294
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 px-6 py-7 text-center text-sm text-slate-500">
        FPL Clash · Independent concept project, not affiliated with or endorsed
        by the Premier League or Fantasy Premier League.
      </footer>

      {/* Demo Registration Modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-emerald-700">
                  DEMO REGISTRATION
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Enter your FPL ID
                </h2>
              </div>

              <button
                onClick={() => setShowJoin(false)}
                aria-label="Close dialog"
                className="rounded-lg px-3 py-1 text-xl hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              Your team ID is the number in your official FPL team URL, after
              /entry/. For example: /entry/123456/.
            </p>

            <form onSubmit={handleJoin} className="mt-6">
              <label htmlFor="teamId" className="mb-2 block font-semibold">
                FPL team ID
              </label>

              <input
                id="teamId"
                value={teamId}
                onChange={(e) => {
                  setTeamId(e.target.value);
                  setMessage("");
                }}
                inputMode="numeric"
                pattern="[0-9]+"
                required
                placeholder="e.g. 123456"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600"
              />

              <button
                type="submit"
                className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700"
              >
                Test team ID
              </button>
            </form>

            {message && (
              <p
                aria-live="polite"
                className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"
              >
                {message}
              </p>
            )}

            <p className="mt-5 text-xs leading-5 text-slate-500">
              Demo only. This does not verify your FPL team, create an entry,
              process payments or award prizes.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
