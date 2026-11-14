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
import { ArrowLeft, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { PageBody } from "@/components/app/AppShell";
import { Spinner, StatusMessage } from "@/components/ui/Status";
import { useDialogs } from "@/components/ui/app-dialogs";
import { brandCta, dangerOutline } from "@/components/ui/styles";
import { Panel } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

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
    <Panel id="perm" title="Contact Permission" action={<StatusText value={status} />}>
      <div className="space-y-3 text-body">
        <p className={`flex items-center gap-2 rounded-lg px-3 py-2 font-medium ${allowed ? "bg-emerald-100 text-emerald-800" : status === "revoked" ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-900"}`}>
          <ShieldCheck aria-hidden className={`size-4 shrink-0 ${allowed ? "text-emerald-600" : status === "revoked" ? "text-red-500" : "text-amber-500"}`} />
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
    </Panel>
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
      title: "Verify This Lead?",
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
      confirmLabel: "Delete Lead",
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
    const ok = await confirm({ title: "Delete This Note?", body: <p className="whitespace-pre-wrap">&ldquo;{entry.detail}&rdquo;</p>, confirmLabel: "Delete Note", danger: true });
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
        <Link href="/crm" className="inline-flex items-center gap-1.5 text-body font-medium text-indigo-600 hover:text-indigo-700"><ArrowLeft aria-hidden className="size-4" />Back to Leads</Link>
        <StatusMessage tone="err" className="mt-6">{error}</StatusMessage>
      </PageBody>
    );
  }
  if (!record) return <PageBody><Spinner label="Loading lead…" /></PageBody>;

  const labels = record.custom_labels ?? {};
  const formAnswer = record.custom[FORM_ANSWER_KEY];
  const customFields = Object.keys(record.custom).filter((k) => k !== FORM_ANSWER_KEY).sort().map((k) => customFieldDefLabeled(k, labels));
  const save = (field: FieldDef, value: string) => patch(patchBodyFor(field, value));
  const stageIdx = STAGES.findIndex((x) => x.key === record.stage);

  return (
    <PageBody>
      {dialogs}
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/crm" className="font-medium text-indigo-600 hover:text-indigo-700">Leads</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage className="max-w-[60vw] truncate text-slate-700">{displayName(record)}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-h1 font-bold">{displayName(record)}</h2>
          <p className="truncate text-body text-slate-500">{[record.job_title, record.company].filter(Boolean).join(" · ") || "No company yet"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={Boolean(busy) || (!record.email && !record.phone)} onClick={verify}>
            <ShieldCheck aria-hidden />
            {busy === "Verifying" ? "Verifying…" : busy === "Checking cost" ? "Checking Cost…" : "Verify (Uses Credits)"}
          </Button>
          {record.email && <Button variant="outline" asChild><a href={`mailto:${record.email}`}><Mail aria-hidden />Email</a></Button>}
          <Button variant="outline" className={dangerOutline} disabled={Boolean(busy)} onClick={deleteLead}><Trash2 aria-hidden />{busy === "Deleting" ? "Deleting…" : "Delete"}</Button>
        </div>
      </header>

      <Card className="mb-5 flex-row gap-0 overflow-x-auto py-0 shadow" role="list" aria-label="Pipeline stage">
        {STAGES.map((s, i) => {
          const active = s.key === record.stage;
          const passed = i < stageIdx && record.stage !== "lost";
          return (
            <div key={s.key} role="listitem" className="min-w-[110px] flex-1">
              <button
                disabled={Boolean(busy) || active}
                onClick={() => patch({ stage: s.key as StageKey }, "Moving")}
                className={`flex w-full items-center justify-center gap-1.5 whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-body last:border-r-0 ${
                  active ? "bg-indigo-600 font-semibold text-white shadow" : passed ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {passed ? <span aria-hidden>✓</span> : <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : STAGE_STYLES[s.key].dot}`} />}
                {s.label}
              </button>
            </div>
          );
        })}
      </Card>

      {message && <StatusMessage tone={message.error ? "err" : "ok"} className="mb-4 mt-0">{message.text}</StatusMessage>}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {formAnswer && (
            <Panel id="answer" title="Form Answer">
              <div className="text-body">
                <p className="font-medium text-slate-500">{labels[FORM_ANSWER_KEY] ?? "What are you looking to finance?"}</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-900">{formAnswer}</p>
              </div>
            </Panel>
          )}

          <Panel id="details" title="Details" bodyClassName="p-0">
            <dl className="divide-y divide-slate-100">
              {[...NAME_FIELDS, ...DETAIL_FIELDS].map((f) => (
                <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-3 px-4 py-2 text-body sm:grid-cols-[140px_1fr]">
                  <dt className="text-slate-500">{f.label}</dt>
                  <dd className="min-w-0"><EditableCell record={record} field={f} onSave={save} /></dd>
                </div>
              ))}
            </dl>
            <h3 className="border-y border-slate-200 px-4 py-3 text-h2 font-bold">Custom Fields</h3>
            <dl className="divide-y divide-slate-100">
              {customFields.length === 0 && <p className="px-4 py-3 text-body text-slate-500">None yet. Add fields like Loan type, Property state or Credit band.</p>}
              {customFields.map((f) => (
                <div key={f.key} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 px-4 py-2 text-body sm:grid-cols-[140px_1fr_auto]">
                  <dt className="truncate text-slate-500" title={f.label}>{f.label}</dt>
                  <dd className="min-w-0"><EditableCell record={record} field={f} onSave={save} /></dd>
                  <Button variant="ghost" size="xs" className="text-slate-500 hover:bg-red-50 hover:text-red-700" onClick={() => patch({ custom: { [f.key.slice(7)]: "" } }, "Removing")} aria-label={`Remove ${f.label}`}>Remove</Button>
                </div>
              ))}
            </dl>
            <form onSubmit={addField} className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row">
              <Input className="sm:w-48" placeholder="Field name, like Loan type" maxLength={60} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} aria-label="New field name" />
              <Input className="flex-1" placeholder="Value" maxLength={500} value={newVal} onChange={(e) => setNewVal(e.target.value)} aria-label="New field value" />
              <Button type="submit" variant="outline" disabled={Boolean(busy) || !newLabel.trim() || !newVal.trim()}>{busy === "Adding field" ? "Adding…" : "Add Field"}</Button>
            </form>
          </Panel>
        </div>

        <div className="space-y-5">
          <ContactPermission record={record} />

          <Panel id="activity" title="Activity" bodyClassName="p-0">
            <form onSubmit={addNote} className="border-b border-slate-200 p-4">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} placeholder="Log a call, meeting or note…" className="resize-y" aria-label="New note" />
              <div className="mt-2 flex justify-end">
                <Button type="submit" className={brandCta} disabled={Boolean(busy) || !note.trim()}>{busy === "Adding note" ? "Adding…" : "Add Note"}</Button>
              </div>
            </form>
            <ol className="max-h-[640px] flex-1 space-y-4 overflow-y-auto p-4">
              {timeline.length === 0 && <li className="text-body text-slate-500">No activity yet. Edits, stage moves, verifications and notes show here.</li>}
              {timeline.map((t, i) => (
                <li key={t.id ?? `${t.at}-${i}`} className="flex gap-3 text-body">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-caption text-slate-500" aria-hidden>
                    {TIMELINE_ICON[t.type] ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`break-words ${t.type === "note" ? "whitespace-pre-wrap text-slate-900" : "text-slate-700"}`}>{t.detail}</p>
                    <p className="text-caption text-slate-500">
                      <time dateTime={t.at} title={relative(t.at)}>{exactTime(t.at)}</time>
                      {t.by ? ` · ${t.by}` : ""}
                    </p>
                  </div>
                  {t.type === "note" && t.id && (
                    <Button variant="ghost" size="xs" onClick={() => deleteNote(t)} className="self-start text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label="Delete note">Delete</Button>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </PageBody>
  );
}
