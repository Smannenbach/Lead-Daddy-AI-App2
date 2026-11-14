"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";
import { btnPrimary, input } from "@/components/ui/styles";

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

  const inputCls = `${input} w-full`;

  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center"><Logo /></div>
          <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow sm:p-8">
            <h1 className="text-h1 font-bold">Set a New Password</h1>
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-body font-medium text-slate-700">New Password</label>
              <input id="new-password" type={show ? "text" : "password"} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-body font-medium text-slate-700">Confirm Password</label>
              <input id="confirm-password" type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-body text-slate-600">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-indigo-600" /> Show Passwords
            </label>
            <button type="submit" disabled={busy} className={`${btnPrimary} h-10 w-full`}>
              {busy ? "Saving…" : "Save New Password"}
            </button>
            {error && <p className="text-body text-red-600" role="alert">{error}</p>}
          </form>
          <LegalLinks className="mt-6" />
        </div>
      </main>
    </PublicShell>
  );
}
