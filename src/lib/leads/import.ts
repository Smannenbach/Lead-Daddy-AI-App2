// Pure planning for POST /api/leads/import: row validation, email
// normalization, dedupe decisions, and batching. No network, no DB — the
// route supplies the set of emails that already exist in crm_contact.

export const MAX_IMPORT_ROWS = 500;
export const IMPORT_BATCH_SIZE = 100;
export const CSV_LEAD_SOURCE = "csv-import";

export interface ImportRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
}

/** trim + lowercase; "" for missing, non-string, or blank input. */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Validate raw CSV rows. A row is kept when it has a first_name or an
 * email; rows with neither are skipped (counted, not an error), as are
 * non-object rows. Non-string field values become null. Unknown extra
 * fields are dropped. Non-array input yields an empty result.
 */
export function validateImportRows(input: unknown): { rows: ImportRow[]; skipped: number } {
  if (!Array.isArray(input)) return { rows: [], skipped: 0 };
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      skipped++;
      continue;
    }
    const r = raw as Record<string, unknown>;
    const firstName = asTrimmedString(r.first_name);
    const email = normalizeEmail(r.email) || null;
    if (!firstName && !email) {
      skipped++;
      continue;
    }
    rows.push({
      first_name: firstName,
      last_name: asTrimmedString(r.last_name),
      email,
      phone: asTrimmedString(r.phone),
      company: asTrimmedString(r.company),
      job_title: asTrimmedString(r.job_title),
    });
  }
  return { rows, skipped };
}

export interface DedupeSplit {
  /** Rows to insert, in input order. */
  fresh: ImportRow[];
  /** How many rows were dropped because their email already exists. */
  duplicates: number;
}

/**
 * Split validated rows against the normalized emails that already exist in
 * crm_contact (same org, not deleted). Rows without an email can never be
 * duplicates and always stay.
 */
export function splitDuplicates(rows: ImportRow[], existingEmails: ReadonlySet<string>): DedupeSplit {
  const fresh: ImportRow[] = [];
  let duplicates = 0;
  for (const row of rows) {
    if (row.email && existingEmails.has(row.email)) {
      duplicates++;
      continue;
    }
    fresh.push(row);
  }
  return { fresh, duplicates };
}

/** Normalized emails worth checking against the DB (unique, non-null). */
export function candidateEmails(rows: ImportRow[]): string[] {
  return [...new Set(rows.map((r) => r.email).filter((e): e is string => e !== null))];
}

/** Split a list into fixed-size batches (insert batches of 100). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
