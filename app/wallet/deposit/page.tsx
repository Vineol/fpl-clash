
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function WalletDepositPage() {
  const router = useRouter();

  const [amount, setAmount] = useState("50");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleDeposit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setSuccess(false);

    const amountNumber = Number(amount);

    if (
      !Number.isSafeInteger(amountNumber) ||
      amountNumber < 1 ||
      amountNumber > 150000
    ) {
      setMessage("Enter a whole-number amount between KSh 1 and KSh 150,000.");
      return;
    }

    if (!phone.trim()) {
      setMessage("Enter your M-Pesa phone number.");
      return;
    }

    setLoading(true);

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        router.push("/auth");
        return;
      }

      const response = await fetch("/api/wallet/deposit/stk-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          amount: amountNumber,
          phone: phone.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error ?? "Could not initiate your deposit.");
        return;
      }

      setSuccess(true);
      setMessage(
        `M-Pesa prompt sent for KSh ${amountNumber.toLocaleString("en-KE")}. Check your phone and complete the payment. Your wallet will update after confirmation.`
      );
    } catch (error) {
      console.error("Wallet deposit error:", error);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#071b16] px-4 py-10 text-white">
      <div className="mx-auto max-w-lg">
        <button
          onClick={() => router.push("/wallet")}
          className="mb-8 text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← Back to Wallet
        </button>

        <section className="rounded-2xl border border-emerald-900 bg-[#102820] p-6 shadow-xl">
          <h1 className="text-2xl font-bold">Deposit to Wallet</h1>

          <p className="mt-2 text-sm text-gray-400">
            Add money to your FPL Clash wallet using M-Pesa.
          </p>

          <form onSubmit={handleDeposit} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Amount (KES)
              </label>

              <input
                type="number"
                min="1"
                max="150000"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-emerald-900 bg-[#071b16] px-4 py-3 text-white outline-none focus:border-emerald-500"
                placeholder="Enter amount"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                M-Pesa Phone Number
              </label>

              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-emerald-900 bg-[#071b16] px-4 py-3 text-white outline-none focus:border-emerald-500"
                placeholder="07XXXXXXXX or 2547XXXXXXXX"
              />
            </div>

            {message && (
              <div
                className={`rounded-lg p-4 text-sm ${
                  success
                    ? "border border-emerald-700 bg-emerald-950 text-emerald-300"
                    : "border border-red-800 bg-red-950 text-red-300"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-[#071b16] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending M-Pesa Prompt..." : "Deposit with M-Pesa"}
            </button>
          </form>

          <p className="mt-6 text-xs leading-5 text-gray-400">
            Your wallet is credited only after M-Pesa confirms a successful
            payment. Do not repeat a payment while an earlier request is
            awaiting confirmation.
          </p>
        </section>
      </div>
    </main>
  );
}
