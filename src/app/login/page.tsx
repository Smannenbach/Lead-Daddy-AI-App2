"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error")
      ? "Sign-in failed. Try again."
      : "",
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-8">
        <div>
          <h1 className="text-2xl font-semibold">LeadDaddy.ai</h1>
          <p className="mt-1 text-sm text-neutral-400">AI-first outbound. Sign in with your team email.</p>
        </div>
        {sent ? (
          <p className="rounded-lg bg-emerald-950 px-4 py-3 text-sm text-emerald-300">Check your inbox for the magic link.</p>
        ) : (
          <form onSubmit={send} className="space-y-4">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@loandaddy.ai"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm outline-none focus:border-neutral-500"
            />
            <button type="submit" className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white">
              Email me a magic link
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
