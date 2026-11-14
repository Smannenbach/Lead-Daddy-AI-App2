"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FileUp, ScanSearch, UserPlus } from "lucide-react";
import { btn, btnPrimary, card, cardHeader, h2, input, muted } from "@/components/ui/styles";
import { StatusMessage, type Tone } from "@/components/ui/Status";

type Result = { tone: Tone; text: React.ReactNode } | null;

function ResultBox({ result }: { result: Result }) {
  if (!result) return null;
  return <StatusMessage tone={result.tone}>{result.text}</StatusMessage>;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
const errorText = (d: Record<string, unknown>, fallback: string) => (typeof d.error === "string" ? d.error : fallback);

// ── Add a lead ─────────────────────────────────────────────────────────────

const EMPTY = { first_name: "", last_name: "", email: "", phone: "", company: "", job_title: "", tcpa_consent: false };

export function AddLeadCard({ onDone }: { onDone?: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
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
      const d = await readJson(res);
      if (res.ok) {
        const name = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");
        setResult({ tone: "ok", text: <>Added {name}. <Link href={`/crm/${d.id}`} className="font-medium underline">Open lead</Link></> });
        setForm(EMPTY);
        onDone?.();
      } else setResult({ tone: "err", text: errorText(d, "That lead didn't save. Try again.") });
    } catch {
      setResult({ tone: "err", text: "Can't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const f = (key: Exclude<keyof typeof EMPTY, "tcpa_consent">, label: string, opts: { type?: string; required?: boolean; max?: number; auto?: string } = {}) => (
    <label className="block text-body">
      <span className="mb-1 block font-medium text-slate-700">{label}{opts.required ? " *" : ""}</span>
      <input
        type={opts.type ?? "text"}
        required={opts.required}
        maxLength={opts.max ?? 200}
        autoComplete={opts.auto}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={`${input} w-full`}
      />
    </label>
  );

  return (
    <section className={card} aria-labelledby="add-lead-h">
      <div className={cardHeader}><h2 id="add-lead-h" className={`${h2} flex items-center gap-2`}><UserPlus aria-hidden className="size-4 text-indigo-600" />Add a Lead</h2></div>
      <form onSubmit={submit} className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {f("first_name", "First Name", { required: true, max: 100, auto: "off" })}
          {f("last_name", "Last Name", { max: 100, auto: "off" })}
          {f("email", "Email", { type: "email", max: 254, auto: "off" })}
          {f("phone", "Phone", { type: "tel", max: 20, auto: "off" })}
          {f("company", "Company")}
          {f("job_title", "Title", { max: 150 })}
        </div>
        <label className="flex items-start gap-2 text-body text-slate-600">
          <input type="checkbox" checked={form.tcpa_consent} onChange={(e) => setForm({ ...form, tcpa_consent: e.target.checked })} className="mt-0.5 size-4 accent-indigo-600" />
          <span>Lead granted TCPA consent for SMS/call outreach</span>
        </label>
        <button type="submit" disabled={busy || !form.first_name.trim()} className={btnPrimary}>{busy ? "Adding…" : "Add Lead"}</button>
        <ResultBox result={result} />
      </form>
    </section>
  );
}

// ── Import a CSV ───────────────────────────────────────────────────────────

export function ImportCard({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [skipped, setSkipped] = useState<Array<{ row: number; reason: string }>>([]);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    setSkipped([]);
    try {
      // The server parses and validates the file (and rejects anything that isn't a CSV).
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: await file.text(), filename: file.name }),
      });
      const d = await readJson(res);
      if (!res.ok) {
        setResult({ tone: "err", text: errorText(d, "That import didn't work. Try again.") });
        return;
      }
      const rows = Array.isArray(d.skippedRows) ? (d.skippedRows as Array<{ row: number; reason: string }>) : [];
      setSkipped(rows);
      setResult({ tone: Number(d.created) > 0 ? "ok" : "info", text: `${d.created} lead(s) added, ${d.skipped} skipped.` });
      if (Number(d.created) > 0) onDone?.();
    } catch {
      setResult({ tone: "err", text: "We couldn't read that file." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card} aria-labelledby="import-h">
      <div className={cardHeader}><h2 id="import-h" className={`${h2} flex items-center gap-2`}><FileUp aria-hidden className="size-4 text-indigo-600" />Import a CSV</h2></div>
      <div className="p-4">
        <p className={muted}>
          Use a header row like first_name, last_name, email, phone, company, title. Each row needs an email or a phone. Duplicate emails are skipped.
        </p>
        <label className={`${btn} mt-3 cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Importing…" : "Choose a CSV File"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </label>
        <ResultBox result={result} />
        {skipped.length > 0 && (
          <details className="mt-2 text-body text-slate-600" open={skipped.length <= 5}>
            <summary className="cursor-pointer font-medium">Skipped Rows</summary>
            <ul className="mt-1 space-y-0.5">
              {skipped.slice(0, 100).map((s) => <li key={`${s.row}-${s.reason}`}>Row {s.row}: {s.reason}</li>)}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

// ── Scrape a page ──────────────────────────────────────────────────────────

export function ScrapeCard({ onDone }: { onDone?: () => void }) {
  const [url, setUrl] = useState("");
  const [create, setCreate] = useState(false);
  const [verify, setVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [digest, setDigest] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setDigest("");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), autoCreate: create || undefined, autoVerify: (create && verify) || undefined }),
      });
      const d = await readJson(res);
      if (!res.ok) {
        setResult({ tone: "err", text: errorText(d, "We couldn't read that page.") });
        return;
      }
      const created = Array.isArray(d.createdLeadIds) ? d.createdLeadIds.length : null;
      setResult({ tone: "ok", text: created === null ? "Page read. Summary below." : `Page read. ${created} lead(s) added.` });
      setDigest(typeof d.digest === "string" ? d.digest : "");
      if (created) onDone?.();
    } catch {
      setResult({ tone: "err", text: "Can't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card} aria-labelledby="scrape-h">
      <div className={cardHeader}><h2 id="scrape-h" className={`${h2} flex items-center gap-2`}><ScanSearch aria-hidden className="size-4 text-indigo-600" />Scrape a Page</h2></div>
      <form onSubmit={submit} className="space-y-3 p-4">
        <label className="block text-body">
          <span className="mb-1 block font-medium text-slate-700">Page Address</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/team" inputMode="url" maxLength={2048} className={`${input} w-full`} />
        </label>
        <label className="flex items-center gap-2 text-body text-slate-600">
          <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} className="accent-indigo-600" />
          Add the people it finds as leads
        </label>
        <label className={`flex items-center gap-2 text-body ${create ? "text-slate-600" : "text-slate-500"}`}>
          <input type="checkbox" checked={verify} disabled={!create} onChange={(e) => setVerify(e.target.checked)} className="accent-indigo-600" />
          Also verify them (uses verification credits)
        </label>
        <button type="submit" disabled={busy || !url.trim()} className={btnPrimary}>{busy ? "Reading the Page…" : "Scrape and Summarize"}</button>
        <ResultBox result={result} />
        {digest && <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-body text-slate-700">{digest}</p>}
      </form>
    </section>
  );
}
