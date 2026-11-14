import { describe, expect, it } from "vitest";
import { normalizePhone, PHONE_ERROR } from "@/lib/phone";
import { sanitizePatch } from "@/lib/crm/model";
import { validateImportRows } from "@/lib/leads/import";
import { validateCapture } from "@/lib/capture/validate";

describe("normalizePhone", () => {
  it.each([
    ["(602) 555-0100", "+16025550100"],
    ["602.555.0100", "+16025550100"],
    ["1 602 555 0100", "+16025550100"],
    ["+44 20 7946 0958", "+442079460958"],
    ["", null],
    [null, null],
  ])("%s -> %s", (input, out) => {
    expect(normalizePhone(input)).toEqual({ ok: true, value: out });
  });

  it.each(["abc", "555-0100", "12345", "+0123456789", "602-555-0100 ext 4", "+1234567890123456"])("rejects %s", (bad) => {
    expect(normalizePhone(bad)).toEqual({ ok: false, error: PHONE_ERROR });
  });
});

describe("every write path rejects 'abc'", () => {
  it("inline edit and record page (sanitizePatch)", () => {
    expect(sanitizePatch({ phone: "abc" }).errors).toEqual([PHONE_ERROR]);
    expect(sanitizePatch({ phone: "(602) 555-0100" }).columns.phone).toBe("+16025550100");
  });
  it("CSV import skips the row with a reason", () => {
    expect(validateImportRows([{ first_name: "A", phone: "abc" }]).skippedRows).toEqual([{ row: 1, reason: "Phone number isn't valid" }]);
  });
  it("public form", () => {
    expect(validateCapture({ name: "A", email: "a@example.com", phone: "abc" })).toEqual({ ok: false, error: "bad_phone" });
    const ok = validateCapture({ name: "A", email: "a@example.com", phone: "602 555 0100" });
    expect(ok.ok && ok.value.phone).toBe("+16025550100");
  });
});
