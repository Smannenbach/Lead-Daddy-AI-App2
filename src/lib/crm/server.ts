// Server-only CRM data access. Every function assumes the caller already passed
// requireUser() (session + allowlist); all queries are pinned to organizationId().
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { latestStatusByEmail, latestStatusByPhone } from "@/lib/verify/status";
import type { CrmContact } from "@/lib/supabase/database.types";
import {
  CONTACT_COLUMNS,
  appendTimeline,
  historyFor,
  mergeCustomFields,
  readCustomFields,
  readCustomLabels,
  readTimeline,
  toRecord,
  type ContactRow,
  type CrmRecord,
  type SanitizedPatch,
  type TimelineEntry,
} from "@/lib/crm/model";

export const RECORD_LIMIT = 2000;

async function withStatuses(rows: ContactRow[]): Promise<CrmRecord[]> {
  const [emailStatus, phoneStatus] = await Promise.all([
    latestStatusByEmail(rows.map((c) => c.email ?? "")),
    latestStatusByPhone(rows.map((c) => c.phone ?? "")),
  ]);
  return rows.map((c) => {
    const e = c.email?.trim().toLowerCase() ?? "";
    const p = c.phone?.trim().toLowerCase() ?? "";
    return toRecord(c, (e && emailStatus.get(e)) || "unverified", (p && phoneStatus.get(p)) || "unverified");
  });
}

export async function listRecords(): Promise<{ records: CrmRecord[]; truncated: boolean }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("crm_contact")
    .select(CONTACT_COLUMNS)
    .eq("organization_id", organizationId())
    .is("deleted_at", null)
    .order("updated_date", { ascending: false })
    .limit(RECORD_LIMIT + 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ContactRow[];
  const truncated = rows.length > RECORD_LIMIT;
  return { records: await withStatuses(rows.slice(0, RECORD_LIMIT)), truncated };
}

export async function getRecord(id: string): Promise<{ record: CrmRecord; timeline: TimelineEntry[] } | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("crm_contact")
    .select(`${CONTACT_COLUMNS}, engagement_history`)
    .eq("id", id)
    .eq("organization_id", organizationId())
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as ContactRow & { engagement_history: unknown };
  const [record] = await withStatuses([row]);
  return { record, timeline: readTimeline(row.engagement_history).slice().reverse() };
}

type Db = ReturnType<typeof createServiceClient>;

/**
 * Postgres keeps timestamptz to the microsecond, but JS Date only to the millisecond.
 * Compare the full value so two saves in the same millisecond still differ.
 */
export function toMicros(ts: string): bigint | null {
  const m = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(ts.trim().replace(" ", "T"));
  if (!m) return null;
  const whole = Date.parse(`${m[1]}${m[3] === undefined ? "Z" : m[3] === "Z" ? "Z" : m[3].length === 3 ? `${m[3]}:00` : m[3]}`);
  if (Number.isNaN(whole)) return null;
  const frac = (m[2] ?? "").padEnd(6, "0").slice(0, 6);
  return BigInt(whole) * 1000n + BigInt(frac);
}

export function sameVersion(a: string, b: string): boolean {
  const x = toMicros(a);
  const y = toMicros(b);
  return x !== null && x === y;
}

export type UpdateResult =
  | { ok: true; updated_date: string; changes: number }
  | { ok: false; status: 404 | 409 | 500; error: string };

/**
 * Applies a sanitized patch to one contact and appends history.
 * `expectedUpdated` gives optimistic concurrency: if someone else saved first we return 409
 * instead of silently overwriting their edit.
 */
export async function updateRecord(
  id: string,
  patch: SanitizedPatch,
  actor: string | null,
  expectedUpdated?: string,
  db: Db = createServiceClient(),
): Promise<UpdateResult> {
  const orgId = organizationId();
  const { data: current, error: readErr } = await db
    .from("crm_contact")
    .select(`${CONTACT_COLUMNS}, engagement_history`)
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { ok: false, status: 500, error: readErr.message };
  if (!current) return { ok: false, status: 404, error: "Record not found" };
  const row = current as unknown as ContactRow & { engagement_history: unknown };
  if (expectedUpdated && !sameVersion(row.updated_date, expectedUpdated)) {
    return { ok: false, status: 409, error: "This record changed since you opened it. Reload to see the latest." };
  }

  const now = new Date().toISOString();
  const before = {
    ...(row as unknown as Record<string, unknown>),
    custom: readCustomFields(row.custom_fields),
    customLabels: readCustomLabels(row.custom_fields),
  };
  const entries = historyFor(before, patch, actor, now);
  if (entries.length === 0) return { ok: true, updated_date: row.updated_date, changes: 0 };

  const update: Partial<CrmContact> = { ...patch.columns, updated_date: now };
  if (Object.keys(patch.custom).length > 0 || patch.customLabels) {
    update.custom_fields = mergeCustomFields(row.custom_fields, patch.custom, patch.customLabels) as CrmContact["custom_fields"];
  }
  update.engagement_history = appendTimeline(row.engagement_history, entries) as unknown as CrmContact["engagement_history"];
  if (patch.note) update.last_contact = now;

  // Compare-and-set on the row we read, so two concurrent saves can't both win.
  const { data: saved, error } = await db
    .from("crm_contact")
    .update(update)
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("updated_date", row.updated_date)
    .select("id, updated_date");
  if (error) return { ok: false, status: 500, error: error.message };
  if (!saved || saved.length === 0) {
    return { ok: false, status: 409, error: "This record changed while saving. Reload to see the latest." };
  }
  // Return the version the DATABASE stored. A BEFORE UPDATE trigger (set_updated_date)
  // replaces our value with now() at microsecond precision, so `now` above is never the
  // stored version. Returning it made every next save look stale (false 409s).
  return { ok: true, updated_date: String((saved[0] as { updated_date: string }).updated_date), changes: entries.length };
}
