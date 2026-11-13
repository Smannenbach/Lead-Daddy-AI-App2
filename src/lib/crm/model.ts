// CRM workspace model — pure, framework-free logic (unit tested in tests/crm-model.test.ts).
// Patterns (records, typed fields, saved views, kanban grouping, activity timeline)
// are inspired by open-source CRMs such as Twenty; this is an independent implementation.
//
// Storage reality (live Base44 schema, no DDL allowed):
//   - core fields map 1:1 to crm_contact columns
//   - user-defined fields live in crm_contact.custom_fields.crm_fields (jsonb namespace)
//   - the activity timeline lives in crm_contact.engagement_history (jsonb array)
//   - tcpa_consent stays in custom_fields.tcpa_consent and is NEVER writable from here
//     (consent is captured only through the add-lead / capture flows that record it).

import { readConsentRecord, type ConsentRecord } from "@/lib/consent";
import { normalizePhone } from "@/lib/phone";

export type StageKey = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export const STAGES: ReadonlyArray<{ key: StageKey; label: string; tone: string }> = [
  { key: "new", label: "New", tone: "sky" },
  { key: "contacted", label: "Contacted", tone: "violet" },
  { key: "qualified", label: "Qualified", tone: "amber" },
  { key: "proposal", label: "Proposal", tone: "orange" },
  { key: "negotiation", label: "Negotiation", tone: "pink" },
  { key: "won", label: "Won", tone: "emerald" },
  { key: "lost", label: "Lost", tone: "neutral" },
];

const STAGE_KEYS = new Set<string>(STAGES.map((s) => s.key));

export function isStage(value: unknown): value is StageKey {
  return typeof value === "string" && STAGE_KEYS.has(value);
}

/**
 * crm_contact is shared with the Base44 app, whose pipeline uses mortgage stages.
 * Those rows are shown in the nearest app2 column instead of all landing in "new".
 * The stored value is never rewritten unless a user moves the lead.
 */
export const BASE44_STAGE_MAP: Readonly<Record<string, StageKey>> = {
  lead: "new",
  nurture: "contacted",
  prospect: "qualified",
  application: "proposal",
  opportunity: "proposal",
  underwriting: "negotiation",
  approved: "negotiation",
  closed: "won",
  customer: "won",
};

/** Unknown stage values are shown in the "new" column rather than disappearing. */
export function normalizeStage(value: unknown): StageKey {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (isStage(v)) return v;
  return BASE44_STAGE_MAP[v] ?? "new";
}

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "currency"
  | "stage"
  | "tags"
  | "date"
  | "status"
  | "readonly";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  editable: boolean;
  custom?: boolean;
}

export const CORE_FIELDS: ReadonlyArray<FieldDef> = [
  { key: "name", label: "Name", type: "readonly", editable: false },
  { key: "company", label: "Company", type: "text", editable: true },
  { key: "job_title", label: "Title", type: "text", editable: true },
  { key: "email", label: "Email", type: "email", editable: true },
  { key: "phone", label: "Phone", type: "phone", editable: true },
  { key: "stage", label: "Stage", type: "stage", editable: true },
  { key: "lead_score", label: "Score", type: "number", editable: true },
  { key: "estimated_value", label: "Value", type: "currency", editable: true },
  { key: "tags", label: "Tags", type: "tags", editable: true },
  { key: "next_follow_up", label: "Follow-up", type: "date", editable: true },
  { key: "assigned_to", label: "Owner", type: "text", editable: true },
  { key: "lead_source", label: "Source", type: "text", editable: true },
  { key: "email_status", label: "Email status", type: "status", editable: false },
  { key: "phone_status", label: "Phone status", type: "status", editable: false },
  { key: "consent", label: "TCPA consent", type: "status", editable: false },
  { key: "created_date", label: "Created", type: "date", editable: false },
  { key: "updated_date", label: "Updated", type: "date", editable: false },
];

export interface TimelineEntry {
  type: "created" | "stage_changed" | "field_changed" | "note" | "verified" | "system";
  at: string;
  by: string | null;
  detail: string;
}

