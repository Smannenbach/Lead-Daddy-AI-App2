"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusMessage } from "@/components/ui/Status";
import { brandCta } from "@/components/ui/styles";

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
    ? mode === "password" ? "Signing In…" : "Sending Link…"
    : mode === "password" ? "Sign In" : mode === "magic" ? "Email Me a Sign In Link" : "Email Me a Reset Link";
  const linkBtn = "h-auto p-0 font-medium text-indigo-600 hover:bg-transparent hover:text-indigo-700";

  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <Card className="gap-6 shadow">
            <CardHeader>
              <CardTitle className="text-h1 font-bold">{mode === "reset" ? "Reset Your Password" : "Sign In"}</CardTitle>
              <CardDescription className="text-body text-slate-600">
                {mode === "reset" ? "We'll email you a link to set a new password." : "Use your team email to get into Lead Daddy."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mode !== "reset" && (
                <Tabs value={mode} onValueChange={(m) => switchMode(m as Mode)} className="mb-6">
                  <TabsList className="w-full" aria-label="Sign in method">
                    <TabsTrigger value="password">Password</TabsTrigger>
                    <TabsTrigger value="magic">Email Link</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              {sent ? (
                <div className="space-y-4">
                  <StatusMessage tone="info" className="mt-0">{LINK_SENT}</StatusMessage>
                  <Button type="button" variant="link" className={linkBtn} onClick={() => switchMode("password")}>Back to Sign In</Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                  </div>
                  {mode === "password" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Button type="button" variant="link" className={linkBtn} onClick={() => switchMode("reset")}>Forgot Password?</Button>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          className="pr-16"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-pressed={showPassword}
                          aria-controls="password"
                          className="absolute inset-y-0.5 right-0.5 h-8 text-caption text-slate-600"
                        >
                          {showPassword ? "Hide" : "Show"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button type="submit" size="lg" disabled={busy} className={`${brandCta} w-full`}>{label}</Button>
                  {error && <StatusMessage tone="err" className="mt-0">{error}</StatusMessage>}
                  {mode === "reset" && (
                    <Button type="button" variant="link" className={linkBtn} onClick={() => switchMode("password")}>Back to Sign In</Button>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
          <p className="mt-6 text-center text-caption text-slate-600">Need access? Ask your Lead Daddy admin to add you.</p>
          <LegalLinks className="mt-3" />
        </div>
      </main>
    </PublicShell>
  );
}
