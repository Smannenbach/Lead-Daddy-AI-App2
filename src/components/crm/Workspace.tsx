"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { useDialogs } from "@/components/ui/app-dialogs";
import { brandCta, dangerOutline } from "@/components/ui/styles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  const [dragId, setDragId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState("");
  const { confirm, prompt, dialogs } = useDialogs();

  const flash = useCallback((text: string, error = false) => {
    if (error) toast.error(text);
    else toast.success(text);
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
    const owner = await prompt({ title: "Set Owner", label: "Owner (email or name)", confirmLabel: "Set Owner" });
    if (owner) runBulk("Owner set", { patch: { assigned_to: owner } });
  }
  async function bulkFollowUp() {
    const date = await prompt({ title: "Set Follow Up Date", label: "Follow Up Date", type: "date", confirmLabel: "Set Date" });
    if (date) runBulk("Follow up set", { patch: { next_follow_up: date } });
  }
  async function bulkTag() {
    const tags = await prompt({ title: "Add a Tag", label: "Tag (use commas for more than one)", confirmLabel: "Add Tag" });
    if (tags) runBulk("Tag added", { action: "add_tags", tags: tags.split(",") });
  }
  async function bulkDelete() {
    const n = selected.size;
    const ok = await confirm({
      title: `Delete ${n} lead${n === 1 ? "" : "s"}?`,
      body: "They'll be removed from Leads, exports and every campaign's recipients. This is logged.",
      confirmLabel: `Delete ${n} Lead${n === 1 ? "" : "s"}`,
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

  const brandCheck = "data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-600";
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <PageBody wide>
      <PageHeader
        title={title}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={records.length === 0}>
            <Download aria-hidden />
            Export CSV
          </Button>
        }
      />

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["In view", stats.count.toLocaleString()],
          ["Open pipeline", money(stats.openValue) || "$0"],
          ["Won", money(stats.wonValue) || "$0"],
          ["Consent on file", stats.consented.toLocaleString()],
          ["Follow ups due", stats.followUpsDue.toLocaleString()],
        ].map(([k, v]) => (
          <Card key={k} className="gap-0.5 px-4 py-3 shadow">
            <dt className="text-caption font-medium text-slate-500">{k}</dt>
            <dd className="text-lg font-bold tabular-nums">{v}</dd>
          </Card>
        ))}
      </dl>

      <Tabs value={activeId} onValueChange={(id) => { const v = views.find((x) => x.id === id); if (v) switchView(v); }} className="mb-3">
        <TabsList className="h-auto w-full justify-start overflow-x-auto bg-slate-100">
          {views.map((v) => (
            <TabsTrigger key={v.id} value={v.id} className="flex-none data-[state=active]:text-indigo-700">{v.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={view.search}
          onChange={(e) => setView({ ...view, search: e.target.value })}
          placeholder="Search name, company, email, tags…"
          className="w-full bg-white sm:w-72"
          aria-label="Search leads"
        />
        <Tabs value={view.mode} onValueChange={(m) => setView({ ...view, mode: m as ViewState["mode"] })}>
          <TabsList aria-label="Layout">
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="kanban">Board</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" onClick={() => setView({ ...view, filters: [...view.filters, { field: "stage", op: "is", value: "new" }] })}>
          <ListFilter aria-hidden />
          Add Filter
        </Button>
        <Select
          value={view.sort[0] ? `${view.sort[0].field}:${view.sort[0].dir}` : "none"}
          onValueChange={(v) => {
            const [field, dir] = v.split(":");
            setView({ ...view, sort: v === "none" ? [] : [{ field, dir: dir as "asc" | "desc" }] });
          }}
        >
          <SelectTrigger className="w-48 bg-white" aria-label="Sort by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Sort</SelectItem>
            {fields.flatMap((f) => [
              <SelectItem key={`${f.key}:asc`} value={`${f.key}:asc`}>{f.label} ↑</SelectItem>,
              <SelectItem key={`${f.key}:desc`} value={`${f.key}:desc`}>{f.label} ↓</SelectItem>,
            ])}
          </SelectContent>
        </Select>
        {view.mode === "table" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><Columns3 aria-hidden />Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel>Show Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {fields.filter((f) => f.key !== "name").map((f) => (
                <DropdownMenuCheckboxItem
                  key={f.key}
                  checked={!view.hidden.includes(f.key)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => setView({ ...view, hidden: on ? view.hidden.filter((h) => h !== f.key) : [...view.hidden, f.key] })}
                >
                  {f.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {dirty && <Button className={brandCta} onClick={() => saveView(false)}>{isPreset(activeId) ? "Save as View" : "Save View"}</Button>}
          {dirty && <Button variant="outline" onClick={() => switchView(stored)}>Reset</Button>}
          {!isPreset(activeId) && <Button variant="outline" onClick={() => saveView(true)}>Duplicate</Button>}
          {!isPreset(activeId) && <Button variant="outline" onClick={deleteView}>Delete View</Button>}
        </div>
      </div>

      {view.filters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {view.filters.map((f, i) => {
            const op = FILTER_OPS.find((o) => o.op === f.op);
            return (
              <div key={i} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <Select value={f.field} onValueChange={(v) => setFilter(i, { ...f, field: v, value: freshFilterValue(v) })}>
                  <SelectTrigger size="sm" aria-label="Filter field"><SelectValue /></SelectTrigger>
                  <SelectContent>{fields.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={f.op} onValueChange={(v) => setFilter(i, { ...f, op: v as Filter["op"] })}>
                  <SelectTrigger size="sm" aria-label="Filter operator"><SelectValue /></SelectTrigger>
                  <SelectContent>{FILTER_OPS.map((o) => <SelectItem key={o.op} value={o.op}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                {op?.needsValue &&
                  (f.field === "stage" ? (
                    <Select value={f.value || "new"} onValueChange={(v) => setFilter(i, { ...f, value: v })}>
                      <SelectTrigger size="sm" aria-label="Filter value"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-8 w-32" value={f.value ?? ""} onChange={(e) => setFilter(i, { ...f, value: e.target.value })} aria-label="Filter value" />
                  ))}
                <Button variant="ghost" size="icon-sm" onClick={() => setFilter(i, null)} aria-label="Remove filter">×</Button>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/95 px-3 py-2 text-body shadow-sm backdrop-blur">
          <span className="font-semibold text-indigo-800">{selected.size} selected</span>
          <Select key={`bulk-${selected.size}-${bulkBusy}`} disabled={Boolean(bulkBusy)} onValueChange={(v) => runBulk("Stage changed", { patch: { stage: v } })}>
            <SelectTrigger size="sm" className="bg-white" aria-label="Move selected to stage"><SelectValue placeholder="Move to Stage…" /></SelectTrigger>
            <SelectContent>{STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={Boolean(bulkBusy)} onClick={bulkTag}><TagIcon aria-hidden />Add Tag</Button>
          <Button variant="outline" size="sm" disabled={Boolean(bulkBusy)} onClick={bulkOwner}>Set Owner</Button>
          <Button variant="outline" size="sm" disabled={Boolean(bulkBusy)} onClick={bulkFollowUp}>Set Follow Up</Button>
          <Button variant="outline" size="sm" className={dangerOutline} disabled={Boolean(bulkBusy)} onClick={bulkDelete}><Trash2 aria-hidden />Delete</Button>
          {bulkBusy && <Spinner label="Working…" />}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {dialogs}

      {loading ? (
        <Card className="flex items-center p-10 shadow"><Spinner label="Loading leads…" /></Card>
      ) : loadError ? (
        <StatusMessage tone="err">
          Leads didn&apos;t load: {loadError} <Button variant="link" onClick={load} className="ml-2 h-auto p-0 font-semibold text-current underline">Retry</Button>
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
              <li key={r.id}>
                <Card className={cn("gap-0 rounded-xl border-slate-300 p-3", selected.has(r.id) && "ring-2 ring-indigo-200")}>
                  <div className="flex items-start gap-3">
                    <Checkbox className={cn("mt-1", brandCheck)} checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label={`Select ${displayName(r)}`} />
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
                </Card>
              </li>
            ))}
            {rows.length === 0 && <li className="p-6 text-center text-body text-slate-600">No leads match this view.</li>}
          </ul>
          <Card className="hidden gap-0 overflow-hidden py-0 shadow @min-[600px]:flex">
            <Table className="min-w-[900px] table-fixed">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-10 px-3">
                    <Checkbox className={brandCheck} checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all in view" />
                  </TableHead>
                  {visible.map((f) => (
                    <TableHead key={f.key} className={cn("px-3 text-caption font-semibold uppercase tracking-wide text-slate-500", f.key === "name" ? "w-48" : "w-36")}>
                      <button
                        className="hover:text-slate-900"
                        onClick={() => setView({ ...view, sort: [{ field: f.key, dir: view.sort[0]?.field === f.key && view.sort[0].dir === "asc" ? "desc" : "asc" }] })}
                      >
                        {f.label}
                        {view.sort[0]?.field === f.key ? (view.sort[0].dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined} className="data-[state=selected]:bg-indigo-50/60">
                    <TableCell className="px-3 py-2.5">
                      <Checkbox className={brandCheck} checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label={`Select ${displayName(r)}`} />
                    </TableCell>
                    {visible.map((f) => (
                      <TableCell key={f.key} className="overflow-hidden px-3 py-2.5">
                        {f.key === "name" ? (
                          <Link href={`/crm/${r.id}`} className="block truncate font-medium text-slate-900 hover:text-indigo-600 hover:underline" title={displayName(r)}>{displayName(r)}</Link>
                        ) : (
                          <EditableCell record={r} field={f} onSave={(field, value) => saveField(r, field, value)} />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <div className="flex flex-col items-center p-10 text-center">
                <UserRoundX aria-hidden className="mb-3 size-16 text-slate-300" />
                <p className="text-body text-slate-600">No leads match this view.</p>
              </div>
            )}
          </Card>
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
                className="flex w-72 shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-100/70"
                aria-label={`${s.label} column`}
              >
                <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 text-body">
                  <span className="flex items-center gap-2 font-bold">
                    <span className={`h-2 w-2 rounded-full ${STAGE_STYLES[s.key].dot}`} />
                    {s.label}
                    <span className="font-normal text-slate-500">{items.length}</span>
                  </span>
                  <span className="text-caption tabular-nums text-slate-500">{money(total)}</span>
                </header>
                <div className="flex min-h-24 flex-col gap-2 p-2">
                  {items.map((r) => (
                    <Card
                      key={r.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", r.id);
                        setDragId(r.id);
                      }}
                      className={cn("cursor-grab gap-0 p-3 text-body shadow-sm hover:border-indigo-200 active:cursor-grabbing", dragId === r.id && "opacity-50")}
                    >
                      <Link href={`/crm/${r.id}`} className="block truncate font-medium hover:text-indigo-600 hover:underline">{displayName(r)}</Link>
                      {(r.company || r.job_title) && <div className="truncate text-caption text-slate-500">{[r.job_title, r.company].filter(Boolean).join(" · ")}</div>}
                      <div className="mt-2 flex items-center justify-between gap-2 text-caption text-slate-500">
                        <span className="tabular-nums">{money(r.estimated_value) || "No value"}</span>
                        {/* Works on touch screens where dragging doesn't. */}
                        <Select value={r.stage} onValueChange={(v) => moveStage(r.id, v as StageKey)}>
                          <SelectTrigger size="sm" className="h-7 w-auto px-2 text-caption" aria-label={`Move ${displayName(r)} to stage`}><SelectValue /></SelectTrigger>
                          <SelectContent>{STAGES.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {truncated && <p className="mt-3 text-caption text-amber-900">Showing the 2,000 most recently updated leads. Older leads aren&apos;t loaded here yet.</p>}
    </PageBody>
  );
}