export interface CrmRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  stage: StageKey;
  lead_score: number | null;
  estimated_value: number | null;
  tags: string[];
  next_follow_up: string | null;
  assigned_to: string | null;
  lead_source: string | null;
  notes: string | null;
  email_status: string;
  phone_status: string;
  consent: string;
  /** How/where/when consent was recorded. null for leads created before consent records existed. */
  consent_record: ConsentRecord | null;
  custom: Record<string, string>;
  created_date: string;
  updated_date: string;
}

export function displayName(r: Pick<CrmRecord, "first_name" | "last_name" | "email">): string {
  const n = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return n || r.email || "Unnamed";
}

// ── Row mapping ────────────────────────────────────────────────────────────

export const CUSTOM_KEY = /^[a-z][a-z0-9_]{0,39}$/;

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean))];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readCustomFields(customFields: unknown): Record<string, string> {
  const ns = asObject(asObject(customFields).crm_fields);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ns)) {
    if (CUSTOM_KEY.test(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) out[k] = String(v);
  }
  return out;
}

export interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  lead_score: number | null;
  estimated_value: number | null;
  tags: unknown;
  next_follow_up: string | null;
  assigned_to: string | null;
  lead_source: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_date: string;
  updated_date: string;
}

export const CONTACT_COLUMNS =
  "id, first_name, last_name, company, job_title, email, phone, stage, lead_score, estimated_value, tags, next_follow_up, assigned_to, lead_source, notes, custom_fields, created_date, updated_date";

export function toRecord(row: ContactRow, emailStatus = "unverified", phoneStatus = "unverified"): CrmRecord {
  const cf = asObject(row.custom_fields);
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    company: row.company,
    job_title: row.job_title,
    email: row.email,
    phone: row.phone,
    stage: normalizeStage(row.stage),
    lead_score: row.lead_score,
    estimated_value: row.estimated_value,
    tags: asTags(row.tags),
    next_follow_up: row.next_follow_up,
    assigned_to: row.assigned_to,
    lead_source: row.lead_source,
    notes: row.notes,
    email_status: emailStatus,
    phone_status: phoneStatus,
    consent: typeof cf.tcpa_consent === "string" ? cf.tcpa_consent : "none",
    consent_record: readConsentRecord(row.custom_fields),
    custom: readCustomFields(row.custom_fields),
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

/** Union of custom field keys present across records, sorted — shared by every viewer. */
export function customFieldKeys(records: CrmRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of records) for (const k of Object.keys(r.custom)) keys.add(k);
  return [...keys].sort();
}

export function customFieldDef(key: string): FieldDef {
  const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { key: `custom.${key}`, label, type: "text", editable: true, custom: true };
}

// ── Field access ───────────────────────────────────────────────────────────

