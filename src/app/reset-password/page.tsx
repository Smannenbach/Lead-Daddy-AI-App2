"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";
import { CheckField, Field } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/Status";
import { brandCta } from "@/components/ui/styles";

// Reached from the reset email (auth/callback signs the user in, then sends them here).
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError("That didn't save. Your reset link may have expired. Ask for a new one.");
    router.push("/");
    router.refresh();
  }

  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center"><Logo /></div>
          <Card className="shadow">
            <CardHeader>
              <CardTitle className="text-h1 font-bold">Set a New Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="space-y-4">
                <Field id="new-password" label="New Password" type={show ? "text" : "password"} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Field id="confirm-password" label="Confirm Password" type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <CheckField id="show-passwords" checked={show} onChange={setShow}>Show Passwords</CheckField>
                <Button type="submit" size="lg" disabled={busy} className={`${brandCta} w-full`}>{busy ? "Saving…" : "Save New Password"}</Button>
                {error && <StatusMessage tone="err" className="mt-0">{error}</StatusMessage>}
              </form>
            </CardContent>
          </Card>
          <LegalLinks className="mt-6" />
        </div>
      </main>
    </PublicShell>
  );
}
