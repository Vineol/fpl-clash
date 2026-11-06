
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type FPLTeam = {
  fpl_team_id: number;
  team_name: string | null;
  verified: boolean;
};

export default function LinkTeamPage() {
  const router = useRouter();

  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [savedTeam, setSavedTeam] = useState<FPLTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [lastCheckedName, setLastCheckedName] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "error" | "success" | "info"
  >("info");

  useEffect(() => {
    let active = true;

    async function loadTeam() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        router.replace("/auth");
        return;
      }

      const { data: team, error: teamError } = await supabase
        .from("fpl_teams")
        .select("fpl_team_id, team_name, verified")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!active) return;

      if (teamError) {
        setMessage("Could not load your saved team. Please refresh.");
        setMessageType("error");
      } else if (team) {
        setSavedTeam({
          fpl_team_id: Number(team.fpl_team_id),
          team_name: team.team_name,
          verified: team.verified,
        });
        setTeamId(String(team.fpl_team_id));
        setTeamName(team.team_name ?? "");
      }

      setLoading(false);
    }

    loadTeam();

    return () => {
      active = false;
    };
  }, [router]);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      router.replace("/auth");
      throw new Error("Please sign in again.");
    }

    return data.session.access_token;
  }

  async function saveTeam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    const trimmedId = teamId.trim();

    if (!/^[1-9]\d*$/.test(trimmedId)) {
      setMessage("Enter a valid positive numeric FPL Team ID.");
      setMessageType("error");
      return;
    }

    const numericTeamId = Number(trimmedId);

    if (!Number.isSafeInteger(numericTeamId)) {
      setMessage("That Team ID is too large. Please check it.");
      setMessageType("error");
      return;
    }

    if (savedTeam) {
      setMessage("A team is already linked to your account.");
      setMessageType("info");
      return;
    }

    setSaving(true);
    setMessage("Checking your Team ID with FPL...");
    setMessageType("info");

    try {
      const { data, error: userError } = await supabase.auth.getUser();

      if (userError || !data.user) {
        router.replace("/auth");
        return;
      }

      const response = await fetch(`/api/fpl-team/${numericTeamId}`, {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.valid) {
        throw new Error(result.error || "Could not validate this FPL Team ID.");
      }

      if (
        Number(result.teamId) !== numericTeamId ||
        typeof result.teamName !== "string" ||
        !result.teamName.trim()
      ) {
        throw new Error("FPL returned unexpected team details. Please retry.");
      }

      const officialTeamName: string = result.teamName.trim();

      const { error: insertError } = await supabase
        .from("fpl_teams")
        .insert({
          user_id: data.user.id,
          fpl_team_id: numericTeamId,
          team_name: officialTeamName,
          verified: false,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          throw new Error(
            "This FPL Team ID is already linked, or your account already has a team."
          );
        }

        throw insertError;
      }

      setTeamName(officialTeamName);
      setSavedTeam({
        fpl_team_id: numericTeamId,
        team_name: officialTeamName,
        verified: false,
      });

      setMessage(
        `FPL team saved: ${officialTeamName}. Ownership is not yet verified.`
      );
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to validate or save your team."
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function generateCode() {
    if (!savedTeam || generating || savedTeam.verified) return;

    setGenerating(true);
    setMessage("Generating your temporary verification code...");
    setMessageType("info");

    try {
      const token = await getAccessToken();

      const response = await fetch("/api/fpl-team/verification", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not generate a code.");
      }

      if (!result.code) {
        throw new Error(result.message || "No verification code was returned.");
      }

      setVerificationCode(result.code);
      setMessage(
        "Code generated. Add it to your official FPL team name, then verify here. It expires in 15 minutes."
      );
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not generate a code."
      );
      setMessageType("error");
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!verificationCode) return;

    try {
      await navigator.clipboard.writeText(verificationCode);
      setMessage("Verification code copied.");
      setMessageType("success");
    } catch {
      setMessage(
        "Copy failed. Select the code and copy it manually."
      );
      setMessageType("error");
    }
  }

  async function verifyOwnership() {
    if (!savedTeam || verifying || savedTeam.verified) return;

    setVerifying(true);
    setMessage("Checking your official FPL team name...");
    setMessageType("info");

    try {
      const token = await getAccessToken();

      const response = await fetch("/api/fpl-team/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.verified) {
        throw new Error(
          result.error || "Ownership verification was unsuccessful."
        );
      }

      setSavedTeam({
        ...savedTeam,
        team_name: result.teamName ?? savedTeam.team_name,
        verified: true,
      });

      setTeamName(result.teamName ?? teamName);
      setVerificationCode("");
      setMessage("Ownership verification successful!");
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not verify ownership."
      );
      setMessageType("error");
    } finally {
      setVerifying(false);
    }
  }

  async function recheckTeam() {
    if (!savedTeam || rechecking) return;

    setRechecking(true);
    setMessage("Checking your saved team with FPL...");
    setMessageType("info");
    setLastCheckedName("");

    try {
      const response = await fetch(
        `/api/fpl-team/${savedTeam.fpl_team_id}`,
        { cache: "no-store" }
      );

      const result = await response.json();

      if (
        !response.ok ||
        !result.valid ||
        Number(result.teamId) !== savedTeam.fpl_team_id ||
        typeof result.teamName !== "string" ||
        !result.teamName.trim()
      ) {
        throw new Error(result.error || "Could not confirm this team with FPL.");
      }

      const currentName: string = result.teamName.trim();

      setLastCheckedName(currentName);
      setMessage(
        `FPL check successful. Current team name: "${currentName}". This check alone does not prove ownership.`
      );
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not check your team. Please try again."
      );
      setMessageType("error");
    } finally {
      setRechecking(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading your team...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <a
          href="/dashboard"
          className="font-black tracking-widest text-green-400"
        >
          ← FPL CLASH
        </a>

        <section className="mt-10 rounded-2xl border border-white/10 bg-slate-900 p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-green-400">
            Team setup
          </p>

          <h1 className="mt-3 text-3xl font-black">Link your FPL team</h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Enter the ID of your existing official Fantasy Premier League team.
            We check that FPL returns a matching team before saving it. You
            never need to provide your FPL password.
          </p>

          <form onSubmit={saveTeam} className="mt-8 space-y-5">
            <div>
              <label htmlFor="teamId" className="mb-2 block text-sm font-medium">
                FPL Team ID
              </label>

              <input
                id="teamId"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                disabled={Boolean(savedTeam) || saving}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="e.g. 1234567"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-400 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="teamName"
                className="mb-2 block text-sm font-medium"
              >
                Official FPL team name
              </label>

              <input
                id="teamName"
                type="text"
                readOnly
                value={savedTeam?.team_name ?? teamName}
                placeholder="Retrieved from FPL after checking"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-slate-300 outline-none"
              />
              <p className="mt-2 text-xs text-slate-500">
                This name is retrieved from FPL, not entered manually.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving || Boolean(savedTeam)}
              className="w-full rounded-lg bg-green-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
            >
              {saving
                ? "Checking and saving..."
                : savedTeam
                  ? "Team linked"
                  : "Verify and save Team ID"}
            </button>
          </form>

          {savedTeam && (
            <div className="mt-5 rounded-lg border border-white/10 bg-slate-950 p-4">
              <p className="font-semibold">
                {savedTeam.team_name || "Your FPL team"}
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Team ID: {savedTeam.fpl_team_id}
              </p>

              <p
                className={`mt-2 text-sm ${
                  savedTeam.verified ? "text-green-400" : "text-amber-400"
                }`}
              >
                {savedTeam.verified
                  ? "Ownership verified"
                  : "Pending ownership verification"}
              </p>

              {!savedTeam.verified && (
                <div className="mt-5 space-y-3">
                  <button
                    type="button"
                    onClick={generateCode}
                    disabled={generating || verifying}
                    className="w-full rounded-lg bg-green-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
                  >
                    {generating
                      ? "Generating code..."
                      : verificationCode
                        ? "Generate a new code"
                        : "Generate Verification Code"}
                  </button>

                  {verificationCode && (
                    <div className="rounded-lg border border-green-400/40 bg-green-400/5 p-4">
                      <p className="text-sm text-slate-300">
                        Your temporary code
                      </p>

                      <p className="my-3 break-all text-center text-2xl font-black tracking-wider text-green-400">
                        {verificationCode}
                      </p>

                      <button
                        type="button"
                        onClick={copyCode}
                        className="w-full rounded-lg border border-white/20 px-4 py-2 font-semibold hover:bg-white/5"
                      >
                        Copy Code
                      </button>

                      <p className="mt-3 text-xs leading-5 text-slate-400">
                        Open your official FPL account and temporarily add
                        this exact code to your team name. Save the change,
                        then return here and select Verify Ownership. The
                        code expires after 15 minutes.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={verifyOwnership}
                    disabled={verifying || generating}
                    className="w-full rounded-lg border border-green-400 px-4 py-3 font-semibold text-green-400 transition hover:bg-green-400/10 disabled:opacity-60"
                  >
                    {verifying ? "Verifying..." : "Verify Ownership"}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={recheckTeam}
                disabled={rechecking}
                className="mt-4 w-full rounded-lg border border-white/20 px-4 py-3 font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-60"
              >
                {rechecking ? "Rechecking..." : "Recheck Team"}
              </button>

              {lastCheckedName && (
                <p className="mt-3 text-xs text-slate-400">
                  Latest FPL team name: {lastCheckedName}
                </p>
              )}
            </div>
          )}

          {message && (
            <p
              role="status"
              aria-live="polite"
              className={`mt-5 break-words text-sm ${
                messageType === "error"
                  ? "text-red-400"
                  : messageType === "success"
                    ? "text-green-400"
                    : "text-slate-300"
              }`}
            >
              {message}
            </p>
          )}

          <p className="mt-6 text-xs leading-5 text-slate-500">
            Team linking and ownership verification are separate checks.
            Paid competition entry is not enabled on this page.
          </p>
        </section>
      </div>
    </main>
  );
}
