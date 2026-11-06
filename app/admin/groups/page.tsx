
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type CompetitionGroup = {
  id: number;
  gameweek_id: number;
  group_number: number;
  max_participants: number;
  status: string;
  gameweek_number: number | null;
  gameweek_name: string;
  gameweek_status: string;
  deadline: string | null;
  participant_count: number;
  spaces_remaining: number;
  is_full: boolean;
};

type GroupData = {
  groups: CompetitionGroup[];
  summary: {
    total_groups: number;
    total_participants: number;
    full_groups: number;
    filling_groups: number;
  };
};

export default function AdminGroupsPage() {
  const [data, setData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadGroups = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setError("Please sign in to access group management.");
        setData(null);
        return;
      }

      const response = await fetch("/api/admin/groups", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load groups.");
      }

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  function formatDeadline(deadline: string | null) {
    if (!deadline) return "Not set";

    return new Date(deadline).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function statusClass(status: string) {
    switch (status.toLowerCase()) {
      case "full":
        return "bg-green-100 text-green-800";
      case "filling":
        return "bg-blue-100 text-blue-800";
      case "locked":
        return "bg-amber-100 text-amber-800";
      case "completed":
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
              Competition Groups
            </h1>

            <p className="mt-2 text-gray-600">
              Monitor group capacity and participant allocation.
            </p>
          </div>

          <button
            onClick={() => void loadGroups(true)}
            disabled={loading || refreshing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Groups"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
            Loading competition groups...
          </div>
        ) : data ? (
          <>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total Groups"
                value={data.summary.total_groups}
              />
              <StatCard
                title="Participants Allocated"
                value={data.summary.total_participants}
              />
              <StatCard
                title="Full Groups"
                value={data.summary.full_groups}
              />
              <StatCard
                title="Groups Still Filling"
                value={data.summary.filling_groups}
              />
            </div>

            {data.groups.length === 0 ? (
              <div className="rounded-xl border bg-white p-8 text-center">
                <h2 className="text-lg font-semibold">
                  No competition groups yet
                </h2>
                <p className="mt-2 text-gray-600">
                  Groups will appear here when participants join open gameweeks.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-gray-100 text-gray-600">
                      <tr>
                        <th className="px-5 py-4">Gameweek</th>
                        <th className="px-5 py-4">Group</th>
                        <th className="px-5 py-4">Participants</th>
                        <th className="px-5 py-4">Capacity</th>
                        <th className="px-5 py-4">Spaces Left</th>
                        <th className="px-5 py-4">Group Status</th>
                        <th className="px-5 py-4">Deadline</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {data.groups.map((group) => {
                        const progress = Math.min(
                          100,
                          (group.participant_count /
                            Math.max(1, group.max_participants)) *
                            100
                        );

                        return (
                          <tr key={group.id} className="hover:bg-gray-50">
                            <td className="px-5 py-4">
                              <div className="font-semibold">
                                {group.gameweek_number
                                  ? `Gameweek ${group.gameweek_number}`
                                  : group.gameweek_name}
                              </div>
                              <div className="mt-1 text-xs capitalize text-gray-500">
                                Gameweek: {group.gameweek_status}
                              </div>
                            </td>

                            <td className="px-5 py-4 font-medium">
                              Group {group.group_number}
                            </td>

                            <td className="px-5 py-4">
                              {group.participant_count}
                            </td>

                            <td className="px-5 py-4">
                              {group.max_participants}
                            </td>

                            <td className="px-5 py-4">
                              {group.spaces_remaining}
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(
                                  group.status
                                )}`}
                              >
                                {group.status}
                              </span>

                              <div className="mt-2 h-2 w-28 overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className="h-full rounded-full bg-blue-600"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </td>

                            <td className="px-5 py-4 text-gray-600">
                              {formatDeadline(group.deadline)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mt-4 text-sm text-gray-500">
              Participant counts include pending entries as well as confirmed
              entries. An allocated space does not mean payment has been received.
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
