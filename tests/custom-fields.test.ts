import { describe, expect, it } from "vitest";
import { FakeDb } from "./fakes/db";
import { keyFromLabel, readCustomFields, readCustomLabels, sanitizePatch, toRecord, type ContactRow } from "@/lib/crm/model";
import { updateRecord } from "@/lib/crm/server";

process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

describe("custom field names", () => {
  it("rejects a raw key that breaks the rule (QA: 'QA Test Bad Name!!')", () => {
    const p = sanitizePatch({ custom: { "QA Test Bad Name!!": "x" } });
    expect(p.errors).toEqual([`"QA Test Bad Name!!" isn't a valid field name. Use letters, numbers or underscores, starting with a letter.`]);
    expect(p.custom).toEqual({});
  });

  it("add_field: server makes the key, label is kept exactly as typed", () => {
    const p = sanitizePatch({ add_field: { label: "QA Test Bad Name!!", value: "yes" } });
    expect(p.errors).toEqual([]);
    expect(p.custom).toEqual({ qa_test_bad_name: "yes" });
    expect(p.customLabels).toEqual({ qa_test_bad_name: "QA Test Bad Name!!" });
  });

  it("rejects names with no letters, reserved names and markup", () => {
    expect(keyFromLabel("!!!")).toBeNull();
    expect(sanitizePatch({ add_field: { label: "123", value: "x" } }).errors).toEqual(["Field names need to start with a letter."]);
    expect(sanitizePatch({ add_field: { label: "Consent Record", value: "x" } }).errors).toEqual(["Field names need to start with a letter."]);
    expect(sanitizePatch({ add_field: { label: "<b>x</b>", value: "x" } }).errors[0]).toMatch(/can't contain/);
  });

  it("stores and returns the label next to the value, and Remove drops both", async () => {
    const db = new FakeDb();
    const row = db.seed("crm_contact", { organization_id: "org-test", first_name: "A", custom_fields: { tcpa_consent: "granted" }, engagement_history: [] });
    const asDb = db as unknown as Parameters<typeof updateRecord>[4];
    await updateRecord(row.id as string, sanitizePatch({ add_field: { label: "Loan Type", value: "DSCR" } }), "qa@example.com", undefined, asDb);
    const saved = db.table("crm_contact")[0];
    expect(readCustomFields(saved.custom_fields)).toEqual({ loan_type: "DSCR" });
    expect(toRecord(saved as unknown as ContactRow).custom_labels).toEqual({ loan_type: "Loan Type" });
    expect((saved.custom_fields as Record<string, unknown>).tcpa_consent).toBe("granted"); // untouched

    await updateRecord(row.id as string, sanitizePatch({ custom: { loan_type: "" } }), "qa@example.com", undefined, asDb);
    expect(readCustomLabels(db.table("crm_contact")[0].custom_fields)).toEqual({});
  });
});
