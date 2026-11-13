import { describe, expect, it } from "vitest";
import { sanitizePatch } from "@/lib/crm/model";
import { validateImportRows } from "@/lib/leads/import";
import { validateCapture } from "@/lib/capture/validate";
import { LIMITS } from "@/lib/leads/limits";

const long = (n: number) => "x".repeat(n);

describe("length limits", () => {
  it("rejects a 400 character Company instead of saving it (QA)", () => {
    const p = sanitizePatch({ company: long(400) });
    expect(p.errors).toEqual(["Company can be up to 200 characters."]);
    expect(p.columns.company).toBeUndefined();
  });
  it("accepts a value exactly at the limit", () => {
    expect(sanitizePatch({ company: long(LIMITS.company) }).errors).toEqual([]);
  });
  it("CSV import skips over-long rows with the reason", () => {
    expect(validateImportRows([{ first_name: "A", email: "a@example.com", company: long(201) }]).skippedRows).toEqual([{ row: 1, reason: "Company can be up to 200 characters." }]);
  });
  it("public form rejects over-long input", () => {
    expect(validateCapture({ name: "A", email: "a@example.com", company: long(201) })).toEqual({ ok: false, error: "too_long" });
  });
  it("notes and custom values have limits too", () => {
    expect(sanitizePatch({ note: long(4001) }).errors).toEqual(["Note can be up to 4000 characters."]);
    expect(sanitizePatch({ custom: { budget: long(501) } }).errors).toEqual(["Custom field value can be up to 500 characters."]);
  });
});
