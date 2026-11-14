"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CORE_FIELDS,
  DEFAULT_VIEW,
  FILTER_OPS,
  PRESET_VIEWS,
  STAGES,
  applyView,
  customFieldDefLabeled,
  customFieldKeys,
  displayName,
  groupByStage,
  patchBodyFor,
  summarize,
  type CrmRecord,
  type FieldDef,
  type Filter,
  type StageKey,
  type ViewState,
} from "@/lib/crm/model";
import { allViews, isPreset, loadActiveViewId, loadSavedViews, newViewId, storeActiveViewId, storeSavedViews } from "@/lib/crm/views";
import { sendJson } from "@/lib/client/api";
import { EditableCell } from "@/components/crm/EditableCell";
import { STAGE_STYLES, money } from "@/components/crm/ui";
import { Columns3, Download, ListFilter, Tag as TagIcon, Trash2, UserRoundX, Users } from "lucide-react";
import { PageBody, PageHeader } from "@/components/app/AppShell";
import { EmptyState, Spinner, StatusMessage } from "@/components/ui/Status";
import { ConsentBadge } from "@/components/ui/ConsentBadge";
import { StageChip } from "@/components/crm/ui";
import { useDialogs } from "@/components/ui/Dialog";
import { btn, btnDanger, btnPrimary, card, input } from "@/components/ui/styles";

/** Apply a local, optimistic version of an edit so the UI responds instantly. */
function optimistic(r: CrmRecord, field: FieldDef, value: string): CrmRecord {
  if (field.key.startsWith("custom.")) {
    const custom = { ...r.custom };
    if (value.trim()) custom[field.key.slice(7)] = value.trim();
    else delete custom[field.key.slice(7)];
    return { ...r, custom };
  }
  if (field.type === "tags") return { ...r, tags: [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))] };
  if (field.type === "number" || field.type === "currency") {
    const n = Number(value.replace(/[$,\s]/g, ""));
    return { ...r, [field.key]: value.trim() === "" || Number.isNaN(n) ? null : n };
  }
  return { ...r, [field.key]: value.trim() === "" ? null : value.trim() };
}

/** Default value for a filter when its field changes, so an old value never carries over. */
function freshFilterValue(field: string): string {
  return field === "stage" ? "new" : "";
}