export function fieldValue(r: CrmRecord, key: string): string | number | string[] | null {
  if (key === "name") return displayName(r);
  if (key.startsWith("custom.")) return r.custom[key.slice(7)] ?? null;
  const v = (r as unknown as Record<string, unknown>)[key];
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

function asText(v: ReturnType<typeof fieldValue>): string {
  if (v === null) return "";
  if (Array.isArray(v)) return v.join(" ");
  return String(v);
}

// ── Views: search, filter, sort ────────────────────────────────────────────

export type FilterOp = "contains" | "is" | "is_not" | "empty" | "not_empty" | "gt" | "lt";

export const FILTER_OPS: ReadonlyArray<{ op: FilterOp; label: string; needsValue: boolean }> = [
  { op: "contains", label: "contains", needsValue: true },
  { op: "is", label: "is", needsValue: true },
  { op: "is_not", label: "is not", needsValue: true },
  { op: "gt", label: "greater than", needsValue: true },
  { op: "lt", label: "less than", needsValue: true },
  { op: "not_empty", label: "is set", needsValue: false },
  { op: "empty", label: "is empty", needsValue: false },
];

export interface Filter {
  field: string;
  op: FilterOp;
  value?: string;
}

export interface Sort {
  field: string;
  dir: "asc" | "desc";
}

export interface ViewState {
  id: string;
  name: string;
  mode: "table" | "kanban";
  search: string;
  filters: Filter[];
  sort: Sort[];
  hidden: string[];
}

export const DEFAULT_VIEW: ViewState = {
  id: "all",
  name: "All leads",
  mode: "table",
  search: "",
  filters: [],
  sort: [{ field: "updated_date", dir: "desc" }],
  hidden: ["lead_source", "assigned_to", "updated_date", "phone_status", "job_title"],
};

export const PRESET_VIEWS: ReadonlyArray<ViewState> = [
  DEFAULT_VIEW,
  { ...DEFAULT_VIEW, id: "pipeline", name: "Pipeline board", mode: "kanban" },
  {
    ...DEFAULT_VIEW,
    id: "ready",
    name: "Ready to contact",
    filters: [
      { field: "email_status", op: "is", value: "valid" },
      { field: "stage", op: "is", value: "new" },
      { field: "consent", op: "is", value: "granted" },
    ],
  },
  {
    ...DEFAULT_VIEW,
    id: "followups",
    name: "Follow-ups",
    filters: [{ field: "next_follow_up", op: "not_empty" }],
    sort: [{ field: "next_follow_up", dir: "asc" }],
  },
  {
    ...DEFAULT_VIEW,
    id: "hot",
    name: "Hot (score 70+)",
    filters: [{ field: "lead_score", op: "gt", value: "69" }],
    sort: [{ field: "lead_score", dir: "desc" }],
  },
];

function matchesFilter(r: CrmRecord, f: Filter): boolean {
  const raw = fieldValue(r, f.field);
  const text = asText(raw).toLowerCase();
  const want = (f.value ?? "").trim().toLowerCase();
  switch (f.op) {
    case "empty":
      return text === "";
    case "not_empty":
      return text !== "";
    case "contains":
      return want === "" || text.includes(want);
    case "is":
      return Array.isArray(raw) ? raw.some((t) => t.toLowerCase() === want) : text === want;
    case "is_not":
      return Array.isArray(raw) ? !raw.some((t) => t.toLowerCase() === want) : text !== want;
    case "gt":
    case "lt": {
      if (text === "" || want === "") return false;
      const a = Number(text);
      const b = Number(want);
      if (Number.isNaN(a) || Number.isNaN(b)) return f.op === "gt" ? text > want : text < want; // ISO dates compare lexically
      return f.op === "gt" ? a > b : a < b;
    }
    default:
      return true;
  }
}

export function matchesSearch(r: CrmRecord, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const hay = [displayName(r), r.company, r.job_title, r.email, r.phone, r.notes, r.tags.join(" "), Object.values(r.custom).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

function compare(a: CrmRecord, b: CrmRecord, s: Sort): number {
  const va = fieldValue(a, s.field);
  const vb = fieldValue(b, s.field);
  const ea = va === null || asText(va) === "";
  const eb = vb === null || asText(vb) === "";
  if (ea && eb) return 0;
  if (ea) return 1; // empties always last
  if (eb) return -1;
  let c: number;
  if (s.field === "stage") c = STAGES.findIndex((x) => x.key === va) - STAGES.findIndex((x) => x.key === vb);
  else if (typeof va === "number" && typeof vb === "number") c = va - vb;
  else c = asText(va).localeCompare(asText(vb), undefined, { numeric: true, sensitivity: "base" });
  return s.dir === "asc" ? c : -c;
}

export function applyView(records: CrmRecord[], view: Pick<ViewState, "search" | "filters" | "sort">): CrmRecord[] {
  const out = records.filter((r) => matchesSearch(r, view.search) && view.filters.every((f) => matchesFilter(r, f)));
  if (view.sort.length > 0) {
    out.sort((a, b) => {
      for (const s of view.sort) {
        const c = compare(a, b, s);
        if (c !== 0) return c;
      }
      return 0;
    });
  }
  return out;
}

export function groupByStage(records: CrmRecord[]): Record<StageKey, CrmRecord[]> {
  const groups = Object.fromEntries(STAGES.map((s) => [s.key, [] as CrmRecord[]])) as Record<StageKey, CrmRecord[]>;
  for (const r of records) groups[r.stage].push(r);
  return groups;
}

export interface Summary {
  count: number;
  openValue: number;
  wonValue: number;
  validEmails: number;
  consented: number;
  followUpsDue: number;
}

/** Every number here is derived from the records passed in — never hardcoded. */
export function summarize(records: CrmRecord[], now: Date = new Date()): Summary {
  const today = now.toISOString().slice(0, 10);
  let openValue = 0;
  let wonValue = 0;
  let validEmails = 0;
  let consented = 0;
  let followUpsDue = 0;
  for (const r of records) {
    const v = r.estimated_value ?? 0;
    if (r.stage === "won") wonValue += v;
    else if (r.stage !== "lost") openValue += v;
    if (r.email_status === "valid") validEmails += 1;
    if (r.consent === "granted") consented += 1;
    if (r.next_follow_up && r.next_follow_up.slice(0, 10) <= today && r.stage !== "won" && r.stage !== "lost") followUpsDue += 1;
  }
  return { count: records.length, openValue, wonValue, validEmails, consented, followUpsDue };
}

// ── Writes: validation + history ───────────────────────────────────────────

const RESERVED_CUSTOM = new Set(["tcpa_consent", "crm_fields", "sms_opt_out", "consent_record"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PatchInput = Partial<
  Record<
    | "first_name"
    | "last_name"
    | "company"
    | "job_title"
    | "email"
    | "phone"
    | "stage"
    | "lead_score"
    | "estimated_value"
    | "tags"
    | "next_follow_up"
    | "assigned_to"
    | "lead_source"
    | "custom"
    | "note",
    unknown
  >
>;

export interface ColumnPatch {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  stage?: StageKey;
  lead_score?: number | null;
  estimated_value?: number | null;
  tags?: string[];
  next_follow_up?: string | null;
  assigned_to?: string | null;
  lead_source?: string | null;
}

export interface SanitizedPatch {
  columns: ColumnPatch;
  custom: Record<string, string | null>;
  note: string | null;
  errors: string[];
}

const TEXT_FIELDS = ["first_name", "last_name", "company", "job_title", "assigned_to", "lead_source"] as const;

function cleanText(v: unknown, max = 200): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim().slice(0, max);
  return s === "" ? null : s;
}

function cleanNumber(v: unknown, min: number, max: number): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) return "invalid";
  return n;
}

export function sanitizePatch(input: unknown): SanitizedPatch {
  const out: SanitizedPatch = { columns: {}, custom: {}, note: null, errors: [] };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    out.errors.push("body must be an object");
    return out;
  }
  const p = input as PatchInput;
  for (const f of TEXT_FIELDS) if (f in p) out.columns[f] = cleanText(p[f]);
  if ("first_name" in p && !out.columns.first_name) out.errors.push("first_name cannot be empty");
  if ("phone" in p) {
    const ph = normalizePhone(p.phone);
    if (ph.ok) out.columns.phone = ph.value;
    else out.errors.push(ph.error);
  }
  if ("email" in p) {
    const e = cleanText(p.email)?.toLowerCase() ?? null;
    if (e !== null && !EMAIL.test(e)) out.errors.push("email is not valid");
    else out.columns.email = e;
  }
  if ("stage" in p) {
    const s = typeof p.stage === "string" ? p.stage.trim().toLowerCase() : "";
    if (isStage(s)) out.columns.stage = s;
    else out.errors.push(`stage must be one of ${STAGES.map((x) => x.key).join(", ")}`);
  }
  if ("lead_score" in p) {
    const n = cleanNumber(p.lead_score, 0, 100);
    if (n === "invalid") out.errors.push("lead_score must be 0–100");
    else out.columns.lead_score = n;
  }
  if ("estimated_value" in p) {
    const n = cleanNumber(p.estimated_value, 0, 1e12);
    if (n === "invalid") out.errors.push("estimated_value must be a positive number");
    else out.columns.estimated_value = n;
  }
  if ("tags" in p) {
    const raw = Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? p.tags.split(",") : [];
    out.columns.tags = [
      ...new Set(raw.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 40)).filter(Boolean)),
    ].slice(0, 25);
  }
  if ("next_follow_up" in p) {
    const d = cleanText(p.next_follow_up, 40);
    if (d !== null && Number.isNaN(Date.parse(d))) out.errors.push("next_follow_up must be a date");
    else out.columns.next_follow_up = d;
  }
  if ("custom" in p) {
    const entries = Object.entries(asObject(p.custom));
    if (entries.length > 50) out.errors.push("too many custom fields in one update");
    for (const [k, v] of entries.slice(0, 50)) {
      if (!CUSTOM_KEY.test(k) || RESERVED_CUSTOM.has(k)) {
        out.errors.push(`custom field '${k}' is not allowed`);
        continue;
      }
      out.custom[k] = cleanText(v, 500);
    }
  }
  if ("note" in p) {
    const n = cleanText(p.note, 4000);
    if (n) out.note = n;
  }
  return out;
}

