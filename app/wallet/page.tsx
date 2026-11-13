
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Wallet = {
  wallet_id: string;
  currency: string;
  available_balance_minor: number;
  reserved_balance_minor: number;
  created_at: string;
};

type WalletTransaction = {
  transaction_id: string;
  transaction_type: string;
  amount_minor_units: number;
  direction: string;
  status: string;
  description: string | null;
  created_at: string;
};

function formatKES(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  });
}

export default function WalletPage() {
  const router = useRouter();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadWallet = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/auth");
        return;
      }

      const [walletResult, transactionResult] = await Promise.all([
        supabase.rpc("get_my_wallet"),
        supabase.rpc("get_my_wallet_transactions", {
          p_limit: 20,
        }),
      ]);

      if (walletResult.error) {
        throw new Error(walletResult.error.message);
      }

      if (transactionResult.error) {
        throw new Error(transactionResult.error.message);
      }

      const walletData = (walletResult.data ?? []) as Wallet[];

      if (walletData.length === 0) {
        throw new Error(
          "Your wallet could not be found. Please contact support."
        );
      }

      setWallet(walletData[0]);
      setTransactions(
        (transactionResult.data ?? []) as WalletTransaction[]
      );
    } catch (err) {
      console.error("Wallet loading error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your wallet."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080D0B] text-white">
        <p className="text-slate-400">Loading your wallet...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080D0B] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">

        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="text-xl font-black tracking-widest">
            FPL <span className="text-green-400">CLASH</span>
          </Link>

          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="mt-9">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-green-400">
            Player finances
          </p>

          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            My Wallet
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Manage your FPL Clash funds and transaction history.
          </p>
        </section>

        {error ? (
          <div className="mt-8 rounded-xl border border-red-400/20 bg-red-400/5 p-5">
            <p className="text-sm text-red-300">{error}</p>

            <button
              onClick={() => void loadWallet(true)}
              className="mt-3 text-sm font-bold text-green-300"
            >
              Try again
            </button>
          </div>
        ) : wallet ? (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2">

              <div className="rounded-2xl border border-green-400/20 bg-gradient-to-br from-[#14241A] to-[#101814] p-6">
                <p className="text-sm text-slate-400">
                  Available balance
                </p>

                <p className="mt-3 text-3xl font-black text-green-300">
                  {formatKES(wallet.available_balance_minor)}
                </p>

                <p className="mt-3 text-xs text-slate-500">
                  Funds available for competition entries and withdrawals.
                </p>

                <button
                  onClick={() => router.push("/wallet/deposit")}
                  className="mt-5 w-full rounded-xl bg-green-400 px-5 py-3 font-bold text-[#080D0B] transition hover:bg-green-300 sm:w-auto"
                >
                  + Deposit with M-Pesa
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#101814] p-6">
                <p className="text-sm text-slate-400">
                  Reserved balance
                </p>

                <p className="mt-3 text-3xl font-black">
                  {formatKES(wallet.reserved_balance_minor)}
                </p>

                <p className="mt-3 text-xs text-slate-500">
                  Funds temporarily held for pending transactions.
                </p>
              </div>

            </section>

            <section className="mt-5 rounded-2xl border border-white/10 bg-[#101814] p-5 sm:p-6">

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">
                    Transaction history
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Your latest 20 wallet transactions.
                  </p>
                </div>

                <button
                  onClick={() => void loadWallet(true)}
                  disabled={refreshing}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-green-400/40 disabled:opacity-50"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-white/15 p-6 text-center">
                  <p className="font-bold">No transactions yet</p>

                  <p className="mt-2 text-sm text-slate-400">
                    Your deposits, competition entries, prizes and withdrawals will appear here.
                  </p>
                </div>
              ) : (
                <div className="mt-5 divide-y divide-white/10">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.transaction_id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div>
                        <p className="font-semibold capitalize">
                          {transaction.transaction_type.replaceAll("_", " ")}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {transaction.description || "Wallet transaction"}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(transaction.created_at)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className={`font-bold ${
                          transaction.direction === "credit"
                            ? "text-green-300"
                            : "text-white"
                        }`}>
                          {transaction.direction === "credit" ? "+" : "-"}
                          {formatKES(transaction.amount_minor_units)}
                        </p>

                        <p className="mt-1 text-xs capitalize text-slate-500">
                          {transaction.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </section>
          </>
        ) : null}

        <footer className="mt-8 border-t border-white/10 pt-5 text-center text-xs text-slate-500">
          FPL Clash Wallet · KES
        </footer>

      </div>
    </main>
  );
}
