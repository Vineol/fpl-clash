
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

async function handlePasswordReset() {
  if (!email.trim()) {
    setMessage("Enter your email address first.");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }
    );

    if (error) throw error;

    setMessage(
      "If an account exists for this email, a recovery link has been sent. Check your inbox."
    );
  } catch (error) {
    setMessage(
      error instanceof Error
        ? error.message
        : "Unable to request password recovery."
    );
  } finally {
    setLoading(false);
  }
}

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isLogin) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  router.replace("/dashboard");
  return;
} else {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  setMessage(
    data.session
      ? "Account created successfully!"
      : "Account created. Check your email to confirm your address."
  );
}
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-xl">
        <a href="/" className="text-sm font-bold tracking-widest text-green-400">
          ← FPL CLASH
        </a>

        <h1 className="mt-8 text-3xl font-black">
          {isLogin ? "Welcome back" : "Join the competition"}
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          {isLogin
            ? "Sign in to continue to FPL Clash."
            : "Create an account to get started."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-400"
              placeholder="At least 8 characters"
            />{isLogin && (
  <button
    type="button"
    onClick={handlePasswordReset}
    disabled={loading}
    className="text-sm font-semibold text-green-400 hover:text-green-300"
  >
    Forgot password?
  </button>
)}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-green-300 disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : isLogin
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {message && (
          <p
            role="status"
            className="mt-5 rounded-lg bg-slate-800 p-3 text-sm text-slate-200"
          >
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-slate-400">
          {isLogin ? "New to FPL Clash?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setMessage("");
            }}
            className="font-semibold text-green-400 hover:text-green-300"
          >
            {isLogin ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
