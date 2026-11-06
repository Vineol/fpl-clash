
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

type Payment = {
  id: number;
  amount_kes: number;
  provider: string;
  provider_reference: string | null;
  status: PaymentStatus;
  created_at: string;
};

type RecordItem = {
  entry_id: number;
  user_id: string;
  email: string;
  entry_status: string;
  joined_at: string;
  gameweek: {
    fpl_gameweek_number: number;
    name: string;
    deadline: string;
  } | null;
  group: {
    group_number: number;
  } | null;
  team: {
    team_name: string;
    fpl_team_id: number;
    verified: boolean;
  } | null;
  payment: Payment | null;
};

type Summary = {
  total_entries: number;
  paid: number;
  pending: number;
  failed: number;
  refunded: number;
};

const emptySummary: Summary = {
  total_entries: 0,
  paid: 0,
  pending: 0,
  failed: 0,
  refunded: 0,
};

const statusStyles: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-slate-200 text-slate-700",
};

export default function AdminPaymentsPage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [drafts, setDrafts] = useState<
    Record<number, { status: PaymentStatus; reference: string }>
  >({});

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setError("Please log in to access the admin dashboard.");
        return;
      }

      const response = await fetch("/api/admin/payments", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load payments.");
      }

      setRecords(data.records || []);
      setSummary(data.summary || emptySummary);

      const nextDrafts: Record<
        number,
        { status: PaymentStatus; reference: string }
      > = {};

      for (const record of data.records || []) {
        nextDrafts[record.entry_id] = {
          status: record.payment?.status || "pending",
          reference: record.payment?.provider_reference || "",
        };
      }

      setDrafts(nextDrafts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const updateDraft = (
    entryId: number,
    field: "status" | "reference",
    value: string
  ) => {
    setDrafts((previous) => ({
      ...previous,
      [entryId]: {
        status: previous[entryId]?.status || "pending",
        reference: previous[entryId]?.reference || "",
        [field]: value,
      },
    }));
    setNotice("");
  };

  const savePayment = async (record: RecordItem) => {
    const draft = drafts[record.entry_id];

    if (!draft) return;

    if (draft.status === "paid" && !draft.reference.trim()) {
      setError(
        `Enter the payment reference for ${record.email || `entry #${record.entry_id}`} before marking it as paid.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Save payment status "${draft.status}" for entry #${record.entry_id}?\n\nOnly mark a payment as paid after independently confirming receipt.`
    );

    if (!confirmed) return;

    setSavingId(record.entry_id);
    setError("");
    setNotice("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const response = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          entryId: record.entry_id,
          status: draft.status,
          providerReference: draft.reference.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save payment.");
      }

      setNotice(`Payment record for entry #${record.entry_id} saved.`);
      await loadPayments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save payment."
      );
    } finally {
      setSavingId(null);
    }
  };

  const filteredRecords = records.filter((record) => {
    const draft = drafts[record.entry_id];
    const status = draft?.status || record.payment?.status || "pending";

    const matchesFilter = filter === "all" || status === filter;

    const searchText = [
      record.email,
      record.team?.team_name || "",
      record.team?.fpl_team_id?.toString() || "",
      record.entry_id.toString(),
      record.payment?.provider_reference || "",
      record.gameweek?.name || "",
    ]
      .join(" ")
      .toLowerCase();

    return matchesFilter && searchText.includes(search.toLowerCase());
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              Payment Reconciliation
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track entry fees, payment references and reconciliation status.
            </p>
          </div>

          <button
            onClick={() => void loadPayments()}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh records"}
          </button>
        </header>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Manual reconciliation only.</strong> A saved Paid status
          is an admin confirmation, not automatic M-Pesa verification.
          Verify the transaction independently before confirming receipt.
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Active entries", value: summary.total_entries },
            { label: "Paid records", value: summary.paid },
            { label: "Pending / missing", value: summary.pending },
            { label: "Failed", value: summary.failed },
            { label: "Refunded", value: summary.refunded },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-bold">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label
                htmlFor="payment-search"
                className="mb-2 block text-sm font-medium"
              >
                Search participants
              </label>
              <input
                id="payment-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Email, team name, FPL ID, entry ID or reference"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label
                htmlFor="payment-filter"
                className="mb-2 block text-sm font-medium"
              >
                Payment status
              </label>
              <select
                id="payment-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Entry payment records</h2>
            <span className="text-sm text-slate-500">
              {filteredRecords.length} record(s)
            </span>
          </div>

          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">
              Loading payment records...
            </p>
          ) : filteredRecords.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-medium">No matching records</p>
              <p className="mt-1 text-sm text-slate-500">
                Try another search or status filter.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Entry / Participant</th>
                    <th className="px-3 py-3">Competition</th>
                    <th className="px-3 py-3">Fee</th>
                    <th className="px-3 py-3">Reference</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Save</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((record) => {
                    const draft = drafts[record.entry_id] || {
                      status: "pending" as PaymentStatus,
                      reference: "",
                    };

                    const currentStatus =
                      record.payment?.status || "pending";

                    return (
                      <tr key={record.entry_id} className="align-top">
                        <td className="px-3 py-4">
                          <p className="font-semibold">
                            Entry #{record.entry_id}
                          </p>
                          <p className="mt-1 text-slate-600">
                            {record.email || "Email unavailable"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {record.team?.team_name || "No team name"}
                            {record.team?.verified ? " · Verified" : ""}
                          </p>
                        </td>

                        <td className="px-3 py-4">
                          <p>
                            {record.gameweek?.name ||
                              (record.gameweek
                                ? `Gameweek ${record.gameweek.fpl_gameweek_number}`
                                : "Unknown gameweek")}
                          </p>
                          <p className="mt-1 text-slate-500">
                            Group {record.group?.group_number ?? "—"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Entry: {record.entry_status}
                          </p>
                        </td>

                        <td className="px-3 py-4 font-semibold">
                          KSh {Number(record.payment?.amount_kes ?? 50).toFixed(2)}
                        </td>

                        <td className="px-3 py-4">
                          <input
                            aria-label={`Payment reference for entry ${record.entry_id}`}
                            value={draft.reference}
                            onChange={(event) =>
                              updateDraft(
                                record.entry_id,
                                "reference",
                                event.target.value
                              )
                            }
                            placeholder="M-Pesa reference"
                            maxLength={100}
                            className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                          />
                          {record.payment?.provider_reference && (
                            <p className="mt-1 text-xs text-slate-500">
                              Saved reference available
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-4">
                          <span
                            className={`mb-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[currentStatus]}`}
                          >
                            {record.payment
                              ? currentStatus.toUpperCase()
                              : "NO RECORD"}
                          </span>

                          <select
                            aria-label={`Payment status for entry ${record.entry_id}`}
                            value={draft.status}
                            onChange={(event) =>
                              updateDraft(
                                record.entry_id,
                                "status",
                                event.target.value
                              )
                            }
                            className="block w-32 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="failed">Failed</option>
                            <option value="refunded">Refunded</option>
                          </select>
                        </td>

                        <td className="px-3 py-4">
                          <button
                            onClick={() => void savePayment(record)}
                            disabled={savingId === record.entry_id}
                            className="rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingId === record.entry_id
                              ? "Saving..."
                              : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-slate-500">
          This page tracks payment records for active entries. It does not
          initiate M-Pesa payments or payouts, and it does not independently
          validate transaction references. Access and updates are restricted
          to authorized administrators.
        </p>
      </div>
    </main>
  );
}
