"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FileUp, ScanSearch, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckField, Field, Panel } from "@/components/app/Panel";
import { StatusMessage, type Tone } from "@/components/ui/Status";
import { brandCta, muted } from "@/components/ui/styles";

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

  const f = (key: Exclude<keyof typeof EMPTY, "tcpa_consent">, label: string, opts: { type?: string; required?: boolean; max?: number } = {}) => (
    <Field
      id={`add-${key}`}
      label={label}
      type={opts.type ?? "text"}
      required={opts.required}
      maxLength={opts.max ?? 200}
      autoComplete="off"
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
    />
  );

  return (
    <Panel id="add-lead" title="Add a Lead" icon={UserPlus}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {f("first_name", "First Name", { required: true, max: 100 })}
          {f("last_name", "Last Name", { max: 100 })}
          {f("email", "Email", { type: "email", max: 254 })}
          {f("phone", "Phone", { type: "tel", max: 20 })}
          {f("company", "Company")}
          {f("job_title", "Title", { max: 150 })}
        </div>
        <CheckField id="add-consent" checked={form.tcpa_consent} onChange={(v) => setForm({ ...form, tcpa_consent: v })}>
          Lead granted TCPA consent for SMS/call outreach
        </CheckField>
        <Button type="submit" disabled={busy || !form.first_name.trim()} className={brandCta}>{busy ? "Adding…" : "Add Lead"}</Button>
        <ResultBox result={result} />
      </form>
    </Panel>
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
    <Panel id="import" title="Import a CSV" icon={FileUp}>
      <p className={muted}>
        Use a header row like first_name, last_name, email, phone, company, title. Each row needs an email or a phone. Duplicate emails are skipped.
      </p>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="import-file" className="text-body font-medium text-slate-700">CSV File</Label>
        <Input
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className="cursor-pointer file:mr-3 file:font-medium file:text-indigo-600"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        {busy && <p className="text-caption text-slate-600">Importing…</p>}
      </div>
      <ResultBox result={result} />
      {skipped.length > 0 && (
        <details className="mt-2 text-body text-slate-600" open={skipped.length <= 5}>
          <summary className="cursor-pointer font-medium">Skipped Rows</summary>
          <ul className="mt-1 space-y-0.5">
            {skipped.slice(0, 100).map((s) => <li key={`${s.row}-${s.reason}`}>Row {s.row}: {s.reason}</li>)}
          </ul>
        </details>
      )}
    </Panel>
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
    <Panel id="scrape" title="Scrape a Page" icon={ScanSearch}>
      <form onSubmit={submit} className="space-y-3">
        <Field id="scrape-url" label="Page Address" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/team" inputMode="url" maxLength={2048} />
        <CheckField id="scrape-create" checked={create} onChange={setCreate}>Add the people it finds as leads</CheckField>
        <CheckField id="scrape-verify" checked={verify} onChange={setVerify} disabled={!create}>Also verify them (uses verification credits)</CheckField>
        <Button type="submit" disabled={busy || !url.trim()} className={brandCta}>{busy ? "Reading the Page…" : "Scrape and Summarize"}</Button>
        <ResultBox result={result} />
        {digest && <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-body text-slate-700">{digest}</p>}
      </form>
    </Panel>
  );
}
