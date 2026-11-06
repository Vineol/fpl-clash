
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Participant = {
  entry_id: number;
  user_id: string;
  email: string;
  entry_status: string;
  created_at: string;
  gameweek_number: number | null;
  gameweek_name: string;
  gameweek_status: string;
  deadline: string | null;
  group_number: number | null;
  group_capacity: number | null;
  group_status: string;
  official_fpl_team_id: number | null;
  team_name: string;
  manager_name: string | null;
  team_verified: boolean;
};

type ParticipantData = {
  participants: Participant[];
  summary: {
    total_entries: number;
    pending_entries: number;
    confirmed_entries: number;
    cancelled_entries: number;
  };
};

export default function AdminParticipantsPage() {
  const [data, setData] = useState<ParticipantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameweekFilter, setGameweekFilter] = useState("all");

  const loadParticipants = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setError("Please sign in to access participant management.");
        setData(null);
        return;
      }

      const response = await fetch("/api/admin/participants", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load participants.");
      }

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  const participants = data?.participants ?? [];

  const gameweeks = Array.from(
    new Map(
      participants.map((participant) => [
        String(participant.gameweek_number ?? participant.gameweek_name),
        {
          value: String(
            participant.gameweek_number ?? participant.gameweek_name
          ),
          label: participant.gameweek_number
            ? `Gameweek ${participant.gameweek_number}`
            : participant.gameweek_name,
        },
      ])
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label));

  const filteredParticipants = participants.filter((participant) => {
    const searchText = search.trim().toLowerCase();

    const matchesSearch =
      !searchText ||
      participant.email.toLowerCase().includes(searchText) ||
      participant.team_name.toLowerCase().includes(searchText) ||
      String(participant.official_fpl_team_id ?? "").includes(searchText) ||
      String(participant.entry_id).includes(searchText);

    const matchesStatus =
      statusFilter === "all" ||
      participant.entry_status === statusFilter;

    const participantGameweek = String(
      participant.gameweek_number ?? participant.gameweek_name
    );

    const matchesGameweek =
      gameweekFilter === "all" ||
      participantGameweek === gameweekFilter;

    return matchesSearch && matchesStatus && matchesGameweek;
  });

  function statusClass(status: string) {
    switch (status.toLowerCase()) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-amber-100 text-amber-800";
      case "cancelled":
        return "bg-gray-200 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>

            <h1 className="mt-3 text-3xl font-bold">
              Participant Management
            </h1>

            <p className="mt-2 text-gray-600">
              View entries, FPL teams, gameweeks and group assignments.
            </p>
          </div>

          <button
            onClick={() => void loadParticipants(true)}
            disabled={loading || refreshing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Participants"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
            Loading participants...
          </div>
        ) : data ? (
          <>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total Entries"
                value={data.summary.total_entries}
              />
              <StatCard
                title="Pending"
                value={data.summary.pending_entries}
              />
              <StatCard
                title="Confirmed"
                value={data.summary.confirmed_entries}
              />
              <StatCard
                title="Cancelled"
                value={data.summary.cancelled_entries}
              />
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 md:grid-cols-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email, team, FPL ID or entry ID"
                className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              />

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="all">All entry statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                value={gameweekFilter}
                onChange={(event) => setGameweekFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="all">All gameweeks</option>
                {gameweeks.map((gameweek) => (
                  <option key={gameweek.value} value={gameweek.value}>
                    {gameweek.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3 text-sm text-gray-600">
              Showing {filteredParticipants.length} of {participants.length} entries
            </div>

            {filteredParticipants.length === 0 ? (
              <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
                No participants match your filters.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead className="bg-gray-100 text-gray-600">
                      <tr>
                        <th className="px-4 py-4">Entry</th>
                        <th className="px-4 py-4">Participant</th>
                        <th className="px-4 py-4">FPL Team</th>
                        <th className="px-4 py-4">Gameweek</th>
                        <th className="px-4 py-4">Group</th>
                        <th className="px-4 py-4">Entry Status</th>
                        <th className="px-4 py-4">Joined</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {filteredParticipants.map((participant) => (
                        <tr key={participant.entry_id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 font-semibold">
                            #{participant.entry_id}
                          </td>

                          <td className="px-4 py-4">
                            <div className="font-medium">
                              {participant.email}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              User ID: {participant.user_id.slice(0, 8)}…
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="font-medium">
                              {participant.team_name}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              FPL ID: {participant.official_fpl_team_id ?? "—"}
                            </div>
                            <span
                              className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                                participant.team_verified
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {participant.team_verified ? "Verified" : "Unverified"}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <div>
                              {participant.gameweek_number
                                ? `Gameweek ${participant.gameweek_number}`
                                : participant.gameweek_name}
                            </div>
                            <div className="mt-1 text-xs capitalize text-gray-500">
                              {participant.gameweek_status}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div>
                              {participant.group_number !== null
                                ? `Group ${participant.group_number}`
                                : "—"}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {participant.group_status}
                              {participant.group_capacity
                                ? ` · Capacity ${participant.group_capacity}`
                                : ""}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(
                                participant.entry_status
                              )}`}
                            >
                              {participant.entry_status}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-gray-600">
                            {new Date(participant.created_at).toLocaleString(
                              "en-KE",
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mt-4 text-sm text-gray-500">
              This page is read-only. Pending entries are not proof of payment,
              and no payment or entry status is changed here.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
