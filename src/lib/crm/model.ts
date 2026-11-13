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
import { LIMITS, tooLong } from "@/lib/leads/limits";

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
  /** Stable id for display entries (stored id, or a hash of the entry for older rows). */
  id?: string;
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
  /** Display names for custom fields, keyed like `custom`. Missing = derived from the key. */
  custom_labels: Record<string, string>;
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

/** Labels live next to the values: custom_fields.crm_field_labels = { key: "Display Name" }. */
export function readCustomLabels(customFields: unknown): Record<string, string> {
  const ns = asObject(asObject(customFields).crm_field_labels);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ns)) if (CUSTOM_KEY.test(k) && typeof v === "string" && v.trim()) out[k] = v;
  return out;
}

export const CUSTOM_LABEL_MAX = 60;

/** Server-side key for a display name: "QA Test Bad Name!!" -> "qa_test_bad_name". null if no letters. */
export function keyFromLabel(label: string): string | null {
  const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/, "");
  return CUSTOM_KEY.test(key) ? key : null;
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
    custom_labels: readCustomLabels(row.custom_fields),
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

/** Like customFieldDef but uses the stored display name when there is one. */
export function customFieldDefLabeled(key: string, labels: Record<string, string>): FieldDef {
  const def = customFieldDef(key);
  return labels[key] ? { ...def, label: labels[key] } : def;
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

const RESERVED_CUSTOM = new Set(["tcpa_consent", "crm_fields", "crm_field_labels", "sms_opt_out", "consent_record"]);
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
    | "custom_labels"
    | "add_field"
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
  /** Display names to store for custom fields (set when a field is added). */
  customLabels?: Record<string, string>;
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
    out.errors.push("Nothing to save.");
    return out;
  }
  const p = input as PatchInput;
  for (const f of TEXT_FIELDS) {
    if (!(f in p)) continue;
    const v = cleanText(p[f], Number.MAX_SAFE_INTEGER);
    const err = tooLong(f, v);
    if (err) out.errors.push(err);
    else out.columns[f] = v;
  }
  if ("first_name" in p && !out.columns.first_name && !out.errors.some((e) => e.startsWith("First name"))) out.errors.push("First name can't be empty.");
  if ("phone" in p) {
    const ph = normalizePhone(p.phone);
    if (ph.ok) out.columns.phone = ph.value;
    else out.errors.push(ph.error);
  }
  if ("email" in p) {
    const e = cleanText(p.email, Number.MAX_SAFE_INTEGER)?.toLowerCase() ?? null;
    if (tooLong("email", e)) out.errors.push(tooLong("email", e)!);
    else if (e !== null && !EMAIL.test(e)) out.errors.push("Enter a valid email address.");
    else out.columns.email = e;
  }
  if ("stage" in p) {
    const s = typeof p.stage === "string" ? p.stage.trim().toLowerCase() : "";
    if (isStage(s)) out.columns.stage = s;
    else out.errors.push(`Pick a stage: ${STAGES.map((x) => x.label).join(", ")}.`);
  }
  if ("lead_score" in p) {
    const n = cleanNumber(p.lead_score, 0, 100);
    if (n === "invalid") out.errors.push("Score must be a number from 0 to 100.");
    else out.columns.lead_score = n;
  }
  if ("estimated_value" in p) {
    const n = cleanNumber(p.estimated_value, 0, 1e12);
    if (n === "invalid") out.errors.push("Estimated value must be a dollar amount of 0 or more.");
    else out.columns.estimated_value = n;
  }
  if ("tags" in p) {
    const raw = Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? p.tags.split(",") : [];
    out.columns.tags = [
      ...new Set(raw.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)),
    ];
    if (out.columns.tags.some((t) => tooLong("tag", t))) out.errors.push(tooLong("tag", "x".repeat(LIMITS.tag + 1))!);
    if (out.columns.tags.length > 25) out.errors.push("A lead can have up to 25 tags.");
  }
  if ("next_follow_up" in p) {
    const d = cleanText(p.next_follow_up, 40);
    if (d !== null && Number.isNaN(Date.parse(d))) out.errors.push("Follow up date must be a real date.");
    else out.columns.next_follow_up = d;
  }
  if ("custom" in p) {
    const entries = Object.entries(asObject(p.custom));
    if (entries.length > 50) out.errors.push("Change up to 50 custom fields at a time.");
    for (const [k, v] of entries.slice(0, 50)) {
      if (!CUSTOM_KEY.test(k) || RESERVED_CUSTOM.has(k)) {
        out.errors.push(`"${k}" isn't a valid field name. Use letters, numbers or underscores, starting with a letter.`);
        continue;
      }
      const cv = cleanText(v, Number.MAX_SAFE_INTEGER);
      if (tooLong("custom_value", cv)) out.errors.push(tooLong("custom_value", cv)!);
      else out.custom[k] = cv;
    }
  }
  if ("add_field" in p) {
    // { add_field: { label: "Loan Type!", value: "DSCR" } }: the server makes the key
    // (letters, numbers, underscores) and keeps the label exactly as typed for display.
    const f = asObject(p.add_field);
    const label = typeof f.label === "string" ? f.label.trim() : "";
    const key = label ? keyFromLabel(label) : null;
    const value = cleanText(f.value, Number.MAX_SAFE_INTEGER);
    if (!label) out.errors.push("Give the new field a name.");
    else if (label.length > CUSTOM_LABEL_MAX) out.errors.push(`Field names can be up to ${CUSTOM_LABEL_MAX} characters.`);
    else if (/[\u0000-\u001F<>]/.test(label)) out.errors.push("Field names can't contain < > or control characters.");
    else if (!key || RESERVED_CUSTOM.has(key)) out.errors.push("Field names need to start with a letter.");
    else if (!value) out.errors.push("Give the new field a value.");
    else if (tooLong("custom_value", value)) out.errors.push(tooLong("custom_value", value)!);
    else {
      out.custom[key] = value;
      out.customLabels = { ...(out.customLabels ?? {}), [key]: label };
    }
  }
  if ("custom_labels" in p) {
    for (const [k, v] of Object.entries(asObject(p.custom_labels))) {
      const label = typeof v === "string" ? v.trim() : "";
      if (!CUSTOM_KEY.test(k) || RESERVED_CUSTOM.has(k)) out.errors.push(`"${k}" isn't a valid field name. Use letters, numbers or underscores, starting with a letter.`);
      else if (!label || label.length > CUSTOM_LABEL_MAX || /[\u0000-\u001F<>]/.test(label)) out.errors.push(`Field names can be 1 to ${CUSTOM_LABEL_MAX} characters, without < > or control characters.`);
      else out.customLabels = { ...(out.customLabels ?? {}), [k]: label };
    }
  }
  if ("note" in p) {
    const n = cleanText(p.note, Number.MAX_SAFE_INTEGER);
    if (tooLong("note", n)) out.errors.push(tooLong("note", n)!);
    else if (n) out.note = n;
  }
  return out;
}

