"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getJson } from "@/lib/client/api";
import { PageBody, PageHeader } from "@/components/app/AppShell";
import { AddLeadCard, ImportCard, ScrapeCard } from "@/components/app/LeadTools";
import { btn, card, muted } from "@/components/ui/styles";
import { ConsentBadge } from "@/components/ui/ConsentBadge";

interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  consent: string | null;
  email_status: string | null;
  phone_status: string | null;
}

export default function Home() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, { status: number; message: string }>>({});
  const sessionExpired = Object.values(errors).some((e) => e.status === 401);

  const record = (key: string, failure: { status: number; message: string } | null) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (failure) next[key] = failure;
      else delete next[key];
      return next;
    });

  const loadLeads = useCallback(async () => {
    const r = await getJson<{ leads?: LeadRow[] }>("/api/leads");
    if (r.ok) {
      setLeads(Array.isArray(r.data.leads) ? r.data.leads : []);
      record("Leads", null);
    } else record("Leads", r);
  }, []);

  const loadAll = useCallback(async () => {
    const c = getJson<{ emailCreditsRemaining: number | null }>("/api/verify/credits").then((r) => {
      if (r.ok) setCredits(r.data.emailCreditsRemaining);
      else record("Verification credits", r);
    });
    await Promise.all([loadLeads(), c]);
  }, [loadLeads]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    loadAll();
  }, [loadAll]);

  async function signInAgain() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  const count = (pred: (l: LeadRow) => boolean) => (leads ?? []).filter(pred).length;
  const stats = [
    { label: "Leads", value: leads ? leads.length : "…" },
    { label: "Valid emails", value: leads ? count((l) => l.email_status === "valid") : "…" },
    { label: "Valid phones", value: leads ? count((l) => l.phone_status === "valid") : "…" },
    { label: "Consent on file", value: leads ? count((l) => l.consent === "granted") : "…" },
    { label: "Verification credits left", value: credits === null ? "Unknown" : credits.toLocaleString() },
  ];

  return (
    <PageBody>
      <PageHeader title="Home" subtitle="Add leads three ways, then work them in Leads and Campaigns." />

      {Object.keys(errors).length > 0 && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold">{sessionExpired ? "You've been signed out." : "Part of this page didn't load."}</p>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(errors).map(([what, e]) => <li key={what}><span className="font-medium">{what}:</span> {e.message}</li>)}
            </ul>
          </div>
          {sessionExpired ? (
            <button onClick={signInAgain} className="shrink-0 rounded-lg bg-red-700 px-3 py-2 font-semibold text-white hover:bg-red-800">Sign in again</button>
          ) : (
            <button onClick={loadAll} className={`${btn} shrink-0`}>Retry</button>
          )}
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={`${card} p-4`}>
            <dt className="text-xs font-medium text-slate-500">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <AddLeadCard onDone={loadLeads} />
        <ImportCard onDone={loadLeads} />
        <ScrapeCard onDone={loadLeads} />
      </div>

      <section className={`${card} mt-6`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Newest leads</h2>
          <Link href="/crm" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">See all leads</Link>
        </div>
        {leads === null ? (
          <p className={`${muted} p-4`}>Loading leads…</p>
        ) : leads.length === 0 ? (
          <p className={`${muted} p-4`}>No leads yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {leads.slice(0, 5).map((l) => (
              <li key={l.id}>
                <Link href={`/crm/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "Unnamed lead"}</span>
                    <span className="block truncate text-xs text-slate-500">{l.company ?? l.email ?? ""}</span>
                  </span>
                  <ConsentBadge value={l.consent} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageBody>
  );
}
