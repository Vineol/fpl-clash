
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Section = "overview" | "entries" | "competitions" | "leaderboard";

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
  group_id: number;
  entry_fee_pence: number;
};

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
  available: boolean;
};

type AvailableGroup = {
  group_id: number;
  gameweek_id: number;
  group_number: number;
  max_participants: number;
  group_status: string;
  entry_fee_pence: number;
  participant_count: number;
  user_has_joined: boolean;
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

type LeaderboardRow = Record<string, unknown>;

const TIERS: Tier[] = [
  {
    name: "Free Clash",
    feePence: 0,
    price: "FREE",
    description: "Join the gameweek battle at no cost.",
    accent: "border-green-400/50",
    available: true,
  },
  {
    name: "Regular Clash",
    feePence: 5000,
    price: "KSh 50",
    description: "Enter the regular gameweek battle.",
    accent: "border-green-400/40",
    available: false,
  },
  {
    name: "Standard Clash",
    feePence: 10000,
    price: "KSh 100",
    description: "Step up to the standard tier.",
    accent: "border-sky-400/40",
    available: false,
  },
  {
    name: "Premium Clash",
    feePence: 25000,
    price: "KSh 250",
    description: "Compete in the premium tier.",
    accent: "border-amber-400/40",
    available: false,
  },
];

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

function getCountdown(deadline: string | null, now: number) {
  if (!deadline) return "Deadline unavailable";

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
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return "—";
}

function getRowValue(row: LeaderboardRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function getTierDetails(feePence: number | null | undefined) {
  switch (Number(feePence)) {
    case 0:
      return {
        name: "Free Clash",
        price: "Free",
        style: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case 5000:
      return {
        name: "Regular Clash",
        price: "KSh 50",
        style: "bg-green-50 text-green-700 border-green-200",
      };
    case 10000:
      return {
        name: "Standard Clash",
        price: "KSh 100",
        style: "bg-sky-50 text-sky-700 border-sky-200",
      };
    case 25000:
      return {
        name: "Premium Clash",
        price: "KSh 250",
        style: "bg-amber-50 text-amber-700 border-amber-200",
      };
    default:
      return {
        name: "Tier unavailable",
        price: "",
        style: "bg-slate-100 text-slate-600 border-slate-200",
      };
  }
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

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function DashboardPage() {
  const router = useRouter();

  const [section, setSection] = useState<Section>("overview");
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [team, setTeam] = useState<FPLTeam | null>(null);
  const [teamError, setTeamError] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesError, setEntriesError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardEntryId, setLeaderboardEntryId] = useState<number | null>(null);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [now, setNow] = useState(0);
  const [entryFilter, setEntryFilter] = useState<"all" | "open" | "upcoming">("all");
  const [showMyTeamModal, setShowMyTeamModal] = useState(false);

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
              entry.gameweek_number <= 38
          ) ??
          loadedEntries.find((entry) => entry.entry_status !== "cancelled");

        if (preferredEntry) {
          setLeaderboardEntryId(preferredEntry.entry_id);

          const { data, error } = await supabase.rpc(
            "get_my_group_leaderboard",
            { p_entry_id: preferredEntry.entry_id }
          );

          if (error) {
            setLeaderboardError("Leaderboard preview is temporarily unavailable.");
            setLeaderboard([]);
          } else {
            setLeaderboard((data ?? []) as LeaderboardRow[]);
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

  function continueToOfficialFPL() {
    if (!team?.verified || !Number.isFinite(team.fpl_team_id)) return;

    window.open(
      `https://fantasy.premierleague.com/entry/${team.fpl_team_id}/event/`,
      "_blank",
      "noopener,noreferrer"
    );

    setShowMyTeamModal(false);
  }

  function openLeaderboard(entryId: number) {
    setSelectedEntryId(entryId);
    setSection("leaderboard");
  }

  const teamReady = Boolean(team?.verified);
  const activeEntries = entries.filter(
    (entry) => entry.entry_status !== "cancelled"
  );

  const visibleEntries = activeEntries.filter((entry) =>
    ["upcoming", "open"].includes((entry.gameweek_status || "").toLowerCase())
  );

  const filteredVisibleEntries = visibleEntries.filter((entry) =>
    entryFilter === "all"
      ? true
      : (entry.gameweek_status || "").toLowerCase() === entryFilter
  );

  const firstEntry =
    activeEntries.find(
      (entry) => entry.gameweek_number >= 1 && entry.gameweek_number <= 38
    ) ?? activeEntries[0];

  const personalLeaderboardRow = leaderboard.find((row) => {
    const id = getRowValue(row, ["entry_id", "my_entry_id"]);
    return id !== null && Number(id) === leaderboardEntryId;
  });

  const myPoints = personalLeaderboardRow
    ? getRowValue(personalLeaderboardRow, [
        "points", "total_points", "gameweek_points", "score",
      ])
    : null;

  const myRank = personalLeaderboardRow
    ? getRowValue(personalLeaderboardRow, [
        "rank", "position", "group_rank", "rank_position",
      ])
    : null;

  const groupSize = firstEntry
    ? Number(firstEntry.max_participants) || 10
    : 10;

  const groupParticipants = firstEntry
    ? Number(firstEntry.participant_count) || 0
    : 0;

  const groupProgress = Math.min(100, (groupParticipants / groupSize) * 100);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5] text-slate-800">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-emerald-100 border-t-emerald-600" />
          <p className="text-sm text-slate-500">
            Loading your FPL Clash dashboard...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-slate-900 lg:flex">
      {showMyTeamModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6"
          role="presentation"
          onClick={() => setShowMyTeamModal(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-team-modal-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">
              ⚽
            </div>

            <h2 id="my-team-modal-title" className="mt-5 text-center text-xl font-black">
              Leaving FPL CLASH
            </h2>

            <p className="mt-3 text-center text-sm leading-6 text-slate-600">
              You are now leaving FPL CLASH and you will be directed to official FPL web.
            </p>

            {teamReady ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Verified FPL team</p>
                <p className="mt-1 font-bold">{team?.team_name || "Your FPL team"}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Team ID: {team?.fpl_team_id}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-sm font-semibold text-amber-800">
                  Your FPL team is not verified yet.
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  Link and verify your official FPL team before continuing.
                </p>
                <Link
                  href="/link-team"
                  onClick={() => setShowMyTeamModal(false)}
                  className="mt-3 inline-block text-sm font-bold text-emerald-700"
                >
                  Link or verify my team →
                </Link>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowMyTeamModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={continueToOfficialFPL}
                disabled={!teamReady}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                Continue →
              </button>
            </div>
            <p className="mt-4 text-center text-[11px] text-slate-400">
              You can return to FPL CLASH at any time.
            </p>
          </section>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-6 lg:py-7">
          <Link href="/" className="text-2xl font-black tracking-tight">
            FPL <span className="text-emerald-600">CLASH</span>
          </Link>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 lg:mt-2 lg:inline-block">
            MANAGER HUB
          </span>
        </div>

        <div className="mx-5 hidden rounded-2xl bg-gradient-to-br from-[#142b25] to-[#1d5140] p-4 text-white lg:mx-4 lg:block">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl">
            ⚽
          </div>
          <p className="mt-3 truncate text-sm font-bold">
            {team?.team_name || "FPL Manager"}
          </p>
          <p className="mt-1 truncate text-xs text-emerald-100/75">{email}</p>
          <div className="mt-3 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-emerald-100">
            {teamReady ? "✓ VERIFIED TEAM" : "TEAM NOT VERIFIED"}
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:mt-7 lg:block lg:space-y-2 lg:overflow-visible">
          {([
            ["overview", "▦", "Overview"],
            ["entries", "◎", "My Entries"],
            ["competitions", "⚔", "Competitions"],
            ["leaderboard", "▤", "Leaderboard"],
          ] as [Section, string, string][]).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-current={section === key ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition lg:w-full ${
                section === key
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="w-5 text-center text-base">{icon}</span>
              {label}
              {section === key && (
                <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowMyTeamModal(true)}
            className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 lg:w-full"
          >
            <span className="w-5 text-center text-base">♙</span>
            My Team
          </button>
        </nav>

        <div className="hidden flex-1 lg:block" />

        <div className="hidden space-y-2 border-t border-slate-100 p-4 lg:block">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-800">My Wallet</p>
            <p className="mt-1 text-[11px] text-amber-700">Coming Soon</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            ↪ Sign out
          </button>
          <p className="px-2 pt-2 text-[10px] text-slate-400">Owned by Vineol</p>
        </div>
      </aside>

      {/* MAIN DASHBOARD AREA */}
      <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-9 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                FPL CLASH / MANAGER HUB
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                {section === "overview"
                  ? "Welcome back"
                  : section === "entries"
                    ? "My Entries"
                    : section === "competitions"
                      ? "Competitions"
                      : "Group Leaderboard"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {section === "overview"
                  ? "Your competitions and FPL activity at a glance."
                  : section === "entries"
                    ? "Track your gameweeks, groups and entry status."
                    : section === "competitions"
                      ? "Choose a gameweek and join your next clash."
                      : "Follow your group's official FPL standings."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (section === "competitions") {
                    window.dispatchEvent(new Event("fpl-refresh-competitions"));
                  } else if (section === "leaderboard") {
                    window.dispatchEvent(new Event("fpl-refresh-leaderboard"));
                  } else {
                    void loadDashboard(true);
                  }
                }}
                disabled={refreshing}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "↻ Refresh"}
              </button>
              <button
                onClick={() => void signOut()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 lg:hidden"
              >
                Sign out
              </button>
            </div>
          </header>

          {section === "overview" && (
            <OverviewSection
              entries={entries}
              entriesError={entriesError}
              activeEntries={activeEntries}
              visibleEntries={visibleEntries}
              filteredVisibleEntries={filteredVisibleEntries}
              entryFilter={entryFilter}
              setEntryFilter={setEntryFilter}
              firstEntry={firstEntry}
              team={team}
              teamReady={teamReady}
              teamError={teamError}
              myPoints={myPoints}
              myRank={myRank}
              leaderboard={leaderboard}
              leaderboardError={leaderboardError}
              leaderboardEntryId={leaderboardEntryId}
              now={now}
              groupSize={groupSize}
              groupParticipants={groupParticipants}
              groupProgress={groupProgress}
              onSectionChange={setSection}
              onOpenLeaderboard={openLeaderboard}
              onRefresh={() => void loadDashboard(true)}
              onManageTeam={() => router.push("/link-team")}
            />
          )}

          {section === "entries" && (
            <MyEntriesSection
              entries={entries}
              error={entriesError}
              onRefresh={() => void loadDashboard(true)}
              onBrowseCompetitions={() => setSection("competitions")}
              onOpenLeaderboard={openLeaderboard}
            />
          )}

          {section === "competitions" && (
            <CompetitionsSection
              onViewEntries={() => {
                setSection("entries");
                void loadDashboard(true);
              }}
            />
          )}

          {section === "leaderboard" && (
            <LeaderboardSection
              entries={activeEntries}
              selectedEntryId={selectedEntryId}
              onSelectEntry={setSelectedEntryId}
              onBack={() => setSection("entries")}
            />
          )}

          <footer className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 py-5 text-center sm:flex-row sm:text-left">
            <p className="text-[11px] leading-5 text-slate-400">
              FPL Clash is an independent concept and is not affiliated with or endorsed by the Premier League or Fantasy Premier League.
            </p>
            <p className="text-sm font-semibold italic text-slate-500">
              Owned by <span className="font-black not-italic text-emerald-700">Vineol</span>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* OVERVIEW                                                                    */
/* -------------------------------------------------------------------------- */

function OverviewSection({
  entries,
  entriesError,
  activeEntries,
  visibleEntries,
  filteredVisibleEntries,
  entryFilter,
  setEntryFilter,
  firstEntry,
  team,
  teamReady,
  teamError,
  myPoints,
  myRank,
  leaderboard,
  leaderboardError,
  leaderboardEntryId,
  now,
  groupSize,
  groupParticipants,
  groupProgress,
  onSectionChange,
  onOpenLeaderboard,
  onRefresh,
  onManageTeam,
}: {
  entries: Entry[];
  entriesError: string;
  activeEntries: Entry[];
  visibleEntries: Entry[];
  filteredVisibleEntries: Entry[];
  entryFilter: "all" | "open" | "upcoming";
  setEntryFilter: (value: "all" | "open" | "upcoming") => void;
  firstEntry: Entry | undefined;
  team: FPLTeam | null;
  teamReady: boolean;
  teamError: string;
  myPoints: unknown;
  myRank: unknown;
  leaderboard: LeaderboardRow[];
  leaderboardError: string;
  leaderboardEntryId: number | null;
  now: number;
  groupSize: number;
  groupParticipants: number;
  groupProgress: number;
  onSectionChange: (section: Section) => void;
  onOpenLeaderboard: (entryId: number) => void;
  onRefresh: () => void;
  onManageTeam: () => void;
}) {
  return (
    <>
      <section className="mt-7 overflow-hidden rounded-2xl bg-gradient-to-r from-[#123d30] to-[#17634a] p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">
              {firstEntry ? "Your selected competition" : "Your FPL Clash account"}
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              {firstEntry
                ? `Gameweek ${firstEntry.gameweek_number}`
                : "Your next challenge starts here"}
            </h2>
            <p className="mt-2 text-sm text-emerald-100/80">
              {firstEntry
                ? firstEntry.gameweek_name || `FPL Gameweek ${firstEntry.gameweek_number}`
                : "Link your team and join a competition to get started."}
            </p>
          </div>
          {firstEntry ? (
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                Deadline countdown
              </p>
              <p className="mt-1 text-xl font-black tabular-nums">
                {getCountdown(firstEntry.gameweek_deadline, now)}
              </p>
              <p className="mt-1 text-[10px] text-emerald-100/70">
                {formatDate(firstEntry.gameweek_deadline)} EAT
              </p>
            </div>
          ) : (
            <button
              onClick={() => onSectionChange("competitions")}
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-50"
            >
              Explore competitions →
            </button>
          )}
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="My active entries" value={activeEntries.length} note="Non-cancelled entries" />
        <StatCard
          label="Group members"
          value={firstEntry ? `${groupParticipants}/${groupSize}` : "—"}
          note={firstEntry ? "Players in your selected group" : "Join a competition"}
        />
        <StatCard label="Latest group points" value={displayValue(myPoints)} note="From your leaderboard" accent="green" />
        <StatCard label="Group position" value={displayValue(myRank)} note="Selected competition" accent="pink" />
      </section>

      <section className="mt-5 grid items-start gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Competition centre
                </p>
                <h2 className="mt-1 text-xl font-black">My gameweeks</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Track your entries, group progress and deadlines.
                </p>
              </div>
              <button
                onClick={() => onSectionChange("competitions")}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Find a gameweek ↗
              </button>
            </div>

            {visibleEntries.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Filter gameweeks
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["all", "open", "upcoming"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setEntryFilter(filter)}
                      aria-pressed={entryFilter === filter}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
                        entryFilter === filter
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                      }`}
                    >
                      {filter === "all" ? "All active" : filter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entriesError ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">{entriesError}</p>
                <button onClick={onRefresh} className="mt-3 text-sm font-bold text-emerald-700">
                  Try again →
                </button>
              </div>
            ) : visibleEntries.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <p className="font-bold">Your first competition starts here.</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Browse available gameweeks and join a group to see your competition progress here.
                </p>
                <button
                  onClick={() => onSectionChange("competitions")}
                  className="mt-4 text-sm font-bold text-emerald-700"
                >
                  Browse competitions →
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {filteredVisibleEntries.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                    No {entryFilter === "all" ? "active" : entryFilter} gameweeks to show. Try another filter.
                  </div>
                )}

                {filteredVisibleEntries.slice(0, 4).map((entry) => {
                  const maxPlayers = Number(entry.max_participants) || 10;
                  const players = Number(entry.participant_count) || 0;
                  const progress = Math.min(100, (players / maxPlayers) * 100);
                  const tier = getTierDetails(entry.entry_fee_pence);

                  return (
                    <article key={entry.entry_id} className="rounded-xl border border-slate-200 bg-[#fbfcfb] p-4 hover:border-emerald-300">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                            FPL GAMEWEEK {entry.gameweek_number}
                          </p>
                          <h3 className="mt-1 font-bold">
                            {entry.gameweek_name || `Gameweek ${entry.gameweek_number}`}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tier.style}`}>
                              {tier.name}{tier.price ? ` · ${tier.price}` : ""}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                              Group #{entry.group_number}
                            </span>
                          </div>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-800">
                          {entry.entry_status}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Group progress</span>
                            <span className="font-bold text-slate-700">{players}/{maxPlayers}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Deadline countdown</p>
                          <p className="mt-1 text-sm font-bold">{getCountdown(entry.gameweek_deadline, now)}</p>
                          <p className="mt-1 text-xs text-slate-400">{formatDate(entry.gameweek_deadline)} EAT</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3">
                        <button
                          onClick={() => onOpenLeaderboard(entry.entry_id)}
                          className="text-sm font-bold text-emerald-700 hover:text-emerald-800"
                        >
                          View group leaderboard →
                        </button>
                        <button
                          onClick={() => onSectionChange("entries")}
                          className="text-sm text-slate-500 hover:text-slate-800"
                        >
                          Entry details
                        </button>
                      </div>
                    </article>
                  );
                })}

                {filteredVisibleEntries.length > 4 && (
                  <button
                    onClick={() => onSectionChange("entries")}
                    className="block pt-2 text-sm font-bold text-emerald-700"
                  >
                    View all {filteredVisibleEntries.length} entries →
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Your competition
                </p>
                <h2 className="mt-1 text-xl font-black">Group leaderboard</h2>
              </div>
              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700">
                TOP 5
              </span>
            </div>

            {!firstEntry ? (
              <p className="mt-4 text-sm text-slate-500">Join a competition to unlock your group standings.</p>
            ) : leaderboardError ? (
              <p className="mt-4 text-sm text-slate-500">{leaderboardError}</p>
            ) : leaderboard.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No leaderboard rows are available yet. Scores will appear here when the leaderboard data is available.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {leaderboard.slice(0, 5).map((row, index) => {
                  const rank = getRowValue(row, ["rank", "position", "group_rank", "rank_position"]);
                  const name = getRowValue(row, ["team_name", "fpl_team_name", "name", "display_name"]);
                  const points = getRowValue(row, ["points", "total_points", "gameweek_points", "score"]);
                  const isMe = Number(getRowValue(row, ["entry_id", "my_entry_id"])) === leaderboardEntryId;

                  return (
                    <div key={`${displayValue(rank)}-${index}`} className={`grid grid-cols-[42px_1fr_70px] items-center gap-3 rounded-xl px-3 py-3 ${isMe ? "border border-emerald-200 bg-emerald-50" : "bg-slate-50"}`}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-black">
                        {displayValue(rank) === "—" ? index + 1 : displayValue(rank)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{displayValue(name)}</p>
                        {isMe && <span className="text-[10px] font-bold text-emerald-700">YOU</span>}
                      </div>
                      <p className="text-right text-sm font-black text-emerald-700">{displayValue(points)}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {firstEntry && (
              <button
                onClick={() => onOpenLeaderboard(firstEntry.entry_id)}
                className="mt-5 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
              >
                View full leaderboard →
              </button>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-[#153f32] to-[#1b7352] p-5 text-white sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">My FPL team</p>
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${teamReady ? "bg-white/15 text-white" : "bg-amber-200/20 text-amber-100"}`}>
                  {teamReady ? "✓ VERIFIED" : team ? "UNVERIFIED" : "NOT LINKED"}
                </span>
              </div>
              <div className="mt-6 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl">⚽</div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black">{team?.team_name || "Your FPL team"}</h2>
                  <p className="mt-1 text-xs text-emerald-100/80">
                    {team ? `Official FPL ID: ${team.fpl_team_id}` : "Connect your official FPL team"}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              {teamError && <p className="mb-3 text-xs text-amber-700">{teamError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Latest points</p>
                  <p className="mt-2 text-2xl font-black text-emerald-700">{displayValue(myPoints)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Group rank</p>
                  <p className="mt-2 text-2xl font-black text-pink-600">{displayValue(myRank)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                Points and rank are based on your selected competition's leaderboard data.
              </p>
              <button onClick={onManageTeam} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                {team ? "Manage FPL team" : "Link FPL team"} →
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Group activity</p>
                <h2 className="mt-1 text-lg font-black">Group capacity</h2>
              </div>
              <span className="text-2xl">👥</span>
            </div>
            {firstEntry ? (
              <>
                <div className="mt-5 flex items-end justify-between">
                  <p className="text-3xl font-black">{groupParticipants}<span className="text-base font-semibold text-slate-400">/{groupSize}</span></p>
                  <p className="text-xs font-semibold text-slate-500">Group #{firstEntry.group_number}</p>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${groupProgress}%` }} />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {Math.max(0, groupSize - groupParticipants)} places remaining in your selected group.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Your group progress will appear here after you join a competition.</p>
            )}
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">My Wallet</p>
            <h2 className="mt-1 text-lg font-black text-amber-950">Coming Soon</h2>
            <p className="mt-2 text-xs leading-5 text-amber-800">Wallet services are not currently available.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Competition formats</p>
            <h2 className="mt-1 text-lg font-black">Choose your clash</h2>
            <div className="mt-4 space-y-3">
              {TIERS.map((tier) => (
                <div key={tier.feePence} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{tier.name}</p>
                    <p className="text-[11px] text-slate-400">{tier.available ? "Available" : "Coming Soon"}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-600">{tier.price}</span>
                </div>
              ))}
            </div>
            <button onClick={() => onSectionChange("competitions")} className="mt-4 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-700">
              Explore competitions →
            </button>
          </section>
        </div>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <button onClick={() => onSectionChange("competitions")} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300">
          <p className="text-sm text-slate-500">Ready for another round?</p>
          <h3 className="mt-2 font-black group-hover:text-emerald-700">Explore competitions ↗</h3>
          <p className="mt-2 text-xs text-slate-400">Browse available gameweeks and join an eligible group.</p>
        </button>
        <button onClick={() => onSectionChange("entries")} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300">
          <p className="text-sm text-slate-500">Your competition history</p>
          <h3 className="mt-2 font-black group-hover:text-emerald-700">Manage my entries ↗</h3>
          <p className="mt-2 text-xs text-slate-400">Review entry statuses and open your group leaderboards.</p>
        </button>
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string | number;
  note: string;
  accent?: "green" | "pink";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${accent === "green" ? "text-emerald-700" : accent === "pink" ? "text-pink-600" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MY ENTRIES                                                                  */
/* -------------------------------------------------------------------------- */

function MyEntriesSection({
  entries,
  error,
  onRefresh,
  onBrowseCompetitions,
  onOpenLeaderboard,
}: {
  entries: Entry[];
  error: string;
  onRefresh: () => void;
  onBrowseCompetitions: () => void;
  onOpenLeaderboard: (entryId: number) => void;
}) {
  const pendingCount = entries.filter((entry) => entry.entry_status === "pending").length;
  const activeGroups = new Set(
    entries
      .filter((entry) => entry.entry_status !== "cancelled")
      .map((entry) => `${entry.gameweek_number}-${entry.group_number}`)
  ).size;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          eyebrow="Your competitions"
          title="My Entries"
          description="Track your gameweeks, groups and entry status."
        />
        <button onClick={onRefresh} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          Refresh entries
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total entries" value={entries.length} note="All entries" />
        <StatCard label="Pending entries" value={pendingCount} note="Awaiting confirmation" />
        <StatCard label="Active groups" value={activeGroups} note="Non-cancelled groups" />
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">Could not load your entries</p>
          <p className="mt-1">{error}</p>
          <button onClick={onRefresh} className="mt-3 font-bold underline">Try again</button>
        </div>
      )}

      {!error && entries.length === 0 && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h3 className="text-xl font-bold">No entries yet</h3>
          <p className="mt-2 text-slate-500">Join an available competition to see it here.</p>
          <button onClick={onBrowseCompetitions} className="mt-5 rounded-lg bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700">
            Browse competitions
          </button>
        </div>
      )}

      {!error && entries.length > 0 && (
        <div className="mt-8 space-y-5">
          {entries.map((entry) => (
            <article key={entry.entry_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-emerald-700">Entry #{entry.entry_id}</p>
                  <h3 className="mt-1 text-xl font-bold">{entry.gameweek_name || `Gameweek ${entry.gameweek_number}`}</h3>
                  <p className="mt-1 text-sm text-slate-400">Official FPL Gameweek {entry.gameweek_number}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyle(entry.entry_status)}`}>
                  {entry.entry_status}
                </span>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <InfoCell label="Group" value={`Group ${entry.group_number}`} />
                <div>
                  <p className="text-sm text-slate-500">Group participants</p>
                  <p className="mt-1 text-lg font-bold">{entry.participant_count} of {entry.max_participants}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${entry.max_participants > 0 ? Math.min(100, (entry.participant_count / entry.max_participants) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Group status</p>
                  <span className={`mt-1 inline-block rounded-full px-3 py-1 text-sm capitalize ${statusStyle(entry.group_status)}`}>
                    {entry.group_status}
                  </span>
                </div>
                <InfoCell label="FPL team" value={entry.team_name} detail={`Team ID: ${entry.official_fpl_team_id}`} />
                <InfoCell label="Gameweek deadline" value={formatDate(entry.gameweek_deadline)} />
                <InfoCell label="Entry created" value={formatDate(entry.entry_created_at)} />
              </div>

              {entry.entry_status !== "cancelled" && (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <h4 className="font-bold text-emerald-900">Payment information</h4>
                  <p className="mt-1 text-sm text-emerald-800">
                    {Number(entry.entry_fee_pence) === 0
                      ? "Free Clash · No payment required."
                      : `${getTierDetails(entry.entry_fee_pence).name} · ${getTierDetails(entry.entry_fee_pence).price}`}
                  </p>
                  <p className="mt-2 text-xs text-emerald-700">
                    Paid competition tiers and M-Pesa payments are currently coming soon.
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">Payment status is tracked separately from entry status.</p>
                <button
                  onClick={() => onOpenLeaderboard(entry.entry_id)}
                  className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  View Group Leaderboard →
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function InfoCell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      {detail && <p className="text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* COMPETITIONS                                                                */
/* -------------------------------------------------------------------------- */

function CompetitionsSection({
  onViewEntries,
}: {
  onViewEntries: () => void;
}) {
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [groups, setGroups] = useState<AvailableGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<JoinResult | null>(null);

  const loadCompetitions = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setMessage("Please sign in to view competitions.");
      setLoading(false);
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
      setMessage("Please link and verify your FPL team before joining competitions.");
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
      setMessage("Could not load competitions. Please refresh.");
      setLoading(false);
      return;
    }

    const loadedGameweeks = (data ?? []) as Gameweek[];
    setGameweeks(loadedGameweeks);

    const { data: groupData, error: groupError } = await supabase.rpc("get_group_availability");

    if (groupError) {
      console.error("Could not load group availability:", groupError.message);
      setGroups([]);
      setMessage("Gameweeks loaded, but group availability could not be loaded. Please refresh.");
    } else {
      const visibleIds = new Set(loadedGameweeks.map((gameweek) => gameweek.id));
      setGroups(
        ((groupData ?? []) as AvailableGroup[]).filter((group) =>
          visibleIds.has(Number(group.gameweek_id))
        )
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCompetitions();

    const refreshHandler = () => void loadCompetitions();
    window.addEventListener("fpl-refresh-competitions", refreshHandler);

    return () => {
      window.removeEventListener("fpl-refresh-competitions", refreshHandler);
    };
  }, [loadCompetitions]);

  async function joinCompetition(gameweekId: number, tier: Tier) {
    if (!tier.available || tier.feePence !== 0) {
      setMessage("This competition tier is coming soon.");
      return;
    }

    const requestId = `${gameweekId}-${tier.feePence}`;
    setJoiningId(requestId);
    setMessage("");
    setSuccess(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        setMessage("Please sign in to join this competition.");
        return;
      }

      const selected = gameweeks.find((gameweek) => gameweek.id === gameweekId);

      const valid =
        selected &&
        selected.status === "open" &&
        selected.fpl_gameweek_number >= 1 &&
        selected.fpl_gameweek_number <= 38 &&
        selected.deadline !== null &&
        new Date(selected.deadline).getTime() > Date.now();

      if (!valid) {
        setMessage("This gameweek is not currently available to join. Please refresh and try another gameweek.");
        await loadCompetitions();
        return;
      }

      const { data, error } = await supabase.rpc("join_gameweek", {
        p_gameweek_id: gameweekId,
        p_entry_fee_pence: 0,
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
    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Nairobi",
    });
  }

  return (
    <section className="mt-8">
      <SectionHeading
        eyebrow="Gameweek competitions"
        title="Choose your battle."
        description="Join a one-gameweek competition and compete against up to nine other managers for the highest official FPL score. Start with Free Clash. More tiers are coming soon."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Available tiers" value="1 Free" note="Free Clash is available" />
        <StatCard label="Managers per group" value="10" note="Maximum participants" />
        <StatCard label="Competition duration" value="1 Gameweek" note="One gameweek per entry" />
      </div>

      {message && (
        <div role="alert" className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {message}
          {message.includes("verify") && (
            <Link href="/link-team" className="ml-2 font-bold underline">Link your team</Link>
          )}
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold">Available gameweeks</h3>
          <button
            onClick={() => void loadCompetitions()}
            disabled={loading || joiningId !== null}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh gameweeks"}
          </button>
        </div>

        {loading ? (
          <p className="mt-5 text-slate-500">Loading available gameweeks...</p>
        ) : gameweeks.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-8">
            <h4 className="text-lg font-bold">No gameweeks available yet</h4>
            <p className="mt-2 text-slate-500">There are currently no upcoming gameweeks available to join. Please check again later.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {gameweeks.map((gameweek) => {
              const deadlineTime = gameweek.deadline ? new Date(gameweek.deadline).getTime() : 0;
              const deadlinePassed = !deadlineTime || deadlineTime <= Date.now();
              const canJoin =
                gameweek.status === "open" &&
                gameweek.fpl_gameweek_number >= 1 &&
                gameweek.fpl_gameweek_number <= 38 &&
                !deadlinePassed;

              return (
                <section key={gameweek.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-700">FPL GAMEWEEK {gameweek.fpl_gameweek_number}</p>
                      <h4 className="mt-1 text-2xl font-black">{gameweek.name}</h4>
                      <p className="mt-2 text-sm text-slate-500">Deadline: {formatDeadline(gameweek.deadline)} (EAT)</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${canJoin ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>
                      {canJoin ? "Open" : deadlinePassed ? "Deadline passed" : "Upcoming"}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {TIERS.map((tier) => {
                      const requestId = `${gameweek.id}-${tier.feePence}`;
                      const isJoining = joiningId === requestId;
                      const tierGroups = groups.filter(
                        (group) =>
                          Number(group.gameweek_id) === gameweek.id &&
                          Number(group.entry_fee_pence) === tier.feePence
                      );

                      return (
                        <article key={tier.feePence} className={`flex flex-col rounded-xl border ${tier.accent} bg-slate-50 p-5 ${!tier.available ? "opacity-80" : ""}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-700">{tier.name}</p>
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${tier.available ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>
                              {tier.available ? "Available" : "Coming Soon"}
                            </span>
                          </div>
                          <p className="mt-2 text-3xl font-black">{tier.price}</p>
                          <p className="mt-2 min-h-10 text-sm text-slate-500">{tier.description}</p>
                          <p className="mt-4 text-xs text-slate-400">One gameweek · 10 managers per group</p>

                          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing groups</p>
                            {tierGroups.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-500">No groups yet. You'll be in the first group.</p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {tierGroups.map((group) => {
                                  const count = Number(group.participant_count) || 0;
                                  const capacity = Number(group.max_participants) || 10;
                                  const spaces = Math.max(0, capacity - count);

                                  return (
                                    <div key={group.group_id} className="flex items-center justify-between gap-2 text-sm">
                                      <span className="text-slate-600">
                                        Group {group.group_number}{group.user_has_joined ? " · You joined" : ""}
                                      </span>
                                      <span className={spaces > 0 ? "font-semibold text-green-700" : "font-semibold text-slate-500"}>
                                        {count}/{capacity} · {spaces} spaces
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => void joinCompetition(gameweek.id, tier)}
                            disabled={!tier.available || !canJoin || joiningId !== null}
                            className={`mt-5 w-full rounded-lg px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                              tier.available ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-200 text-slate-500"
                            }`}
                          >
                            {isJoining ? "Joining..." : tier.available ? canJoin ? "Join Free Competition" : "Not currently available" : "Coming Soon"}
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

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="entry-confirmed-title" className="w-full max-w-lg rounded-2xl border border-green-200 bg-white p-6 shadow-2xl">
            <div className="flex justify-end">
              <button type="button" onClick={() => setSuccess(null)} aria-label="Close confirmation" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50">×</button>
            </div>
            <h3 id="entry-confirmed-title" className="text-xl font-bold text-green-700">You're in! Entry confirmed.</h3>
            <p className="mt-3 text-slate-700">Free Clash · Group {success.group_number}</p>
            <p className="mt-2 text-sm text-slate-600">Participants: {success.participant_count} of {success.max_participants}</p>
            <p className="mt-2 text-sm text-slate-500">Entry #{success.entry_id} · Confirmed · No payment required</p>
            <button onClick={onViewEntries} className="mt-6 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
              View my entries
            </button>
            <button onClick={() => setSuccess(null)} className="mt-3 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold hover:bg-slate-50">
              Back to competitions
            </button>
          </section>
        </div>
      )}

      <p className="mt-10 text-center text-xs leading-6 text-slate-500">
        FPL Clash free competitions are currently available. Paid tiers and M-Pesa payments are coming soon. FPL Clash is an independent concept and is not affiliated with or endorsed by the Premier League.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* LEADERBOARD                                                                 */
/* -------------------------------------------------------------------------- */

function LeaderboardSection({
  entries,
  selectedEntryId,
  onSelectEntry,
  onBack,
}: {
  entries: Entry[];
  selectedEntryId: number | null;
  onSelectEntry: (entryId: number) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const usableEntries = entries.filter((entry) => entry.entry_status !== "cancelled");

  const activeEntryId =
    selectedEntryId && usableEntries.some((entry) => entry.entry_id === selectedEntryId)
      ? selectedEntryId
      : usableEntries[0]?.entry_id ?? null;

  const loadLeaderboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      if (!activeEntryId || !Number.isSafeInteger(activeEntryId) || activeEntryId <= 0) {
        throw new Error("Join a competition before opening a group leaderboard.");
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error("Please sign in to view your leaderboard.");
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_my_group_leaderboard",
        { p_entry_id: activeEntryId }
      );

      if (rpcError) throw new Error(rpcError.message);

      setRows((data ?? []) as LeaderboardEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the leaderboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeEntryId]);

  useEffect(() => {
    void loadLeaderboard();

    const refreshHandler = () => void loadLeaderboard(true);
    window.addEventListener("fpl-refresh-leaderboard", refreshHandler);

    return () => {
      window.removeEventListener("fpl-refresh-leaderboard", refreshHandler);
    };
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
    <section className="mt-8">
      <SectionHeading
        eyebrow="Your competition"
        title="Group Leaderboard"
        description="See how your group is performing using official FPL scores."
      />

      {usableEntries.length > 1 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <label htmlFor="leaderboard-entry" className="block text-sm font-semibold text-slate-600">
            Select competition
          </label>
          <select
            id="leaderboard-entry"
            value={activeEntryId ?? ""}
            onChange={(event) => onSelectEntry(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm"
          >
            {usableEntries.map((entry) => (
              <option key={entry.entry_id} value={entry.entry_id}>
                {entry.gameweek_name || `Gameweek ${entry.gameweek_number}`} · Group {entry.group_number} · Entry #{entry.entry_id}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {first && (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-slate-100 px-3 py-2">Gameweek {first.gameweek_number}</span>
            <span className="rounded-lg bg-slate-100 px-3 py-2">Group {first.group_number}</span>
            <span className="rounded-lg bg-slate-100 px-3 py-2">{first.participant_count} / {first.max_participants} players</span>
          </div>
        )}

        {first && <p className="mt-4 text-sm text-slate-600">{standingsMessage}</p>}

        {first && scoredEntries > 0 && (
          <p className="mt-2 text-xs text-slate-500">{scoredEntries} of {rows.length} participants have scores.</p>
        )}

        <button
          type="button"
          onClick={() => void loadLeaderboard(true)}
          disabled={loading || refreshing}
          className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh Leaderboard"}
        </button>
      </div>

      {loading && <p className="mt-8 text-slate-500">Loading leaderboard...</p>}

      {!loading && error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
          <button type="button" onClick={() => void loadLeaderboard(true)} className="ml-3 underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-slate-500">
          No participants were found for this entry.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[48px_minmax(0,1fr)_80px] gap-3 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-500 sm:grid-cols-[60px_minmax(0,1fr)_100px_100px]">
            <span>Rank</span>
            <span>FPL Team</span>
            <span className="text-right">Points</span>
            <span className="hidden text-right sm:block">Status</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.entry_id}
              className={`grid grid-cols-[48px_minmax(0,1fr)_80px] gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-[60px_minmax(0,1fr)_100px_100px] ${
                row.is_current_user ? "bg-emerald-50" : "bg-white"
              }`}
            >
              <div className="font-bold text-emerald-700">{row.rank_position ?? "—"}</div>
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {row.team_name}
                  {row.is_current_user && <span className="ml-2 text-xs text-emerald-600">You</span>}
                </p>
                <p className="mt-1 text-xs text-slate-400">FPL Team ID: {row.official_fpl_team_id}</p>
                <p className="mt-1 text-xs text-slate-500 sm:hidden">{row.score_status}</p>
              </div>
              <div className="text-right font-semibold">{row.points ?? "—"}</div>
              <div className="hidden text-right text-sm text-slate-500 sm:block">{row.score_status}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <button onClick={onBack} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          ← Back to My Entries
        </button>
        <p className="text-xs text-slate-400">
          Test mode · No payments taken · Scores are retrieved through the development FPL sync process.
        </p>
      </div>
    </section>
  );
}

export default DashboardPage;