/** Merge a custom-field patch into the stored custom_fields jsonb without touching other keys (e.g. tcpa_consent). */
export function mergeCustomFields(
  stored: unknown,
  patch: Record<string, string | null>,
  labels: Record<string, string> = {},
): Record<string, unknown> {
  const base = { ...asObject(stored) };
  const ns: Record<string, unknown> = { ...asObject(base.crm_fields) };
  const names: Record<string, unknown> = { ...asObject(base.crm_field_labels) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete ns[k];
      delete names[k];
    } else ns[k] = v;
  }
  for (const [k, label] of Object.entries(labels)) names[k] = label;
  base.crm_fields = ns;
  if (Object.keys(names).length > 0 || "crm_field_labels" in base) base.crm_field_labels = names;
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

/** Deterministic id for a stored timeline entry, so notes can be deleted without a schema change. */
export function timelineEntryId(stored: unknown): string {
  const o = asObject(stored);
  if (typeof o.id === "string" && o.id) return o.id;
  const text = JSON.stringify(o, Object.keys(o).sort());
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619);
    h2 = (Math.imul(31, h2) + text.charCodeAt(i)) | 0;
  }
  return `t_${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
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
    out.push({ id: timelineEntryId(o), type, at, by, detail });
  }
  return out;
}

const ACTIVITY_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  ...Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f.label])),
  lead_score: "Score",
  estimated_value: "Estimated value",
  next_follow_up: "Follow up date",
  assigned_to: "Owner",
  lead_source: "Source",
};

/** "First name set to Mike", "Tags set to hot, dscr", "Phone cleared". Never a raw column name. */
export function describeChange(key: string, value: unknown): string {
  const label = ACTIVITY_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) return `${label} cleared`;
  let shown: string;
  if (Array.isArray(value)) shown = value.join(", ");
  else if (key === "estimated_value" && typeof value === "number") shown = `$${value.toLocaleString("en-US")}`;
  else if (key === "next_follow_up" && typeof value === "string") shown = value.slice(0, 10);
  else shown = String(value);
  return `${label} set to ${shown}`;
}

/** Timeline entries describing what a patch changes. Pure: caller supplies time + actor. */
export function historyFor(
  before: Partial<Record<keyof ColumnPatch, unknown>> & { custom?: Record<string, string>; customLabels?: Record<string, string> },
  patch: SanitizedPatch,
  actor: string | null,
  at: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const [k, v] of Object.entries(patch.columns)) {
    const prev = before[k as keyof ColumnPatch];
    if (JSON.stringify(prev ?? null) === JSON.stringify(v ?? null)) continue;
    if (k === "stage") {
      const label = (x: unknown) => STAGES.find((st) => st.key === normalizeStage(x))?.label ?? String(x);
      entries.push({ type: "stage_changed", at, by: actor, detail: `Stage changed from ${label(prev ?? "new")} to ${label(v)}` });
    } else {
      entries.push({ type: "field_changed", at, by: actor, detail: describeChange(k, v) });
    }
  }
  for (const [k, v] of Object.entries(patch.custom)) {
    if ((before.custom?.[k] ?? null) === v) continue;
    const label = patch.customLabels?.[k] ?? before.customLabels?.[k] ?? customFieldDef(k).label;
    entries.push({ type: "field_changed", at, by: actor, detail: v === null ? `${label} removed` : `${label} set to ${v}` });
  }
  for (const [k, label] of Object.entries(patch.customLabels ?? {})) {
    if (k in patch.custom || before.customLabels?.[k] === label) continue;
    entries.push({ type: "field_changed", at, by: actor, detail: `Field ${before.customLabels?.[k] ?? customFieldDef(k).label} renamed to ${label}` });
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

export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // neutralize spreadsheet formula injection
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(records: CrmRecord[], fields: FieldDef[]): string {
  const header = fields.map((f) => csvCell(f.label)).join(",");
  const rows = records.map((r) => fields.map((f) => csvCell(asText(fieldValue(r, f.key)))).join(","));
  return [header, ...rows].join("\r\n");
}
