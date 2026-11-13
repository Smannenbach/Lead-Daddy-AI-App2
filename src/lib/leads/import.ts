// Pure planning for POST /api/leads/import: row validation, email
// normalization, dedupe decisions, and batching. No network, no DB — the
// route supplies the set of emails that already exist in crm_contact.

import { normalizePhone } from "@/lib/phone";

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

export interface SkippedRow {
  /** 1-based position in the file (header counted when the caller says there is one). */
  row: number;
  reason: string;
}

/** Each kept row remembers where it came from so skips can be reported by row number. */
export interface NumberedRow extends ImportRow {
  rowNumber: number;
}

/**
 * Validate raw CSV rows. A row is kept when it has a first_name or an
 * email; rows with neither are skipped (counted, not an error), as are
 * non-object rows. Non-string field values become null. Unknown extra
 * fields are dropped. Non-array input yields an empty result.
 * `firstRowNumber` is the file line of input[0] (2 when the file has a header).
 */
export function validateImportRows(
  input: unknown,
  firstRowNumber = 1,
): { rows: NumberedRow[]; skipped: number; skippedRows: SkippedRow[] } {
  if (!Array.isArray(input)) return { rows: [], skipped: 0, skippedRows: [] };
  const rows: NumberedRow[] = [];
  const skippedRows: SkippedRow[] = [];
  input.forEach((raw, i) => {
    const rowNumber = firstRowNumber + i;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      skippedRows.push({ row: rowNumber, reason: "Row could not be read" });
      return;
    }
    const r = raw as Record<string, unknown>;
    const firstName = asTrimmedString(r.first_name);
    const email = normalizeEmail(r.email) || null;
    if (!firstName && !email) {
      skippedRows.push({ row: rowNumber, reason: "Missing a first name and an email" });
      return;
    }
    const phone = normalizePhone(asTrimmedString(r.phone));
    if (!phone.ok) {
      skippedRows.push({ row: rowNumber, reason: "Phone number isn't valid" });
      return;
    }
    rows.push({
      rowNumber,
      first_name: firstName,
      last_name: asTrimmedString(r.last_name),
      email,
      phone: phone.value,
      company: asTrimmedString(r.company),
      job_title: asTrimmedString(r.job_title),
    });
  });
  return { rows, skipped: skippedRows.length, skippedRows };
}

export interface DedupeSplit<T extends ImportRow = ImportRow> {
  /** Rows to insert, in input order. */
  fresh: T[];
  /** How many rows were dropped because their email already exists or repeats in the file. */
  duplicates: number;
  skippedRows: SkippedRow[];
}

/**
 * Split validated rows against the normalized emails that already exist in
 * crm_contact (same org, not deleted) AND against earlier rows of the same
 * file. Rows without an email can never be duplicates and always stay.
 */
export function splitDuplicates<T extends ImportRow>(rows: T[], existingEmails: ReadonlySet<string>): DedupeSplit<T> {
  const fresh: T[] = [];
  const skippedRows: SkippedRow[] = [];
  const firstSeenAt = new Map<string, number>();
  rows.forEach((row, i) => {
    const rowNumber = (row as Partial<NumberedRow>).rowNumber ?? i + 1;
    const email = row.email ? normalizeEmail(row.email) : "";
    if (email && existingEmails.has(email)) {
      skippedRows.push({ row: rowNumber, reason: `A lead with ${email} already exists` });
      return;
    }
    if (email && firstSeenAt.has(email)) {
      skippedRows.push({ row: rowNumber, reason: `Same email as row ${firstSeenAt.get(email)}` });
      return;
    }
    if (email) firstSeenAt.set(email, rowNumber);
    fresh.push(row);
  });
  return { fresh, duplicates: skippedRows.length, skippedRows };
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
