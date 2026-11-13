import { describe, expect, it } from "vitest";
import { NOT_CSV, csvToLeadRows, parseCsv } from "@/lib/leads/csv";
import { validateImportRows } from "@/lib/leads/import";

describe("parseCsv", () => {
  it("handles quotes, embedded commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
  it("returns null for an unterminated quote", () => {
    expect(parseCsv('a,"b')).toBeNull();
  });
});

describe("csvToLeadRows", () => {
  it("reads a header file and maps common column names", () => {
    const r = csvToLeadRows("Full Name,Email Address,Mobile\nDelta NoHeader,delta@example.com,602-555-0100", "leads.csv");
    expect(r).toEqual({ ok: true, hasHeader: true, rows: [{ first_name: "Delta", last_name: "NoHeader", email: "delta@example.com", phone: "602-555-0100" }] });
  });

  it("rejects a plain .txt file by name (QA)", () => {
    expect(csvToLeadRows("Hello there,\nthis is just a note.", "notes.txt")).toEqual({ ok: false, code: "not_csv", error: NOT_CSV });
  });

  it("rejects prose even when renamed to .csv", () => {
    expect(csvToLeadRows("This is a text file about our meeting.\nNothing here is a lead.", "notes.csv")).toMatchObject({ ok: false, code: "not_csv" });
  });

  it("rejects binary content", () => {
    expect(csvToLeadRows("PK\u0003\u0004binary", "x.csv")).toMatchObject({ ok: false, code: "not_csv" });
  });

  it("headerless prose with commas still can't create a junk lead (no email or phone)", () => {
    const r = csvToLeadRows("well, this, is, prose", "x.csv");
    expect(r.ok).toBe(true);
    if (r.ok) expect(validateImportRows(r.rows).rows).toEqual([]);
  });
});
