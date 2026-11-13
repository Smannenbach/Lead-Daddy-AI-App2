"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CORE_FIELDS,
  STAGES,
  customFieldDefLabeled,
  displayName,
  patchBodyFor,
  type CrmRecord,
  type FieldDef,
  type StageKey,
  type TimelineEntry,
} from "@/lib/crm/model";
import { sendJson } from "@/lib/client/api";
import { EditableCell } from "@/components/crm/EditableCell";
import { STAGE_STYLES, StatusText, exactTime, relative } from "@/components/crm/ui";
import { PageBody } from "@/components/app/AppShell";
import { useDialogs } from "@/components/ui/Dialog";
import { btn, btnDanger, btnPrimary, card, cardHeader, h2, input } from "@/components/ui/styles";

const DETAIL_FIELDS = CORE_FIELDS.filter((f) => !["name", "stage", "consent"].includes(f.key));
const NAME_FIELDS: FieldDef[] = [
  { key: "first_name", label: "First name", type: "text", editable: true },
  { key: "last_name", label: "Last name", type: "text", editable: true },
];
const FORM_ANSWER_KEY = "financing_need";

const TIMELINE_ICON: Record<TimelineEntry["type"], string> = {
  created: "＋",
  stage_changed: "→",
  field_changed: "✎",
  note: "✉",
  verified: "✓",
  system: "•",
};

const METHOD_TEXT: Record<string, string> = {
  web_form: "The lead checked the consent box on a web form",
  rep_attested: "A team member recorded consent when adding the lead",
  rep_attested_import: "A team member recorded consent for a CSV import",
  sms_keyword: "Recorded from a text message reply",
};

