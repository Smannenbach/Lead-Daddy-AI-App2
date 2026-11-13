// Lead export: every field (not just the visible columns), dates and the file name in
// the account's time zone, optional column list.
//
// Time zone: there is no account settings table, so the setting is the env var
// LEAD_DADDY_TIME_ZONE (IANA name, e.g. America/Phoenix). A request may pass ?tz=
// (the browser's own zone) which wins when valid. Fallback: America/Phoenix.
import { csvCell, displayName, type CrmRecord } from "@/lib/crm/model";

export const DEFAULT_TIME_ZONE = "America/Phoenix";

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(requested?: string | null): string {
  if (isTimeZone(requested)) return requested;
  const configured = process.env.LEAD_DADDY_TIME_ZONE;
  return isTimeZone(configured) ? configured : DEFAULT_TIME_ZONE;
}

/** "2026-11-13 19:23" in the given zone. Empty for missing or bad input. */
export function localDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function exportFileName(now: Date, tz: string): string {
  return `lead-daddy-leads-${localDateTime(now.toISOString(), tz).replace(" ", "-").replace(":", "")}.csv`;
}

type Getter = (r: CrmRecord, tz: string) => string;

export const EXPORT_COLUMNS: ReadonlyArray<{ key: string; label: string; get: Getter }> = [
  { key: "name", label: "Name", get: (r) => displayName(r) },
  { key: "first_name", label: "First name", get: (r) => r.first_name ?? "" },
  { key: "last_name", label: "Last name", get: (r) => r.last_name ?? "" },
  { key: "company", label: "Company", get: (r) => r.company ?? "" },
  { key: "job_title", label: "Title", get: (r) => r.job_title ?? "" },
  { key: "email", label: "Email", get: (r) => r.email ?? "" },
  { key: "email_status", label: "Email status", get: (r) => r.email_status },
  { key: "phone", label: "Phone", get: (r) => r.phone ?? "" },
  { key: "phone_status", label: "Phone status", get: (r) => r.phone_status },
  { key: "stage", label: "Stage", get: (r) => r.stage },
  { key: "lead_score", label: "Score", get: (r) => (r.lead_score ?? "").toString() },
  { key: "estimated_value", label: "Value", get: (r) => (r.estimated_value ?? "").toString() },
  { key: "tags", label: "Tags", get: (r) => r.tags.join(", ") },
  { key: "next_follow_up", label: "Follow up", get: (r) => (r.next_follow_up ?? "").slice(0, 10) },
  { key: "assigned_to", label: "Owner", get: (r) => r.assigned_to ?? "" },
  { key: "lead_source", label: "Source", get: (r) => r.lead_source ?? "" },
  { key: "consent", label: "Consent", get: (r) => r.consent },
  { key: "consent_method", label: "Consent method", get: (r) => r.consent_record?.method ?? "" },
  { key: "consent_at", label: "Consent recorded", get: (r, tz) => localDateTime(r.consent_record?.at, tz) },
  { key: "notes", label: "Notes", get: (r) => r.notes ?? "" },
  { key: "created_date", label: "Created", get: (r, tz) => localDateTime(r.created_date, tz) },
  { key: "updated_date", label: "Updated", get: (r, tz) => localDateTime(r.updated_date, tz) },
  { key: "id", label: "Lead ID", get: (r) => r.id },
];

export function buildExport(
  records: CrmRecord[],
  opts: { tz: string; columns?: string[] | null },
): { csv: string; columns: string[]; unknown: string[] } {
  const customKeys = [...new Set(records.flatMap((r) => Object.keys(r.custom)))].sort();
  const labels = Object.assign({}, ...records.map((r) => r.custom_labels)) as Record<string, string>;
  const all = [
    ...EXPORT_COLUMNS,
    ...customKeys.map((k) => ({
      key: `custom.${k}`,
      label: labels[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      get: ((r: CrmRecord) => r.custom[k] ?? "") as Getter,
    })),
  ];
  const wanted = opts.columns && opts.columns.length > 0 ? opts.columns : null;
  const unknown = wanted ? wanted.filter((k) => !all.some((c) => c.key === k)) : [];
  const cols = wanted ? wanted.map((k) => all.find((c) => c.key === k)).filter((c): c is (typeof all)[number] => Boolean(c)) : all;
  const header = cols.map((c) => csvCell(c.label)).join(",");
  const rows = records.map((r) => cols.map((c) => csvCell(c.get(r, opts.tz))).join(","));
  return { csv: [header, ...rows].join("\r\n"), columns: cols.map((c) => c.key), unknown };
}