export default function Workspace({ initialViewId, title = "Leads" }: { initialViewId?: string; title?: string }) {
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState<ViewState[]>([]);
  const [activeId, setActiveId] = useState(initialViewId ?? DEFAULT_VIEW.id);
  const [view, setView] = useState<ViewState>(PRESET_VIEWS.find((v) => v.id === initialViewId) ?? DEFAULT_VIEW);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState("");
  const columnsRef = useRef<HTMLDivElement>(null);
  const { confirm, prompt, dialogs } = useDialogs();

  const flash = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 5000);
  }, []);

  const load = useCallback(async () => {
    const r = await sendJson("/api/crm/records", "GET");
    if (r.ok) {
      setRecords(Array.isArray(r.data.records) ? (r.data.records as CrmRecord[]) : []);
      setTruncated(Boolean(r.data.truncated));
      setLoadError("");
    } else setLoadError(String(r.data.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const s = loadSavedViews();
      const id = initialViewId ?? loadActiveViewId();
      const v = allViews(s).find((x) => x.id === id) ?? DEFAULT_VIEW;
      setSaved(s);
      setActiveId(v.id);
      setView(v);
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, initialViewId]);

  // Columns menu: Esc or a click outside closes it.
  useEffect(() => {
    if (!showColumns) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowColumns(false);
    const onClick = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) setShowColumns(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [showColumns]);

  const views = useMemo(() => allViews(saved), [saved]);
  const stored = views.find((v) => v.id === activeId) ?? DEFAULT_VIEW;
  const dirty = JSON.stringify({ ...stored, name: "" }) !== JSON.stringify({ ...view, name: "" });

  const customKeys = useMemo(() => customFieldKeys(records), [records]);
  const labels = useMemo(() => Object.assign({}, ...records.map((r) => r.custom_labels ?? {})) as Record<string, string>, [records]);
  const fields = useMemo<FieldDef[]>(() => [...CORE_FIELDS, ...customKeys.map((k) => customFieldDefLabeled(k, labels))], [customKeys, labels]);
  const visible = fields.filter((f) => !view.hidden.includes(f.key));
  const rows = useMemo(() => applyView(records, view), [records, view]);
  const stats = useMemo(() => summarize(rows), [rows]);
  const groups = useMemo(() => groupByStage(rows), [rows]);

  function switchView(v: ViewState) {
    setActiveId(v.id);
    setView(v);
    setSelected(new Set());
    storeActiveViewId(v.id);
  }

  async function saveView(asNew: boolean) {
    if (asNew || isPreset(activeId)) {
      const name = await prompt({ title: "Save This View", label: "View Name", initial: view.name === stored.name ? `${view.name} (copy)` : view.name, confirmLabel: "Save View" });
      if (!name) return;
      const v = { ...view, id: newViewId(), name: name.slice(0, 60) };
      const next = [...saved, v];
      setSaved(next);
      storeSavedViews(next);
      switchView(v);
      flash(`Saved "${v.name}". Saved views live in this browser for now.`);
    } else {
      const next = saved.map((s) => (s.id === activeId ? { ...view } : s));
      setSaved(next);
      storeSavedViews(next);
      flash("View updated.");
    }
  }

  async function deleteView() {
    if (isPreset(activeId)) return;
    if (!(await confirm({ title: "Delete This View?", body: `"${stored.name}" will be removed. Your leads aren't affected.`, confirmLabel: "Delete View", danger: true }))) return;
    const next = saved.filter((s) => s.id !== activeId);
    setSaved(next);
    storeSavedViews(next);
    switchView(DEFAULT_VIEW);
  }

  const saveField = useCallback(
    async (record: CrmRecord, field: FieldDef, value: string): Promise<boolean> => {
      const before = record;
      setRecords((rs) => rs.map((r) => (r.id === record.id ? optimistic(r, field, value) : r)));
      const r = await sendJson(`/api/crm/records/${record.id}`, "PATCH", { ...patchBodyFor(field, value), expectedUpdated: record.updated_date });
      if (!r.ok) {
        setRecords((rs) => rs.map((x) => (x.id === record.id ? before : x)));
        flash(String(r.data.error), true);
        if (r.status === 409) await load();
        return false;
      }
      setRecords((rs) => rs.map((x) => (x.id === record.id ? { ...x, updated_date: String(r.data.updated_date ?? x.updated_date) } : x)));
      return true;
    },
    [flash, load],
  );

  async function moveStage(id: string, stage: StageKey) {
    const r = records.find((x) => x.id === id);
    if (!r || r.stage === stage) return;
    const field = CORE_FIELDS.find((f) => f.key === "stage")!;
    const ok = await saveField(r, field, stage);
    if (ok) flash(`${displayName(r)} moved to ${STAGES.find((s) => s.key === stage)?.label}.`);
  }

  async function runBulk(label: string, body: Record<string, unknown>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(label);
    const r = await sendJson("/api/crm/bulk", "POST", { ids, ...body });
    setBulkBusy("");
    if (!r.ok) return flash(String(r.data.error), true);
    const failed = Array.isArray(r.data.failed) ? r.data.failed.length : Number(r.data.notFound ?? 0);
    const done = Number(r.data.updated ?? r.data.deleted ?? 0);
    flash(`${label}: ${done} lead(s)${failed ? `, ${failed} couldn't be changed` : ""}.`, failed > 0);
    setSelected(new Set());
    await load();
  }

  async function bulkOwner() {
    const owner = await prompt({ title: "Set owner", label: "Owner (email or name)", confirmLabel: "Set owner" });
    if (owner) runBulk("Owner set", { patch: { assigned_to: owner } });
  }
  async function bulkFollowUp() {
    const date = await prompt({ title: "Set follow up date", label: "Follow up date", type: "date", confirmLabel: "Set date" });
    if (date) runBulk("Follow up set", { patch: { next_follow_up: date } });
  }
  async function bulkTag() {
    const tags = await prompt({ title: "Add a tag", label: "Tag (use commas for more than one)", confirmLabel: "Add tag" });
    if (tags) runBulk("Tag added", { action: "add_tags", tags: tags.split(",") });
  }
  async function bulkDelete() {
    const n = selected.size;
    const ok = await confirm({
      title: `Delete ${n} lead${n === 1 ? "" : "s"}?`,
      body: "They'll be removed from Leads, exports and every campaign's recipients. This is logged.",
      confirmLabel: `Delete ${n} lead${n === 1 ? "" : "s"}`,
      danger: true,
    });
    if (ok) runBulk("Deleted", { action: "delete" });
  }

  function exportCsv() {
    // Server export: every field when all columns are shown, dates in your time zone.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({ tz });
    if (view.hidden.length > 0) params.set("columns", visible.map((f) => f.key).join(","));
    const a = document.createElement("a");
    a.href = `/api/crm/export?${params.toString()}`; // a file download, not a page
    a.download = "";
    a.click();
  }

  function setFilter(i: number, f: Filter | null) {
    const filters = [...view.filters];
    if (f === null) filters.splice(i, 1);
    else filters[i] = f;
    setView({ ...view, filters });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <PageBody wide>
      <PageHeader
        title={title}
        actions={<button className={btn} onClick={exportCsv} disabled={records.length === 0}><Download aria-hidden />Export CSV</button>}
      />

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["In view", stats.count.toLocaleString()],
          ["Open pipeline", money(stats.openValue) || "$0"],
          ["Won", money(stats.wonValue) || "$0"],
          ["Consent on file", stats.consented.toLocaleString()],
          ["Follow ups due", stats.followUpsDue.toLocaleString()],
        ].map(([k, v]) => (
          <div key={k} className={`${card} px-4 py-3`}>
            <dt className="text-caption font-medium text-slate-500">{k}</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <nav className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Views">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => switchView(v)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-body font-medium ${v.id === activeId ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {v.name}
          </button>
        ))}
      </nav>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={view.search}
          onChange={(e) => setView({ ...view, search: e.target.value })}
          placeholder="Search name, company, email, tags…"
          className={`${input} w-full sm:w-72`}
          aria-label="Search leads"
        />
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-body" role="group" aria-label="Layout">
          {(["table", "kanban"] as const).map((m) => (
            <button key={m} onClick={() => setView({ ...view, mode: m })} aria-pressed={view.mode === m} className={`rounded-md px-3 py-1.5 font-medium ${view.mode === m ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>
              {m === "table" ? "Table" : "Board"}
            </button>
          ))}
        </div>
        <button className={btn} onClick={() => setView({ ...view, filters: [...view.filters, { field: "stage", op: "is", value: "new" }] })}><ListFilter aria-hidden />Add Filter</button>
        <select
          className={input}
          aria-label="Sort by"
          value={view.sort[0] ? `${view.sort[0].field}:${view.sort[0].dir}` : ""}
          onChange={(e) => {
            const [field, dir] = e.target.value.split(":");
            setView({ ...view, sort: field ? [{ field, dir: dir as "asc" | "desc" }] : [] });
          }}
        >
          <option value="">No sort</option>
          {fields.flatMap((f) => [
            <option key={`${f.key}:asc`} value={`${f.key}:asc`}>{f.label} ↑</option>,
            <option key={`${f.key}:desc`} value={`${f.key}:desc`}>{f.label} ↓</option>,
          ])}
        </select>
        {view.mode === "table" && (
          <div className="relative" ref={columnsRef}>
            <button className={btn} onClick={() => setShowColumns((s) => !s)} aria-expanded={showColumns} aria-haspopup="true"><Columns3 aria-hidden />Columns</button>
            {showColumns && (
              <div className="absolute z-20 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                {fields.filter((f) => f.key !== "name").map((f) => (
                  <label key={f.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-body hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={!view.hidden.includes(f.key)}
                      onChange={(e) => setView({ ...view, hidden: e.target.checked ? view.hidden.filter((h) => h !== f.key) : [...view.hidden, f.key] })}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {dirty && <button className={btnPrimary} onClick={() => saveView(false)}>{isPreset(activeId) ? "Save as View" : "Save View"}</button>}
          {dirty && <button className={btn} onClick={() => switchView(stored)}>Reset</button>}
          {!isPreset(activeId) && <button className={btn} onClick={() => saveView(true)}>Duplicate</button>}
          {!isPreset(activeId) && <button className={btn} onClick={deleteView}>Delete View</button>}
        </div>
      </div>

      {view.filters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {view.filters.map((f, i) => {
            const op = FILTER_OPS.find((o) => o.op === f.op);
            return (
              <div key={i} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <select className={`${input} py-1`} value={f.field} onChange={(e) => setFilter(i, { ...f, field: e.target.value, value: freshFilterValue(e.target.value) })} aria-label="Filter field">
                  {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <select className={`${input} py-1`} value={f.op} onChange={(e) => setFilter(i, { ...f, op: e.target.value as Filter["op"] })} aria-label="Filter operator">
                  {FILTER_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                {op?.needsValue &&
                  (f.field === "stage" ? (
                    <select className={`${input} py-1`} value={f.value ?? ""} onChange={(e) => setFilter(i, { ...f, value: e.target.value })} aria-label="Filter value">
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  ) : (
                    <input className={`${input} w-32 py-1`} value={f.value ?? ""} onChange={(e) => setFilter(i, { ...f, value: e.target.value })} aria-label="Filter value" />
                  ))}
                <button onClick={() => setFilter(i, null)} className="px-2 text-slate-500 hover:text-slate-800" aria-label="Remove filter">×</button>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/95 px-3 py-2 text-body backdrop-blur lg:top-2">
          <span className="font-semibold text-indigo-900">{selected.size} selected</span>
          <select
            className={`${input} py-1.5`}
            defaultValue=""
            disabled={Boolean(bulkBusy)}
            onChange={(e) => {
              if (e.target.value) runBulk("Stage changed", { patch: { stage: e.target.value } });
              e.target.value = "";
            }}
            aria-label="Move selected to stage"
          >
            <option value="">Move to Stage…</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className={btn} disabled={Boolean(bulkBusy)} onClick={bulkTag}><TagIcon aria-hidden />Add Tag</button>
          <button className={btn} disabled={Boolean(bulkBusy)} onClick={bulkOwner}>Set Owner</button>
          <button className={btn} disabled={Boolean(bulkBusy)} onClick={bulkFollowUp}>Set Follow Up</button>
          <button className={btnDanger} disabled={Boolean(bulkBusy)} onClick={bulkDelete}><Trash2 aria-hidden />Delete</button>
          {bulkBusy && <Spinner label="Working…" />}
          <button className="ml-auto font-medium text-slate-600 hover:text-slate-900" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {toast && (
        <div role={toast.error ? "alert" : "status"} className={`fixed bottom-4 left-4 right-4 z-30 rounded-lg px-4 py-3 text-body shadow-lg sm:left-auto sm:max-w-sm ${toast.error ? "bg-red-700 text-white" : "bg-slate-900 text-white"}`}>
          {toast.text}
        </div>
      )}
      {dialogs}

      {loading ? (
        <div className={`${card} flex justify-center p-10`}><Spinner label="Loading leads…" /></div>
      ) : loadError ? (
        <StatusMessage tone="err">
          Leads didn&apos;t load: {loadError} <button onClick={load} className="ml-2 font-semibold underline">Retry</button>
        </StatusMessage>
      ) : records.length === 0 ? (
        <EmptyState icon={Users} title="No Leads Yet">
          Add, import or scrape leads from <Link href="/" className="font-medium text-indigo-600 underline">Home</Link>. They show up here right away.
        </EmptyState>
      ) : view.mode === "table" ? (
        <div className="@container">
        {/* Under 600px of width the table becomes stacked cards. */}
        <ul className="space-y-2 @min-[600px]:hidden" aria-label="Leads">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-xl border border-slate-300 bg-white p-3 shadow-sm ${selected.has(r.id) ? "ring-2 ring-indigo-200" : ""}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-indigo-600"
                  checked={selected.has(r.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    setSelected(next);
                  }}
                  aria-label={`Select ${displayName(r)}`}
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/crm/${r.id}`} className="block truncate font-bold text-slate-900 hover:text-indigo-600">{displayName(r)}</Link>
                  {r.company && <p className="truncate text-caption text-slate-600">{r.company}</p>}
                  {(r.email || r.phone) && <p className="truncate text-caption text-slate-600">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StageChip stage={r.stage} />
                    <ConsentBadge value={r.consent} />
                    {r.estimated_value !== null && <span className="text-caption font-semibold tabular-nums text-slate-700">{money(r.estimated_value)}</span>}
                  </div>
                </div>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-body text-slate-600">No leads match this view.</li>}
        </ul>
        <div className={`${card} hidden overflow-x-auto @min-[600px]:block`}>
          <table className="w-full min-w-[900px] table-fixed text-body">
            <thead className="bg-slate-50 text-left text-caption font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" className="accent-indigo-600" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all in view" />
                </th>
                {visible.map((f) => (
                  <th key={f.key} className={`whitespace-nowrap px-3 py-3 ${f.key === "name" ? "w-48" : "w-36"}`}>
                    <button
                      className="hover:text-slate-800"
                      onClick={() => setView({ ...view, sort: [{ field: f.key, dir: view.sort[0]?.field === f.key && view.sort[0].dir === "asc" ? "desc" : "asc" }] })}
                    >
                      {f.label}
                      {view.sort[0]?.field === f.key ? (view.sort[0].dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 hover:bg-slate-50 ${selected.has(r.id) ? "bg-indigo-50/60" : ""}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={selected.has(r.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        setSelected(next);
                      }}
                      aria-label={`Select ${displayName(r)}`}
                    />
                  </td>
                  {visible.map((f) => (
                    <td key={f.key} className="overflow-hidden px-3 py-2.5 align-middle">
                      {f.key === "name" ? (
                        <Link href={`/crm/${r.id}`} className="block truncate font-medium text-slate-900 hover:text-indigo-700 hover:underline" title={displayName(r)}>{displayName(r)}</Link>
                      ) : (
                        <EditableCell record={r} field={f} onSave={(field, value) => saveField(r, field, value)} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="flex flex-col items-center p-10 text-center">
              <UserRoundX aria-hidden className="mb-3 size-16 text-slate-300" />
              <p className="text-body text-slate-600">No leads match this view.</p>
            </div>
          )}
        </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((s) => {
            const items = groups[s.key];
            const total = items.reduce((n, r) => n + (r.estimated_value ?? 0), 0);
            return (
              <section
                key={s.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  if (id) moveStage(id, s.key);
                  setDragId(null);
                }}
                className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-100/70"
                aria-label={`${s.label} column`}
              >
                <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 text-body">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className={`h-2 w-2 rounded-full ${STAGE_STYLES[s.key].dot}`} />
                    {s.label}
                    <span className="font-normal text-slate-500">{items.length}</span>
                  </span>
                  <span className="text-caption tabular-nums text-slate-500">{money(total)}</span>
                </header>
                <div className="flex min-h-24 flex-col gap-2 p-2">
                  {items.map((r) => (
                    <article
                      key={r.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", r.id);
                        setDragId(r.id);
                      }}
                      className={`cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-body shadow-sm hover:border-slate-300 active:cursor-grabbing ${dragId === r.id ? "opacity-50" : ""}`}
                    >
                      <Link href={`/crm/${r.id}`} className="block truncate font-medium hover:text-indigo-700 hover:underline">{displayName(r)}</Link>
                      {(r.company || r.job_title) && <div className="truncate text-caption text-slate-500">{[r.job_title, r.company].filter(Boolean).join(" · ")}</div>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-caption text-slate-500">
                        <span className="tabular-nums">{money(r.estimated_value) || "No value"}</span>
                        {/* Works on touch screens where dragging doesn't. */}
                        <select
                          value={r.stage}
                          onChange={(e) => moveStage(r.id, e.target.value as StageKey)}
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-600"
                          aria-label={`Move ${displayName(r)} to stage`}
                        >
                          {STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {truncated && <p className="mt-3 text-caption text-amber-700">Showing the 2,000 most recently updated leads. Older leads aren&apos;t loaded here yet.</p>}
    </PageBody>
  );
}