/** What the rep is allowed to do, in plain words, from the consent fields. */
function ContactPermission({ record }: { record: CrmRecord }) {
  const rec = record.consent_record;
  const status = record.consent;
  const allowed = status === "granted";
  return (
    <section className={card} aria-labelledby="perm-h">
      <div className={cardHeader}>
        <h2 id="perm-h" className={h2}>Contact permission</h2>
        <StatusText value={status} />
      </div>
      <div className="space-y-3 p-4 text-sm">
        <p className={`rounded-lg px-3 py-2 font-medium ${allowed ? "bg-emerald-50 text-emerald-800" : status === "revoked" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
          {allowed
            ? "Campaigns can text and call this lead."
            : status === "revoked"
              ? "This lead opted out. Campaigns won't text or call them."
              : "No consent on file. Campaigns skip this lead for texts and calls."}
        </p>
        {rec ? (
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-slate-500">How</dt>
            <dd>{METHOD_TEXT[rec.method] ?? rec.method}</dd>
            <dt className="text-slate-500">When</dt>
            <dd>{exactTime(rec.at)}</dd>
            {rec.revoked_at && (
              <>
                <dt className="text-slate-500">Opted out</dt>
                <dd>{exactTime(rec.revoked_at)}</dd>
              </>
            )}
            <dt className="text-slate-500">Where</dt>
            <dd className="break-all">{rec.source}</dd>
            {rec.captured_by && (
              <>
                <dt className="text-slate-500">Recorded by</dt>
                <dd className="break-all">{rec.captured_by}</dd>
              </>
            )}
            {rec.wording_text && (
              <>
                <dt className="text-slate-500">Wording</dt>
                <dd className="text-slate-700">&ldquo;{rec.wording_text}&rdquo;</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-slate-500">
            {status === "granted"
              ? "Consent was recorded before Lead Daddy kept details of how and when."
              : "No consent record yet."}
          </p>
        )}
      </div>
    </section>
  );
}

export default function RecordView({ id }: { id: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<CrmRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newVal, setNewVal] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const { confirm, dialogs } = useDialogs();

  const load = useCallback(async () => {
    const r = await sendJson(`/api/crm/records/${id}`, "GET");
    if (!r.ok) {
      setError(String(r.data.error));
      return;
    }
    setRecord(r.data.record as CrmRecord);
    setTimeline(Array.isArray(r.data.timeline) ? (r.data.timeline as TimelineEntry[]) : []);
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

  const say = (text: string, isError = false) => setMessage({ text, error: isError });

  async function patch(body: Record<string, unknown>, label = "Saving"): Promise<boolean> {
    if (!record) return false;
    setBusy(label);
    const r = await sendJson(`/api/crm/records/${record.id}`, "PATCH", { ...body, expectedUpdated: record.updated_date });
    setBusy("");
    if (!r.ok) {
      say(String(r.data.error), true);
      if (r.status === 409) await load();
      return false;
    }
    setMessage(null);
    await load();
    return true;
  }

  async function verify() {
    if (!record) return;
    setBusy("Checking cost");
    const dry = await sendJson(`/api/leads/${record.id}/verify?dryRun=true`, "POST");
    setBusy("");
    if (!dry.ok) return say(String(dry.data.error), true);
    const checks = (dry.data.checks as Array<{ kind: string; value: string }>) ?? [];
    const cost = dry.data.cost as { estimatedCredits: number | null };
    const left = dry.data.emailCreditsRemaining as number | null;
    const ok = await confirm({
      title: "Verify this lead?",
      confirmLabel: "Verify",
      body: (
        <div className="space-y-2">
          <p>This checks {checks.map((c) => `${c.kind} ${c.value}`).join(" and ")}.</p>
          <p>
            Cost: {cost.estimatedCredits === null ? `${checks.length} paid check${checks.length === 1 ? "" : "s"} (the credit price isn't set yet)` : `${cost.estimatedCredits} credit(s)`}.
          </p>
          <p>Email verification credits left: {left === null ? "unknown" : left.toLocaleString()}.</p>
        </div>
      ),
    });
    if (!ok) return;
    setBusy("Verifying");
    const r = await sendJson(`/api/leads/${record.id}/verify`, "POST");
    setBusy("");
    if (!r.ok) return say(String(r.data.error), true);
    const lines = ((r.data.results as Array<{ message: string }>) ?? []).map((x) => x.message);
    const remaining = r.data.emailCreditsRemaining as number | null;
    say(`${lines.join(" ")}${remaining !== null ? ` ${remaining.toLocaleString()} email credits left.` : ""}`);
    await load();
  }

  async function deleteLead() {
    if (!record) return;
    const ok = await confirm({
      title: `Delete ${displayName(record)}?`,
      body: "The lead will be removed from Leads, exports and every campaign's recipients. This is logged.",
      confirmLabel: "Delete lead",
      danger: true,
    });
    if (!ok) return;
    setBusy("Deleting");
    const r = await sendJson(`/api/crm/records/${record.id}`, "DELETE");
    setBusy("");
    if (!r.ok) return say(String(r.data.error), true);
    router.push("/crm");
  }

  async function deleteNote(entry: TimelineEntry) {
    if (!record || !entry.id) return;
    const ok = await confirm({ title: "Delete this note?", body: <p className="whitespace-pre-wrap">&ldquo;{entry.detail}&rdquo;</p>, confirmLabel: "Delete note", danger: true });
    if (!ok) return;
    const r = await sendJson(`/api/crm/records/${record.id}/notes/${entry.id}`, "DELETE");
    if (!r.ok) return say(String(r.data.error), true);
    await load();
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if (await patch({ note: note.trim() }, "Adding note")) setNote("");
  }

  async function addField(e: FormEvent) {
    e.preventDefault();
    // The server turns the name into a safe key and keeps the name as typed.
    if (await patch({ add_field: { label: newLabel.trim(), value: newVal.trim() } }, "Adding field")) {
      setNewLabel("");
      setNewVal("");
    }
  }

  if (error) {
    return (
      <PageBody>
        <Link href="/crm" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">← Back to Leads</Link>
        <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
      </PageBody>
    );
  }
  if (!record) return <PageBody><p className="text-sm text-slate-500">Loading lead…</p></PageBody>;

  const labels = record.custom_labels ?? {};
  const formAnswer = record.custom[FORM_ANSWER_KEY];
  const customFields = Object.keys(record.custom).filter((k) => k !== FORM_ANSWER_KEY).sort().map((k) => customFieldDefLabeled(k, labels));
  const save = (field: FieldDef, value: string) => patch(patchBodyFor(field, value));
  const stageIdx = STAGES.findIndex((x) => x.key === record.stage);

  return (
    <PageBody>
      {dialogs}
      <div className="mb-3 text-sm text-slate-500">
        <Link href="/crm" className="font-medium text-indigo-600 hover:text-indigo-800">Leads</Link> / <span className="text-slate-700">{displayName(record)}</span>
      </div>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName(record)}</h1>
          <p className="truncate text-sm text-slate-500">{[record.job_title, record.company].filter(Boolean).join(" · ") || "No company yet"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={Boolean(busy) || (!record.email && !record.phone)} onClick={verify}>
            {busy === "Verifying" ? "Verifying…" : busy === "Checking cost" ? "Checking cost…" : "Verify (uses credits)"}
          </button>
          {record.email && <a className={btn} href={`mailto:${record.email}`}>Email</a>}
          <button className={btnDanger} disabled={Boolean(busy)} onClick={deleteLead}>{busy === "Deleting" ? "Deleting…" : "Delete"}</button>
        </div>
      </header>

      <ol className={`${card} mb-5 flex overflow-x-auto`} aria-label="Pipeline stage">
        {STAGES.map((s, i) => {
          const active = s.key === record.stage;
          const passed = i < stageIdx && record.stage !== "lost";
          return (
            <li key={s.key} className="min-w-[110px] flex-1">
              <button
                disabled={Boolean(busy) || active}
                onClick={() => patch({ stage: s.key as StageKey }, "Moving")}
                className={`flex w-full items-center justify-center gap-1.5 whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-sm last:border-r-0 ${
                  active ? "bg-indigo-600 font-semibold text-white" : passed ? "bg-indigo-50 text-indigo-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {passed ? <span aria-hidden>✓</span> : <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : STAGE_STYLES[s.key].dot}`} />}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {message && (
        <p role={message.error ? "alert" : "status"} className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {formAnswer && (
            <section className={card} aria-labelledby="answer-h">
              <div className={cardHeader}><h2 id="answer-h" className={h2}>Form answer</h2></div>
              <div className="p-4 text-sm">
                <p className="font-medium text-slate-500">{labels[FORM_ANSWER_KEY] ?? "What are you looking to finance?"}</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-900">{formAnswer}</p>
              </div>
            </section>
          )}

          <section className={card} aria-labelledby="details-h">
            <div className={cardHeader}><h2 id="details-h" className={h2}>Details</h2></div>
            <dl className="divide-y divide-slate-100">
              {[...NAME_FIELDS, ...DETAIL_FIELDS].map((f) => (
                <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-3 px-4 py-2 text-sm sm:grid-cols-[140px_1fr]">
                  <dt className="text-slate-500">{f.label}</dt>
                  <dd className="min-w-0"><EditableCell record={record} field={f} onSave={save} /></dd>
                </div>
              ))}
            </dl>
            <h3 className="border-y border-slate-200 px-4 py-3 text-sm font-semibold">Custom fields</h3>
            <dl className="divide-y divide-slate-100">
              {customFields.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">None yet. Add fields like Loan type, Property state or Credit band.</p>}
              {customFields.map((f) => (
                <div key={f.key} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 px-4 py-2 text-sm sm:grid-cols-[140px_1fr_auto]">
                  <dt className="truncate text-slate-500" title={f.label}>{f.label}</dt>
                  <dd className="min-w-0"><EditableCell record={record} field={f} onSave={save} /></dd>
                  <button className="text-xs font-medium text-slate-500 hover:text-red-700" onClick={() => patch({ custom: { [f.key.slice(7)]: "" } }, "Removing")} aria-label={`Remove ${f.label}`}>Remove</button>
                </div>
              ))}
            </dl>
            <form onSubmit={addField} className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row">
              <input className={`${input} sm:w-44`} placeholder="Field name" maxLength={60} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} aria-label="New field name" />
              <input className={`${input} flex-1`} placeholder="Value" maxLength={500} value={newVal} onChange={(e) => setNewVal(e.target.value)} aria-label="New field value" />
              <button className={btn} disabled={Boolean(busy) || !newLabel.trim() || !newVal.trim()}>{busy === "Adding field" ? "Adding…" : "Add field"}</button>
            </form>
          </section>
        </div>

        <div className="space-y-5">
          <ContactPermission record={record} />

          <section className={`${card} flex flex-col`} aria-labelledby="activity-h">
            <div className={cardHeader}><h2 id="activity-h" className={h2}>Activity</h2></div>
            <form onSubmit={addNote} className="border-b border-slate-200 p-4">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} placeholder="Log a call, meeting or note…" className={`${input} w-full resize-y`} aria-label="New note" />
              <div className="mt-2 flex justify-end">
                <button className={btnPrimary} disabled={Boolean(busy) || !note.trim()}>{busy === "Adding note" ? "Adding…" : "Add note"}</button>
              </div>
            </form>
            <ol className="max-h-[640px] flex-1 space-y-4 overflow-y-auto p-4">
              {timeline.length === 0 && <li className="text-sm text-slate-500">No activity yet. Edits, stage moves, verifications and notes show here.</li>}
              {timeline.map((t, i) => (
                <li key={t.id ?? `${t.at}-${i}`} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500" aria-hidden>
                    {TIMELINE_ICON[t.type] ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`break-words ${t.type === "note" ? "whitespace-pre-wrap text-slate-900" : "text-slate-700"}`}>{t.detail}</p>
                    <p className="text-xs text-slate-500">
                      <time dateTime={t.at} title={relative(t.at)}>{exactTime(t.at)}</time>
                      {t.by ? ` · ${t.by}` : ""}
                    </p>
                  </div>
                  {t.type === "note" && t.id && (
                    <button onClick={() => deleteNote(t)} className="self-start text-xs font-medium text-slate-400 hover:text-red-700" aria-label="Delete note">Delete</button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </PageBody>
  );
}