/** Merge a custom-field patch into the stored custom_fields jsonb without touching other keys (e.g. tcpa_consent). */
export function mergeCustomFields(stored: unknown, patch: Record<string, string | null>): Record<string, unknown> {
  const base = { ...asObject(stored) };
  const ns: Record<string, unknown> = { ...asObject(base.crm_fields) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete ns[k];
    else ns[k] = v;
  }
  base.crm_fields = ns;
  return base;
}

export const MAX_TIMELINE = 200;

const TIMELINE_TYPES = new Set(["created", "stage_changed", "field_changed", "note", "verified", "system"]);

function firstString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * Normalizes stored history for display. Older writers (email/SMS composers, Base44) used
 * other shapes ({ date|timestamp, description|content }); those are shown, not discarded.
 */
export function readTimeline(stored: unknown): TimelineEntry[] {
  if (!Array.isArray(stored)) return [];
  const out: TimelineEntry[] = [];
  for (const e of stored) {
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const o = e as Record<string, unknown>;
    const at = firstString(o, ["at", "timestamp", "date", "created_at", "created_date"]);
    const detail = firstString(o, ["detail", "description", "content", "message", "summary", "body"]);
    if (!at || !detail) continue;
    const rawType = typeof o.type === "string" ? o.type : "system";
    const type = (TIMELINE_TYPES.has(rawType) ? rawType : rawType.includes("note") ? "note" : "system") as TimelineEntry["type"];
    const by = firstString(o, ["by", "user", "author", "actor"]);
    out.push({ type, at, by, detail });
  }
  return out;
}

