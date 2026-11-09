"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CORE_FIELDS,
  CUSTOM_KEY,
  STAGES,
  customFieldDef,
  displayName,
  patchBodyFor,
  type CrmRecord,
  type FieldDef,
  type StageKey,
  type TimelineEntry,
} from "@/lib/crm/model";
import { EditableCell } from "@/components/crm/EditableCell";
import { STAGE_STYLES, StatusText, btnCls, btnPrimaryCls, inputCls, relative } from "@/components/crm/ui";

const DETAIL_FIELDS = CORE_FIELDS.filter((f) => f.key !== "name" && f.key !== "stage");
const NAME_FIELDS: FieldDef[] = [
  { key: "first_name", label: "First name", type: "text", editable: true },
  { key: "last_name", label: "Last name", type: "text", editable: true },
];

const TIMELINE_ICON: Record<TimelineEntry["type"], string> = {
  created: "＋",
  stage_changed: "→",
  field_changed: "✎",
  note: "✉",
  verified: "✓",
  system: "•",
};

export default function RecordView({ id }: { id: string }) {
  const [record, setRecord] = useState<CrmRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/records/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not load record");
      return;
    }
    setRecord(data.record);
    setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
    setError("");
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    if (!record) return false;
    setBusy(true);
    const res = await fetch(`/api/crm/records/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, expectedUpdated: record.updated_date }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setToast(data.errors?.join("; ") ?? data.error ?? "Save failed");
      if (res.status === 409) await load();
      return false;
    }
    setToast("");
    await load();
    return true;
  }

  async function verify() {
    if (!record) return;
    setBusy(true);
    const res = await fetch(`/api/leads/${record.id}/verify`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setToast(data.error ?? "Verification failed");
      return;
    }
    const summary = (data.results ?? []).map((r: { kind: string; result: string }) => `${r.kind}: ${r.result}`).join(", ");
    setToast(summary ? `Verified — ${summary}` : "Nothing to verify.");
    await load();
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if (await patch({ note: note.trim() })) setNote("");
  }

  async function addCustom(e: FormEvent) {
    e.preventDefault();
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!CUSTOM_KEY.test(key)) {
      setToast("Field names must start with a letter and use letters, numbers or underscores (max 40).");
      return;
    }
    if (!newVal.trim()) {
      setToast("Give the new field a value.");
      return;
    }
    if (await patch({ custom: { [key]: newVal.trim() } })) {
      setNewKey("");
      setNewVal("");
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Link href="/crm" className="text-sm text-neutral-400 hover:text-white">← Back to workspace</Link>
        <p className="mt-6 rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</p>
      </main>
    );
  }
  if (!record) return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-neutral-500 sm:px-8">Loading…</main>;

  const customFields = Object.keys(record.custom).sort().map(customFieldDef);
  const save = (field: FieldDef, value: string) => patch(patchBodyFor(field, value));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
      <div className="mb-4 text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-300">Console</Link> / <Link href="/crm" className="hover:text-neutral-300">CRM</Link> / {displayName(record)}
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName(record)}</h1>
          <p className="text-sm text-neutral-400">{[record.job_title, record.company].filter(Boolean).join(" · ") || "No company yet"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnCls} disabled={busy || (!record.email && !record.phone)} onClick={verify}>Verify contact points</button>
          {record.email && <a className={btnCls} href={`mailto:${record.email}`}>Email</a>}
        </div>
      </header>

      <ol className="mb-6 flex overflow-x-auto rounded-xl border border-neutral-800" aria-label="Pipeline stage">
        {STAGES.map((s) => {
          const active = s.key === record.stage;
          const idx = STAGES.findIndex((x) => x.key === record.stage);
          const passed = STAGES.findIndex((x) => x.key === s.key) < idx && record.stage !== "lost";
          return (
            <li key={s.key} className="flex-1">
              <button
                disabled={busy || active}
                onClick={() => patch({ stage: s.key as StageKey })}
                className={`w-full whitespace-nowrap border-r border-neutral-800 px-3 py-2 text-sm last:border-r-0 ${
                  active ? "bg-neutral-100 font-medium text-neutral-900" : passed ? "bg-neutral-900 text-neutral-300" : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
                aria-current={active ? "step" : undefined}
              >
                <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${STAGE_STYLES[s.key].dot}`} />
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {toast && <p role="status" className="mb-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm">{toast}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-xl border border-neutral-800">
          <h2 className="border-b border-neutral-800 px-4 py-3 text-sm font-medium">Details</h2>
          <dl className="divide-y divide-neutral-800/70">
            {[...NAME_FIELDS, ...DETAIL_FIELDS].map((f) => (
              <div key={f.key} className="grid grid-cols-[140px_1fr] items-center gap-3 px-4 py-2 text-sm">
                <dt className="text-neutral-500">{f.label}</dt>
                <dd className="min-w-0">
                  {f.key === "consent" ? (
                    <span className="flex items-center gap-2">
                      <StatusText value={record.consent} />
                      <span className="text-xs text-neutral-600">recorded at capture; not editable here</span>
                    </span>
                  ) : (
                    <EditableCell record={record} field={f} onSave={save} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <h3 className="border-y border-neutral-800 px-4 py-3 text-sm font-medium">Custom fields</h3>
          <dl className="divide-y divide-neutral-800/70">
            {customFields.length === 0 && <p className="px-4 py-3 text-sm text-neutral-500">None yet. Add fields like loan_type, property_state or credit_band.</p>}
            {customFields.map((f) => (
              <div key={f.key} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 px-4 py-2 text-sm">
                <dt className="truncate text-neutral-500">{f.label}</dt>
                <dd className="min-w-0"><EditableCell record={record} field={f} onSave={save} /></dd>
                <button className="text-xs text-neutral-600 hover:text-red-300" onClick={() => patch({ custom: { [f.key.slice(7)]: "" } })} aria-label={`Remove ${f.label}`}>Remove</button>
              </div>
            ))}
          </dl>
          <form onSubmit={addCustom} className="flex flex-wrap gap-2 border-t border-neutral-800 p-4">
            <input className={`${inputCls} w-40`} placeholder="field_name" value={newKey} onChange={(e) => setNewKey(e.target.value)} aria-label="New field name" />
            <input className={`${inputCls} flex-1`} placeholder="Value" value={newVal} onChange={(e) => setNewVal(e.target.value)} aria-label="New field value" />
            <button className={btnCls} disabled={busy}>Add field</button>
          </form>
        </section>

        <section className="flex flex-col rounded-xl border border-neutral-800">
          <h2 className="border-b border-neutral-800 px-4 py-3 text-sm font-medium">Activity</h2>
          <form onSubmit={addNote} className="border-b border-neutral-800 p-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Log a call, meeting or note…"
              className={`${inputCls} w-full resize-y`}
              aria-label="New note"
            />
            <div className="mt-2 flex justify-end">
              <button className={btnPrimaryCls} disabled={busy || !note.trim()}>Add note</button>
            </div>
          </form>
          <ol className="flex-1 space-y-4 overflow-y-auto p-4">
            {timeline.length === 0 && <li className="text-sm text-neutral-500">No activity yet. Edits, stage moves and notes are recorded here.</li>}
            {timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs text-neutral-400" aria-hidden>
                  {TIMELINE_ICON[t.type] ?? "•"}
                </span>
                <div className="min-w-0">
                  <p className={t.type === "note" ? "whitespace-pre-wrap text-neutral-100" : "text-neutral-300"}>{t.detail}</p>
                  <p className="text-xs text-neutral-500">{relative(t.at)}{t.by ? ` · ${t.by}` : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
