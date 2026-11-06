
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!data.session) {
        throw new Error(
          "Your recovery session is missing or expired. Request a new recovery email."
        );
      }

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setMessage(
        "Password updated successfully. You can now sign in with your new password."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-slate-900 p-8"
      >
        <a href="/" className="font-bold tracking-widest text-green-400">
          FPL CLASH
        </a>

        <h1 className="pt-4 text-3xl font-black">Reset your password</h1>

        <p className="text-sm text-slate-400">
          Choose a new password for your account.
        </p>

        <label className="block text-sm font-medium" htmlFor="new-password">
          New password
        </label>

        <input
          id="new-password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-400"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-green-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
        >
          {loading ? "Updating..." : "Update password"}
        </button>

        {message && (
          <p role="status" className="break-words text-sm text-slate-300">
            {message}
          </p>
        )}

        <a href="/auth" className="block text-sm text-green-400">
          Return to sign in
        </a>
      </form>
    </main>
  );
}
