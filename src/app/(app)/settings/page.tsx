"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { getJson } from "@/lib/client/api";
import { PageBody, PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/Panel";

// Read-only for now: shows what the app is using. Nothing here changes settings.
export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [ai, setAi] = useState<{ providers: Array<{ label: string }>; agents: Array<{ name: string }> } | null>(null);
  const [credits, setCredits] = useState<number | null | undefined>(undefined);
  // Browser-only value: empty on the server, filled in after hydration (no mismatch).
  const tz = useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "",
  );

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    getJson<{ providers: Array<{ label: string }>; agents: Array<{ name: string }> }>("/api/ai").then((r) => {
      if (r.ok) setAi({ providers: Array.isArray(r.data.providers) ? r.data.providers : [], agents: Array.isArray(r.data.agents) ? r.data.agents : [] });
    });
    getJson<{ emailCreditsRemaining: number | null }>("/api/verify/credits").then((r) => setCredits(r.ok ? r.data.emailCreditsRemaining : null));
  }, []);

  const rows: Array<[string, React.ReactNode]> = [
    ["Signed In As", email || "…"],
    ["Your Time Zone", <>{tz || "…"} <span className="text-slate-500">(used for exports)</span></>],
    ["Email Verification Credits", credits === undefined ? "…" : credits === null ? "Unknown" : credits.toLocaleString()],
    ["AI Models in Use", ai ? ai.providers.map((p) => p.label).join(", ") || "None" : "…"],
    ["AI Agents", ai ? ai.agents.map((a) => a.name).join(", ") || "None" : "…"],
  ];

  return (
    <PageBody>
      <PageHeader subtitle="What this account is using. Changes come later." />
      <Panel id="account" title="Account" className="max-w-2xl" bodyClassName="p-0">
        <dl className="divide-y divide-slate-100 text-body">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
              <dt className="text-slate-500">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-slate-200 px-4 py-3 text-body">
          <Link href="/privacy" className="font-medium text-indigo-600 hover:text-indigo-700">Privacy Policy</Link>
          <span aria-hidden="true" className="mx-2 text-slate-300">·</span>
          <Link href="/terms" className="font-medium text-indigo-600 hover:text-indigo-700">Terms of Service</Link>
        </div>
      </Panel>
    </PageBody>
  );
}
