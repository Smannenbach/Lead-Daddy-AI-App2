"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";
import { btnPrimary, input } from "@/components/ui/styles";

type Mode = "password" | "magic" | "reset";

// One neutral message for magic links and resets, so the page never reveals
// whether an email has a Lead Daddy account.
const LINK_SENT = "If that email has a Lead Daddy account, a link is on its way. Check your inbox.";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error")
      ? "That link didn't work or has expired. Try again."
      : "",
  );

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setSent(false);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) {
      setError("That email and password don't match. Try again or reset your password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    // shouldCreateUser: false. The login page never creates accounts. Unknown emails
    // get the same message as known ones.
    await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setBusy(false);
    setSent(true);
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    setSent(true);
  }

  const submit = mode === "password" ? signInWithPassword : mode === "magic" ? sendMagicLink : sendReset;
  const label = busy
    ? mode === "password" ? "Signing in…" : "Sending link…"
    : mode === "password" ? "Sign In" : mode === "magic" ? "Email Me a Sign In Link" : "Email Me a Reset Link";
  const inputCls = `${input} w-full`;

  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow sm:p-8">
            <h1 className="text-xl font-bold">{mode === "reset" ? "Reset Your Password" : "Sign In"}</h1>
            <p className="mt-1 text-body text-slate-500">
              {mode === "reset" ? "We'll email you a link to set a new password." : "Use your team email to get into Lead Daddy."}
            </p>

            {mode !== "reset" && (
              <div className="mt-6 flex rounded-lg bg-slate-100 p-1 text-body" role="tablist" aria-label="Sign in method">
                {(["password", "magic"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {m === "password" ? "Password" : "Email Link"}
                  </button>
                ))}
              </div>
            )}

            {sent ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-lg bg-indigo-50 px-4 py-3 text-body text-indigo-800" role="status">{LINK_SENT}</p>
                <button type="button" onClick={() => switchMode("password")} className="text-body font-medium text-indigo-600 hover:text-indigo-700">
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-body font-medium text-slate-700">Email</label>
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" className={inputCls} />
                </div>
                {mode === "password" && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="password" className="block text-body font-medium text-slate-700">Password</label>
                      <button type="button" onClick={() => switchMode("reset")} className="text-body font-medium text-indigo-600 hover:text-indigo-700">
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        className={`${inputCls} pr-16`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        aria-controls="password"
                        className="absolute inset-y-0 right-0 px-3 text-caption font-medium text-slate-500 hover:text-slate-800"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className={`${btnPrimary} h-10 w-full`}
                >
                  {label}
                </button>
                {error && <p className="text-body text-red-600" role="alert">{error}</p>}
                {mode === "reset" && (
                  <button type="button" onClick={() => switchMode("password")} className="text-body font-medium text-indigo-600 hover:text-indigo-700">
                    Back to Sign In
                  </button>
                )}
              </form>
            )}
          </div>
          <p className="mt-6 text-center text-caption text-slate-500">
            Need access? Ask your Lead Daddy admin to add you.
          </p>
          <LegalLinks className="mt-3" />
        </div>
      </main>
    </PublicShell>
  );
}
