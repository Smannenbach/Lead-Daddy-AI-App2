// Server-side CSV parsing + validation for lead import. The browser used to split
// lines on commas itself, so any text file "worked" and turned prose into leads.
// The server now owns parsing and refuses anything that isn't a real CSV.

export const NOT_CSV = "This file doesn't look like a CSV. Use a .csv file with columns like first_name, last_name, email, phone.";
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** RFC 4180 style: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const s = text.replace(/^﻿/, "");
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i += 1; continue; }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === "") { quoted = true; i += 1; continue; }
    if (ch === ",") { row.push(field); field = ""; i += 1; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      i += ch === "\r" && s[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch; i += 1;
  }
  if (quoted) return null; // unterminated quote
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const HEADER_ALIASES: Record<string, string> = {
  first_name: "first_name", firstname: "first_name", "first name": "first_name", first: "first_name",
  last_name: "last_name", lastname: "last_name", "last name": "last_name", last: "last_name",
  name: "name", "full name": "name", full_name: "name",
  email: "email", "email address": "email", e_mail: "email",
  phone: "phone", phone_number: "phone", "phone number": "phone", mobile: "phone", cell: "phone",
  company: "company", organization: "company", business: "company",
  job_title: "job_title", title: "job_title", "job title": "job_title",
};
const HEADERLESS_ORDER = ["first_name", "last_name", "email", "phone", "company", "job_title"];

export type CsvResult =
  | { ok: true; rows: Array<Record<string, string>>; hasHeader: boolean }
  | { ok: false; code: "not_csv" | "too_large" | "empty"; error: string };

export function csvToLeadRows(text: unknown, filename?: unknown): CsvResult {
  if (typeof text !== "string") return { ok: false, code: "not_csv", error: NOT_CSV };
  if (typeof filename === "string" && filename && !/\.csv$/i.test(filename.trim())) return { ok: false, code: "not_csv", error: NOT_CSV };
  if (text.length > MAX_CSV_BYTES) return { ok: false, code: "too_large", error: "That file is too big. Import up to 500 leads at a time." };
  if (/[\u0000-\u0008\u000E-\u001F]/.test(text)) return { ok: false, code: "not_csv", error: NOT_CSV }; // binary
  const grid = parseCsv(text);
  if (!grid) return { ok: false, code: "not_csv", error: NOT_CSV };
  if (grid.length === 0) return { ok: false, code: "empty", error: "That file is empty." };

  const header = grid[0].map((h) => HEADER_ALIASES[h.toLowerCase()] ?? "");
  const hasHeader = header.some((h) => h === "email" || h === "phone" || h === "first_name" || h === "name");
  if (hasHeader) {
    return {
      ok: true,
      hasHeader,
      rows: grid.slice(1).map((cells) => {
        const r: Record<string, string> = {};
        header.forEach((key, i) => {
          if (key && cells[i]) r[key] = cells[i];
        });
        if (r.name && !r.first_name) {
          const [first, ...rest] = r.name.split(/\s+/);
          r.first_name = first;
          if (rest.length && !r.last_name) r.last_name = rest.join(" ");
        }
        delete r.name;
        return r;
      }),
    };
  }

  // No header: only accept a real table (every row has at least 3 columns: name, name, email).
  if (grid.some((cells) => cells.length < 3)) return { ok: false, code: "not_csv", error: NOT_CSV };
  return {
    ok: true,
    hasHeader,
    rows: grid.map((cells) => Object.fromEntries(HEADERLESS_ORDER.map((k, i) => [k, cells[i] ?? ""]).filter(([, v]) => v))),
  };
}
