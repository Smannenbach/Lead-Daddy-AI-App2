import { describe, expect, it } from "vitest";
import { IMPORT_BATCH_SIZE, MAX_IMPORT_ROWS, normalizeEmail, splitDuplicates, validateImportRows } from "@/lib/leads/import";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ada@Acme.COM ")).toBe("ada@acme.com");
  });

  it("returns empty string for missing or non-string input", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(42)).toBe("");
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("validateImportRows", () => {
  it("normalizes valid rows and lowercases emails", () => {
    const { rows, skipped } = validateImportRows([
      { first_name: " Ada ", last_name: "Lovelace", email: " ADA@acme.com ", company: "Acme", job_title: "CTO", phone: " (602) 555-0100 " },
    ]);
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { rowNumber: 1, first_name: "Ada", last_name: "Lovelace", email: "ada@acme.com", phone: "+16025550100", company: "Acme", job_title: "CTO" },
    ]);
  });

  it("keeps rows with only an email (no first_name)", () => {
    const { rows, skipped } = validateImportRows([{ email: "solo@acme.com" }]);
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { rowNumber: 1, first_name: null, last_name: null, email: "solo@acme.com", phone: null, company: null, job_title: null },
    ]);
  });

  it("skips rows with only a first_name: no email and no phone (QA: text file became a lead)", () => {
    const { rows, skippedRows } = validateImportRows([{ first_name: "Madonna" }]);
    expect(rows).toEqual([]);
    expect(skippedRows).toEqual([{ row: 1, reason: "No email or phone" }]);
  });

  it("keeps a phone-only row", () => {
    const { rows } = validateImportRows([{ first_name: "Pat", phone: "602-555-0100" }]);
    expect(rows[0].phone).toBe("+16025550100");
  });

  it("skips rows with neither first_name nor email (counted, not error)", () => {
    const { rows, skipped } = validateImportRows([
      { last_name: "Nobody", company: "Ghost" },
      { email: "" },
      { first_name: "  " },
    ]);
    expect(rows).toEqual([]);
    expect(skipped).toBe(3);
  });

  it("skips non-object rows", () => {
    const { rows, skipped } = validateImportRows(["string", 42, null, ["array"], { first_name: "OK", email: "ok@example.com" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe("OK");
    expect(skipped).toBe(4);
  });

  it("ignores non-string field values by nulling them", () => {
    const { rows, skipped } = validateImportRows([{ first_name: "Ada", email: "ada@example.com", phone: 12345, company: true }]);
    expect(skipped).toBe(0);
    expect(rows[0].phone).toBeNull();
    expect(rows[0].company).toBeNull();
  });

  it("returns empty result for non-array input", () => {
    expect(validateImportRows(undefined)).toEqual({ rows: [], skipped: 0, skippedRows: [] });
    expect(validateImportRows({ rows: [] })).toEqual({ rows: [], skipped: 0, skippedRows: [] });
  });
});

describe("import constants", () => {
  it("exposes the frozen contract values", () => {
    expect(MAX_IMPORT_ROWS).toBe(500);
    expect(IMPORT_BATCH_SIZE).toBe(100);
  });
});

describe("splitDuplicates inside one file (QA: row 3 repeated row 1's email)", () => {
  it("skips the in-file repeat and names the row and reason", () => {
    const { rows } = validateImportRows(
      [
        { first_name: "Alpha", email: "qa.test.bravo@example.com" },
        { first_name: "Charlie", email: "charlie@example.com" },
        { first_name: "Dupe", email: "  QA.Test.Bravo@Example.com " },
      ],
      2,
    );
    const { fresh, duplicates, skippedRows } = splitDuplicates(rows, new Set());
    expect(fresh.map((r) => r.first_name)).toEqual(["Alpha", "Charlie"]);
    expect(duplicates).toBe(1);
    expect(skippedRows).toEqual([{ row: 4, reason: "Same email as row 2" }]);
  });

  it("still skips emails that already exist in the database", () => {
    const { rows } = validateImportRows([{ first_name: "A", email: "a@example.com" }]);
    expect(splitDuplicates(rows, new Set(["a@example.com"])).skippedRows).toEqual([{ row: 1, reason: "A lead with a@example.com already exists" }]);
  });
});
