import { describe, expect, it } from "vitest";
import { IMPORT_BATCH_SIZE, MAX_IMPORT_ROWS, normalizeEmail, validateImportRows } from "@/lib/leads/import";

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
      { first_name: " Ada ", last_name: "Lovelace", email: " ADA@acme.com ", company: "Acme", job_title: "CTO", phone: " +1 555 " },
    ]);
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { first_name: "Ada", last_name: "Lovelace", email: "ada@acme.com", phone: "+1 555", company: "Acme", job_title: "CTO" },
    ]);
  });

  it("keeps rows with only an email (no first_name)", () => {
    const { rows, skipped } = validateImportRows([{ email: "solo@acme.com" }]);
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { first_name: null, last_name: null, email: "solo@acme.com", phone: null, company: null, job_title: null },
    ]);
  });

  it("keeps rows with only a first_name (no email)", () => {
    const { rows, skipped } = validateImportRows([{ first_name: "Madonna" }]);
    expect(skipped).toBe(0);
    expect(rows[0].first_name).toBe("Madonna");
    expect(rows[0].email).toBeNull();
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
    const { rows, skipped } = validateImportRows(["string", 42, null, ["array"], { first_name: "OK" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe("OK");
    expect(skipped).toBe(4);
  });

  it("ignores non-string field values by nulling them", () => {
    const { rows, skipped } = validateImportRows([{ first_name: "Ada", phone: 12345, company: true }]);
    expect(skipped).toBe(0);
    expect(rows[0].phone).toBeNull();
    expect(rows[0].company).toBeNull();
  });

  it("returns empty result for non-array input", () => {
    expect(validateImportRows(undefined)).toEqual({ rows: [], skipped: 0 });
    expect(validateImportRows({ rows: [] })).toEqual({ rows: [], skipped: 0 });
  });
});

describe("import constants", () => {
  it("exposes the frozen contract values", () => {
    expect(MAX_IMPORT_ROWS).toBe(500);
    expect(IMPORT_BATCH_SIZE).toBe(100);
  });
});
