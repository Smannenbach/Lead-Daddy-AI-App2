"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LegalLinks, Logo, PublicShell } from "@/components/brand/Brand";

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

  const inputCls =
    "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center"><Logo /></div>
          <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-xl font-semibold">Set a new password</h1>
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">New password</label>
              <input id="new-password" type={show ? "text" : "password"} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">Type it again</label>
              <input id="confirm-password" type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-indigo-600" /> Show passwords
            </label>
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "Saving…" : "Save new password"}
            </button>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          </form>
          <LegalLinks className="mt-6" />
        </div>
      </main>
    </PublicShell>
  );
}