/** Timeline entries describing what a patch changes. Pure: caller supplies time + actor. */
export function historyFor(
  before: Partial<Record<keyof ColumnPatch, unknown>> & { custom?: Record<string, string> },
  patch: SanitizedPatch,
  actor: string | null,
  at: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const [k, v] of Object.entries(patch.columns)) {
    const prev = before[k as keyof ColumnPatch];
    if (JSON.stringify(prev ?? null) === JSON.stringify(v ?? null)) continue;
    if (k === "stage") {
      entries.push({ type: "stage_changed", at, by: actor, detail: `Stage: ${String(prev ?? "new")} → ${String(v)}` });
    } else {
      const label = CORE_FIELDS.find((f) => f.key === k)?.label ?? k;
      const shown = Array.isArray(v) ? v.join(", ") : (v ?? "");
      entries.push({ type: "field_changed", at, by: actor, detail: `${label} set to ${String(shown) || "empty"}` });
    }
  }
  for (const [k, v] of Object.entries(patch.custom)) {
    if ((before.custom?.[k] ?? null) === v) continue;
    entries.push({ type: "field_changed", at, by: actor, detail: `${customFieldDef(k).label} set to ${v ?? "empty"}` });
  }
  if (patch.note) entries.push({ type: "note", at, by: actor, detail: patch.note });
  return entries;
}

/** Appends without rewriting or dropping existing entries of any shape (only the oldest beyond the cap). */
export function appendTimeline(stored: unknown, entries: TimelineEntry[]): unknown[] {
  const existing = Array.isArray(stored) ? stored : [];
  return [...existing, ...entries].slice(-MAX_TIMELINE);
}

/** Request body for saving one field from the UI (custom fields go under `custom`). */
export function patchBodyFor(field: Pick<FieldDef, "key">, value: string): Record<string, unknown> {
  if (field.key.startsWith("custom.")) return { custom: { [field.key.slice(7)]: value } };
  return { [field.key]: value };
}

// ── Export ─────────────────────────────────────────────────────────────────

function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // neutralize spreadsheet formula injection
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(records: CrmRecord[], fields: FieldDef[]): string {
  const header = fields.map((f) => csvCell(f.label)).join(",");
  const rows = records.map((r) => fields.map((f) => csvCell(asText(fieldValue(r, f.key)))).join(","));
  return [header, ...rows].join("\r\n");
}
