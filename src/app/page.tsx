"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Frozen API contract (docs/GOAL_PROMPT.md + Day-1 decision):
// GET  /api/leads        -> { leads: Lead[] }
// POST /api/leads        -> { id }   body: { first_name, last_name?, email?, phone?, company?, job_title? }
// POST /api/leads/[id]/verify -> { contactId, results: [{ kind, value, provider, result }] }
interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  consent: string | null; // none | granted | revoked
  email_status: string | null;
  phone_status: string | null;
}

interface VerifyResult {
  kind: "email" | "phone";
  value: string;
  provider: string;
  result: string; // valid | invalid | risky | unknown
}

interface AiInfo {
  providers: { key: string; label: string; model: string }[];
  agents: { name: string; description: string }[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  recipients: number;
  steps: number;
  channels: string[];
  sent: number;
  skipped: number;
  pendingSteps: number;
  launchedAt: string | null;
  startDate: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  valid: "bg-emerald-950 text-emerald-300",
  invalid: "bg-red-950 text-red-300",
  risky: "bg-amber-950 text-amber-300",
  unknown: "bg-neutral-800 text-neutral-400",
  unverified: "bg-neutral-900 text-neutral-500",
};

function statusBadge(status: string | null) {
  const s = (status ?? "unverified").toLowerCase();
  const style = STATUS_STYLES[s] ?? STATUS_STYLES.unverified;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${style}`}>
      {s}
    </span>
  );
}

const EMPTY_FORM = { first_name: "", last_name: "", email: "", phone: "", company: "", job_title: "", tcpa_consent: false };

type LoadState = "loading" | "ok" | "error";

/** Why a console API call failed, in words the user can act on. */
function describeFailure(status: number, body: unknown): string {
  const apiError =
    body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : "";
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "This account isn't on the team allowlist (ALLOWED_EMAILS). Ask an admin to add it.";
  return apiError ? `Server error (${status}): ${apiError}` : `Server error (${status}).`;
}

/**
 * GET a console API route and parse JSON, failing loudly instead of silently.
 * The proxy answers signed-out requests with a 307 to /login, which fetch follows
 * and returns as 200 text/html, so a non-JSON body is treated as an expired session.
 */
async function getJson<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch {
    return { ok: false, status: 0, message: "Can't reach the server. Check your connection and retry." };
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (res.redirected || !isJson) {
    return { ok: false, status: 401, message: describeFailure(401, null) };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, message: describeFailure(res.status, body) };
  return { ok: true, data: body as T };
}

export default function Console() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const supabase = () => (supabaseRef.current ??= createClient());
  const [email, setEmail] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ai, setAi] = useState<AiInfo>({ providers: [], agents: [] });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campForm, setCampForm] = useState({ name: "", brief: "", email: true, sms: true, call: false, allLeads: false });
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeCreate, setScrapeCreate] = useState(false);
  const [scrapeVerify, setScrapeVerify] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [leadsState, setLeadsState] = useState<LoadState>("loading");
  const [campaignsState, setCampaignsState] = useState<LoadState>("loading");
  const [loadErrors, setLoadErrors] = useState<Record<string, { status: number; message: string }>>({});
  const sessionExpired = Object.values(loadErrors).some((e) => e.status === 401);

  function recordLoad(key: string, failure: { status: number; message: string } | null) {
    setLoadErrors((prev) => {
      const next = { ...prev };
      if (failure) next[key] = failure;
      else delete next[key];
      return next;
    });
  }

  async function loadLeads() {
    setLeadsState((s) => (s === "ok" ? s : "loading"));
    const r = await getJson<{ leads?: Lead[] }>("/api/leads");
    if (r.ok) {
      setLeads(Array.isArray(r.data.leads) ? r.data.leads : []);
      setLeadsState("ok");
      recordLoad("Leads", null);
    } else {
      setLeadsState("error");
      recordLoad("Leads", r);
    }
  }

  async function loadAi() {
    const r = await getJson<AiInfo>("/api/ai");
    if (r.ok) {
      setAi({ providers: r.data.providers ?? [], agents: r.data.agents ?? [] });
      recordLoad("AI providers", null);
    } else {
      recordLoad("AI providers", r);
    }
  }

  async function refreshCampaigns() {
    setCampaignsState((s) => (s === "ok" ? s : "loading"));
    const r = await getJson<{ campaigns?: Campaign[] }>("/api/campaigns");
    if (r.ok) {
      setCampaigns(Array.isArray(r.data.campaigns) ? r.data.campaigns : []);
      setCampaignsState("ok");
      recordLoad("Campaigns", null);
    } else {
      setCampaignsState("error");
      recordLoad("Campaigns", r);
    }
  }

  async function loadAll() {
    supabase().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    await Promise.all([loadLeads(), loadAi(), refreshCampaigns()]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doScrape() {
    if (!scrapeUrl.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: scrapeUrl.trim(),
          autoCreate: scrapeCreate || undefined,
          autoVerify: scrapeVerify || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(`Scrape failed: ${data.error}`);
        return;
      }
      const created = Array.isArray(data.createdLeadIds) ? data.createdLeadIds.length : null;
      setNotice(
        `Scraped ${data.markdownChars} chars, digest via ${data.digestModel ?? "n/a"}` +
          (created !== null ? ` — created ${created} lead(s) in CRM` : "") +
          `: ${String(data.digest).slice(0, 240)}`,
      );
      if (created) await loadLeads();
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    setImportBusy(true);
    setNotice("");
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setNotice("CSV is empty.");
        return;
      }
      const parseLine = (line: string) =>
        line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const header = parseLine(lines[0]).map((h) => h.toLowerCase());
      const hasHeader = header.some((h) => ["email", "first_name", "firstname", "name"].includes(h));
      const idx = (names: string[]) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };
      const col = hasHeader
        ? {
            first_name: idx(["first_name", "firstname"]),
            last_name: idx(["last_name", "lastname"]),
            email: idx(["email"]),
            phone: idx(["phone", "phone_number"]),
            company: idx(["company"]),
            job_title: idx(["job_title", "title"]),
          }
        : { first_name: 0, last_name: 1, email: 2, phone: 3, company: 4, job_title: 5 };
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const rows = dataLines.map((line) => {
        const cells = parseLine(line);
        const pick = (i: number) => (i >= 0 ? cells[i] || undefined : undefined);
        return {
          first_name: pick(col.first_name),
          last_name: pick(col.last_name),
          email: pick(col.email),
          phone: pick(col.phone),
          company: pick(col.company),
          job_title: pick(col.job_title),
        };
      });
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice(`Import complete: ${data.created} created, ${data.skipped} skipped (duplicates/invalid).`);
        await loadLeads();
      } else {
        setNotice(`Import failed: ${data.error}`);
      }
    } catch {
      setNotice("Import failed: could not read the file.");
    } finally {
      setImportBusy(false);
    }
  }

  async function addLead(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          company: form.company.trim() || undefined,
          job_title: form.job_title.trim() || undefined,
          tcpaConsent: form.tcpa_consent || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm(EMPTY_FORM);
        setNotice(`Lead added (${data.id}).`);
        await loadLeads();
      } else {
        setNotice(`Add failed: ${data.error}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyLead(leadId: string) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/leads/${leadId}/verify`, { method: "POST" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.results)) {
        const lines = (data.results as VerifyResult[]).map(
          (r) => `${r.kind} ${r.value} → ${r.result} (${r.provider})`,
        );
        setNotice(lines.length > 0 ? lines.join("\n") : "Nothing to verify — no email or phone on this lead.");
        await loadLeads();
      } else {
        setNotice(`Verify failed: ${data.error ?? res.statusText}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function launchCampaign(campaignId: string) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", campaignId }),
      });
      const data = await res.json();
      setNotice(res.ok ? `Campaign '${data.id}' launched.` : `Launch blocked: ${data.error}`);
      await refreshCampaigns();
    } finally {
      setBusy(false);
    }
  }

  async function advanceCampaign(campaignId: string) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/advance`, { method: "POST" });
      const data = await res.json();
      setNotice(
        data.advanced
          ? `Step ${data.stepIndex} (${data.channel}): ${data.sent} sent, ${data.skipped} skipped.`
          : `No due step: ${data.reason ?? "nothing to do"}.`,
      );
      await refreshCampaigns();
    } finally {
      setBusy(false);
    }
  }

  async function createCampaign(e: FormEvent) {
    e.preventDefault();
    if (!campForm.name.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const channelSeq = [
        campForm.email ? "email" : null,
        campForm.sms ? "sms" : null,
        campForm.call ? "call" : null,
      ].filter(Boolean) as string[];
      if (channelSeq.length === 0) {
        setNotice("Pick at least one channel.");
        return;
      }
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campForm.name.trim(),
          brief: campForm.brief.trim() || undefined,
          channelSeq,
          leadIds: campForm.allLeads ? leads.map((l) => l.id) : [],
          generateCopy: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCampForm({ name: "", brief: "", email: true, sms: true, call: false, allLeads: false });
        setNotice(`Campaign '${data.id}' created with AI-written copy (draft). Verify recipients, then launch.`);
        await refreshCampaigns();
      } else {
        setNotice(`Create failed: ${data.error}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const emailsVerified = leads.filter((l) => (l.email_status ?? "").toLowerCase() === "valid").length;
  const phonesVerified = leads.filter((l) => (l.phone_status ?? "").toLowerCase() === "valid").length;

  const formField = (key: Exclude<keyof typeof EMPTY_FORM, "tcpa_consent">, placeholder: string, required = false, type = "text") => (
    <input
      type={type}
      required={required}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      placeholder={placeholder}
      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
    />
  );

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">LeadDaddy.ai</h1>
          <p className="text-sm text-neutral-400">
            Pipeline: scrape → verify → call / SMS / email · {ai.providers.length} AI providers · {ai.agents.length} agents
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-neutral-400">
          <Link href="/crm" className="rounded-lg bg-neutral-100 px-3 py-1.5 font-medium text-neutral-900 hover:bg-white">Open CRM workspace</Link>
          <span>{email}</span>
          <button onClick={signOut} className="hover:text-white">Sign out</button>
        </div>
      </div>

      {Object.keys(loadErrors).length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-red-900 bg-red-950/60 p-4 text-sm text-red-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-red-100">
                {sessionExpired ? "You've been signed out." : "Part of the console didn't load."}
              </p>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(loadErrors).map(([what, e]) => (
                  <li key={what}>
                    <span className="text-red-300">{what}:</span> {e.message}
                  </li>
                ))}
              </ul>
            </div>
            {sessionExpired ? (
              <button onClick={signOut} className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 font-medium text-red-950 hover:bg-white">
                Sign in again
              </button>
            ) : (
              <button onClick={loadAll} className="shrink-0 rounded-lg border border-red-800 px-3 py-1.5 hover:border-red-600 hover:text-white">
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-2xl font-semibold">{leads.length}</div>
          <div className="text-neutral-400">Leads</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-2xl font-semibold">{emailsVerified}</div>
          <div className="text-neutral-400">Valid emails</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-2xl font-semibold">{phonesVerified}</div>
          <div className="text-neutral-400">Valid phones</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-2xl font-semibold">{ai.providers.map((p) => p.label).join(" · ") || "none"}</div>
          <div className="text-neutral-400">Models live (auto-select)</div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-2 text-sm font-medium">Scrape a page into lead intel</h2>
        <div className="flex gap-2">
          <input
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder="https://example.com/team or listings page"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <button onClick={doScrape} disabled={busy || !scrapeUrl.trim()} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40">
            Scrape + AI digest
          </button>
        </div>
        <div className="mt-3 flex gap-6 text-sm text-neutral-400">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={scrapeCreate} onChange={(e) => setScrapeCreate(e.target.checked)} className="accent-neutral-100" />
            Create leads from result
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scrapeVerify}
              onChange={(e) => setScrapeVerify(e.target.checked)}
              disabled={!scrapeCreate}
              className="accent-neutral-100"
            />
            Auto-verify created leads (uses verification credits)
          </label>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-2 text-sm font-medium">Import leads from CSV</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Header row with columns like first_name, last_name, email, phone, company, job_title (or no header:
          name, name, email, phone, company, title). Duplicates by email are skipped.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={importBusy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importCsv(f);
            e.target.value = "";
          }}
          className="block text-sm text-neutral-400 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-900 hover:file:bg-white disabled:opacity-40"
        />
      </div>

      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-2 text-sm font-medium">Add a lead</h2>
        <form onSubmit={addLead} className="grid gap-2 sm:grid-cols-3">
          {formField("first_name", "First name *", true)}
          {formField("last_name", "Last name")}
          {formField("email", "Email", false, "email")}
          {formField("phone", "Phone")}
          {formField("company", "Company")}
          {formField("job_title", "Job title")}
          <label className="flex items-center gap-2 text-sm text-neutral-400 sm:col-span-3">
            <input
              type="checkbox"
              checked={form.tcpa_consent}
              onChange={(e) => setForm({ ...form, tcpa_consent: e.target.checked })}
              className="accent-neutral-100"
            />
            Lead granted TCPA consent for SMS/call outreach
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy || !form.first_name.trim()} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium hover:border-neutral-500 hover:text-white disabled:opacity-40">
              Add lead
            </button>
          </div>
        </form>
      </div>

      {notice && <p className="mb-4 whitespace-pre-line rounded-lg bg-neutral-900 px-4 py-2 text-sm">{notice}</p>}

      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950">
        <h2 className="border-b border-neutral-800 px-4 py-3 text-sm font-medium">Campaigns</h2>
        <form onSubmit={createCampaign} className="grid gap-2 border-b border-neutral-800 p-4 sm:grid-cols-6">
          <input
            value={campForm.name}
            onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
            placeholder="Campaign name *"
            required
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500 sm:col-span-2"
          />
          <input
            value={campForm.brief}
            onChange={(e) => setCampForm({ ...campForm, brief: e.target.value })}
            placeholder="Brief (offer, audience, goal) — AI writes the copy"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500 sm:col-span-3"
          />
          <div className="flex items-center gap-3 text-sm text-neutral-400 sm:col-span-1">
            {(["email", "sms", "call"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={campForm[ch]}
                  onChange={(e) => setCampForm({ ...campForm, [ch]: e.target.checked })}
                  className="accent-neutral-100"
                />
                {ch}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 sm:col-span-5">
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={campForm.allLeads}
                onChange={(e) => setCampForm({ ...campForm, allLeads: e.target.checked })}
                className="accent-neutral-100"
              />
              Include all current leads as recipients
            </label>
            <button type="submit" disabled={busy || !campForm.name.trim()} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40">
              Create with AI copy
            </button>
          </div>
        </form>
        {campaignsState === "loading" ? (
          <p className="p-4 text-sm text-neutral-500">Loading campaigns…</p>
        ) : campaignsState === "error" ? (
          <p className="p-4 text-sm text-red-300">Campaigns couldn&apos;t load: {loadErrors.Campaigns?.message}</p>
        ) : campaigns.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">
            No campaigns yet — create one via POST /api/campaigns, then launch it here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-neutral-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Recipients</th>
                <th className="px-4 py-2">Sequence</th>
                <th className="px-4 py-2">Sent / Skipped</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${c.status === "live" ? "bg-emerald-950 text-emerald-300" : "bg-neutral-800 text-neutral-400"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{c.recipients}</td>
                  <td className="px-4 py-2">
                    {c.channels.join(" → ") || "—"}
                    {c.pendingSteps > 0 && <span className="ml-2 text-xs text-neutral-500">{c.pendingSteps} pending</span>}
                  </td>
                  <td className="px-4 py-2">{c.sent} / {c.skipped}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {c.status !== "live" && (
                        <button onClick={() => launchCampaign(c.id)} disabled={busy} className="rounded-lg border border-neutral-700 px-3 py-1 text-xs hover:text-white disabled:opacity-40">
                          Launch
                        </button>
                      )}
                      {c.status === "live" && c.pendingSteps > 0 && (
                        <button onClick={() => advanceCampaign(c.id)} disabled={busy} className="rounded-lg border border-neutral-700 px-3 py-1 text-xs hover:text-white disabled:opacity-40">
                          Run next step
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950">
        <h2 className="border-b border-neutral-800 px-4 py-3 text-sm font-medium">Leads</h2>
        {leadsState === "loading" ? (
          <p className="p-4 text-sm text-neutral-500">Loading leads…</p>
        ) : leadsState === "error" ? (
          <p className="p-4 text-sm text-red-300">Leads couldn&apos;t load: {loadErrors.Leads?.message}</p>
        ) : leads.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">No leads yet — add one above or scrape a page.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-neutral-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Consent</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-neutral-800 align-top">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-2">{l.company ?? "—"}</td>
                  <td className="px-4 py-2">{l.job_title ?? "—"}</td>
                  <td className="px-4 py-2">
                    {l.email ? (
                      <span className="flex flex-col gap-1">
                        <span className="break-all">{l.email}</span>
                        {statusBadge(l.email_status)}
                      </span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {l.phone ? (
                      <span className="flex flex-col gap-1">
                        <span>{l.phone}</span>
                        {statusBadge(l.phone_status)}
                      </span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-400">
                      {l.stage ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {(l.consent ?? "none") === "granted" ? (
                      <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-xs text-emerald-300">granted</span>
                    ) : (l.consent ?? "none") === "revoked" ? (
                      <span className="rounded bg-red-950 px-1.5 py-0.5 text-xs text-red-300">revoked</span>
                    ) : (
                      <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-500">none</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => verifyLead(l.id)}
                      disabled={busy || (!l.email && !l.phone)}
                      className="rounded-lg border border-neutral-700 px-3 py-1 text-xs hover:text-white disabled:opacity-40"
                    >
                      Verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
