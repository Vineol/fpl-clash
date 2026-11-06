
"use client";

import { useState } from "react";

export default function Home() {
  const [showJoin, setShowJoin] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState("");

  const whatsappLink =
    "https://wa.me/254745532294?text=Hi%2C%20I%27d%20like%20to%20know%20more%20about%20FPL%20Clash.";

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

      {/* Hero Image with clickable Join button */}
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="relative overflow-hidden rounded-3xl shadow-2xl">
          <img
            src="/images/fpl-clash-hero.png"
            alt="FPL Clash - Every gameweek. A new battle."
            className="block h-auto w-full"
          />

          {/* Invisible clickable area over the green button in the image */}
          <a
            href="/competitions"
            aria-label="Join a competition"
            title="Join a competition"
            className="absolute left-[5%] top-[57%] z-10 h-[9%] w-[25%] cursor-pointer rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-white"
          />
        </div>
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
