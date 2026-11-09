"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error")
      ? "Sign-in failed. Try again."
      : "",
  );

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-8">
        <div>
          <h1 className="text-2xl font-semibold">LeadDaddy.ai</h1>
          <p className="mt-1 text-sm text-neutral-400">AI-first outbound. Sign in with your team credentials.</p>
        </div>

        <div className="flex rounded-lg border border-neutral-800 p-1 text-xs">
          {(["password", "magic"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(""); setSent(false); }}
              className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {m === "password" ? "Password" : "Magic link"}
            </button>
          ))}
        </div>

        {sent ? (
          <p className="rounded-lg bg-emerald-950 px-4 py-3 text-sm text-emerald-300">Check your inbox for the magic link.</p>
        ) : (
          <form onSubmit={mode === "password" ? signInWithPassword : sendMagicLink} className="space-y-4">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@loandaddy.ai" autoComplete="email"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none focus:border-neutral-500"
            />
            {mode === "password" && (
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password" autoComplete="current-password"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none focus:border-neutral-500"
              />
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
            >
              {busy ? "Signing in…" : mode === "password" ? "Sign in" : "Email me a magic link"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
