"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CORE_FIELDS,
  DEFAULT_VIEW,
  FILTER_OPS,
  STAGES,
  applyView,
  customFieldDef,
  customFieldKeys,
  displayName,
  groupByStage,
  patchBodyFor,
  summarize,
  toCsv,
  type CrmRecord,
  type FieldDef,
  type Filter,
  type StageKey,
  type ViewState,
} from "@/lib/crm/model";
import { allViews, isPreset, loadActiveViewId, loadSavedViews, newViewId, storeActiveViewId, storeSavedViews } from "@/lib/crm/views";
import { EditableCell } from "@/components/crm/EditableCell";
import { STAGE_STYLES, btnCls, btnPrimaryCls, inputCls, money } from "@/components/crm/ui";

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

export default function Workspace() {
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState<ViewState[]>([]);
  const [activeId, setActiveId] = useState(DEFAULT_VIEW.id);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [showColumns, setShowColumns] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/records", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setRecords(Array.isArray(data.records) ? data.records : []);
      setTruncated(Boolean(data.truncated));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const s = loadSavedViews();
      const id = loadActiveViewId();
      const v = allViews(s).find((x) => x.id === id) ?? DEFAULT_VIEW;
      setSaved(s);
      setActiveId(v.id);
      setView(v);
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const views = useMemo(() => allViews(saved), [saved]);
  const stored = views.find((v) => v.id === activeId) ?? DEFAULT_VIEW;
  const dirty = JSON.stringify({ ...stored, name: "" }) !== JSON.stringify({ ...view, name: "" });

  const customKeys = useMemo(() => customFieldKeys(records), [records]);
  const fields = useMemo<FieldDef[]>(() => [...CORE_FIELDS, ...customKeys.map(customFieldDef)], [customKeys]);
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

  function saveView(asNew: boolean) {
    if (asNew || isPreset(activeId)) {
      const name = window.prompt("Name this view", view.name === stored.name ? `${view.name} (copy)` : view.name)?.trim();
      if (!name) return;
      const v = { ...view, id: newViewId(), name: name.slice(0, 60) };
      const next = [...saved, v];
      setSaved(next);
      storeSavedViews(next);
      switchView(v);
      flash(`Saved view "${v.name}" in this browser.`);
    } else {
      const next = saved.map((s) => (s.id === activeId ? { ...view } : s));
      setSaved(next);
      storeSavedViews(next);
      flash("View updated.");
    }
  }

  function deleteView() {
    if (isPreset(activeId)) return;
    if (!window.confirm(`Delete the view "${stored.name}"?`)) return;
    const next = saved.filter((s) => s.id !== activeId);
    setSaved(next);
    storeSavedViews(next);
    switchView(DEFAULT_VIEW);
  }

  const saveField = useCallback(
    async (record: CrmRecord, field: FieldDef, value: string): Promise<boolean> => {
      const before = record;
      setRecords((rs) => rs.map((r) => (r.id === record.id ? optimistic(r, field, value) : r)));
      const res = await fetch(`/api/crm/records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patchBodyFor(field, value), expectedUpdated: record.updated_date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecords((rs) => rs.map((r) => (r.id === record.id ? before : r)));
        flash(data.errors?.join("; ") ?? data.error ?? "Save failed");
        if (res.status === 409) await load();
        return false;
      }
      setRecords((rs) => rs.map((r) => (r.id === record.id ? { ...r, updated_date: data.updated_date ?? r.updated_date } : r)));
      return true;
    },
    [flash, load],
  );

  async function moveStage(id: string, stage: StageKey) {
    const r = records.find((x) => x.id === id);
    if (!r || r.stage === stage) return;
    const field = CORE_FIELDS.find((f) => f.key === "stage")!;
    const ok = await saveField(r, field, stage);
    if (ok) flash(`${displayName(r)} → ${STAGES.find((s) => s.key === stage)?.label}`);
  }

  async function bulk(patch: Record<string, unknown>, label: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const res = await fetch("/api/crm/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      flash(data.errors?.join("; ") ?? data.error ?? "Bulk update failed");
      return;
    }
    flash(`${label}: ${data.updated} updated${data.failed?.length ? `, ${data.failed.length} failed` : ""}.`);
    setSelected(new Set());
    await load();
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows, visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaddaddy-${view.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setFilter(i: number, f: Filter | null) {
    const filters = [...view.filters];
    if (f === null) filters.splice(i, 1);
    else filters[i] = f;
    setView({ ...view, filters });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-xs text-neutral-500">
            <Link href="/" className="hover:text-neutral-300">Console</Link> / CRM
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads workspace</h1>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
          {[
            ["In view", stats.count.toLocaleString()],
            ["Open pipeline", money(stats.openValue)],
            ["Won", money(stats.wonValue)],
            ["Valid emails", stats.validEmails.toLocaleString()],
            ["Follow-ups due", stats.followUpsDue.toLocaleString()],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-neutral-500">{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <nav className="mb-3 flex gap-1 overflow-x-auto border-b border-neutral-800" aria-label="Views">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => switchView(v)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${v.id === activeId ? "border-neutral-100 text-white" : "border-transparent text-neutral-400 hover:text-neutral-200"}`}
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
          className={`${inputCls} w-full sm:w-72`}
          aria-label="Search records"
        />
        <div className="flex rounded-lg border border-neutral-700 p-0.5 text-sm" role="group" aria-label="Layout">
          {(["table", "kanban"] as const).map((m) => (
            <button key={m} onClick={() => setView({ ...view, mode: m })} className={`rounded-md px-2.5 py-1 ${view.mode === m ? "bg-neutral-800 text-white" : "text-neutral-400"}`}>
              {m === "table" ? "Table" : "Board"}
            </button>
          ))}
        </div>
        <button className={btnCls} onClick={() => setView({ ...view, filters: [...view.filters, { field: "stage", op: "is", value: "new" }] })}>+ Filter</button>
        <select
          className={inputCls}
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
          <div className="relative">
            <button className={btnCls} onClick={() => setShowColumns((s) => !s)} aria-expanded={showColumns}>Columns</button>
            {showColumns && (
              <div className="absolute z-20 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl">
                {fields.filter((f) => f.key !== "name").map((f) => (
                  <label key={f.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-900">
                    <input
                      type="checkbox"
                      className="accent-neutral-100"
                      checked={!view.hidden.includes(f.key)}
                      onChange={(e) =>
                        setView({ ...view, hidden: e.target.checked ? view.hidden.filter((h) => h !== f.key) : [...view.hidden, f.key] })
                      }
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {dirty && <button className={btnPrimaryCls} onClick={() => saveView(false)}>{isPreset(activeId) ? "Save as view" : "Save view"}</button>}
          {dirty && <button className={btnCls} onClick={() => switchView(stored)}>Reset</button>}
          {!isPreset(activeId) && <button className={btnCls} onClick={() => saveView(true)}>Duplicate</button>}
          {!isPreset(activeId) && <button className={btnCls} onClick={deleteView}>Delete view</button>}
          <button className={btnCls} onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button>
        </div>
      </div>

      {view.filters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {view.filters.map((f, i) => {
            const op = FILTER_OPS.find((o) => o.op === f.op);
            return (
              <div key={i} className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
                <select className={`${inputCls} py-1`} value={f.field} onChange={(e) => setFilter(i, { ...f, field: e.target.value })} aria-label="Filter field">
                  {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <select className={`${inputCls} py-1`} value={f.op} onChange={(e) => setFilter(i, { ...f, op: e.target.value as Filter["op"] })} aria-label="Filter operator">
                  {FILTER_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                {op?.needsValue &&
                  (f.field === "stage" ? (
                    <select className={`${inputCls} py-1`} value={f.value ?? ""} onChange={(e) => setFilter(i, { ...f, value: e.target.value })} aria-label="Filter value">
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  ) : (
                    <input className={`${inputCls} w-32 py-1`} value={f.value ?? ""} onChange={(e) => setFilter(i, { ...f, value: e.target.value })} aria-label="Filter value" />
                  ))}
                <button onClick={() => setFilter(i, null)} className="px-1.5 text-neutral-500 hover:text-white" aria-label="Remove filter">×</button>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-sm backdrop-blur">
          <span className="font-medium">{selected.size} selected</span>
          <select
            className={`${inputCls} py-1`}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulk({ stage: e.target.value }, "Stage changed");
              e.target.value = "";
            }}
            aria-label="Move selected to stage"
          >
            <option value="">Move to stage…</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className={btnCls} onClick={() => { const t = window.prompt("Set owner (email or name)")?.trim(); if (t !== undefined) bulk({ assigned_to: t }, "Owner set"); }}>Set owner</button>
          <button className={btnCls} onClick={() => { const d = window.prompt("Follow-up date (YYYY-MM-DD)")?.trim(); if (d) bulk({ next_follow_up: d }, "Follow-up set"); }}>Set follow-up</button>
          <button className="ml-auto text-neutral-400 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-4 right-4 z-30 max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm shadow-xl">{toast}</div>}

      {loading ? (
        <div className="rounded-xl border border-neutral-800 p-10 text-center text-sm text-neutral-500">Loading records…</div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-6 text-sm text-red-300">
          Could not load records: {loadError} <button onClick={load} className="ml-2 underline">Retry</button>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-10 text-center">
          <p className="mb-1 font-medium">No leads yet</p>
          <p className="text-sm text-neutral-500">Add, import, scrape or capture leads from the <Link href="/" className="underline">console</Link>; they appear here instantly.</p>
        </div>
      ) : view.mode === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-neutral-950 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    className="accent-neutral-100"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="Select all in view"
                  />
                </th>
                {visible.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    <button
                      className="hover:text-neutral-200"
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
                <tr key={r.id} className={`border-t border-neutral-800/80 hover:bg-neutral-950 ${selected.has(r.id) ? "bg-neutral-900/60" : ""}`}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      className="accent-neutral-100"
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
                    <td key={f.key} className="max-w-[240px] px-3 py-1.5 align-middle">
                      {f.key === "name" ? (
                        <Link href={`/crm/${r.id}`} className="font-medium text-neutral-100 hover:underline">{displayName(r)}</Link>
                      ) : (
                        <EditableCell record={r} field={f} onSave={(field, value) => saveField(r, field, value)} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-6 text-center text-sm text-neutral-500">No records match this view.</p>}
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
                className="flex w-72 shrink-0 flex-col rounded-xl border border-neutral-800 bg-neutral-950/60"
                aria-label={`${s.label} column`}
              >
                <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={`h-2 w-2 rounded-full ${STAGE_STYLES[s.key].dot}`} />
                    {s.label}
                    <span className="text-neutral-500">{items.length}</span>
                  </span>
                  <span className="text-xs tabular-nums text-neutral-500">{money(total)}</span>
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
                      className={`cursor-grab rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-sm hover:border-neutral-600 active:cursor-grabbing ${dragId === r.id ? "opacity-50" : ""}`}
                    >
                      <Link href={`/crm/${r.id}`} className="font-medium hover:underline">{displayName(r)}</Link>
                      {(r.company || r.job_title) && <div className="truncate text-xs text-neutral-400">{[r.job_title, r.company].filter(Boolean).join(" · ")}</div>}
                      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                        <span className="tabular-nums">{money(r.estimated_value) || "—"}</span>
                        <span className="flex items-center gap-2">
                          {r.lead_score !== null && <span title="Lead score">★ {r.lead_score}</span>}
                          <select
                            value={r.stage}
                            onChange={(e) => moveStage(r.id, e.target.value as StageKey)}
                            className="rounded bg-transparent text-neutral-400 outline-none hover:text-white"
                            aria-label={`Move ${displayName(r)} to stage`}
                          >
                            {STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                          </select>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {truncated && <p className="mt-3 text-xs text-amber-400">Showing the 2,000 most recently updated records; older records are not loaded in this workspace yet.</p>}
    </main>
  );
}
