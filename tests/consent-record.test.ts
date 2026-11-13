import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";
import { CONSENT_WORDING, readConsentRecord, revokeConsent } from "@/lib/consent";
import { sanitizePatch, toRecord, type ContactRow } from "@/lib/crm/model";

let db = new FakeDb();
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "rep@example.com" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

const capture = await import("@/app/api/capture/route");
const leads = await import("@/app/api/leads/route");

describe("consent record", () => {
  beforeEach(() => {
    db = new FakeDb();
  });

  it("stored wording matches the live checkbox text exactly", () => {
    const page = readFileSync("src/app/bfcm/page.tsx", "utf8").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(page).toContain(CONSENT_WORDING["bfcm-form-2026-11"]);
    const consolePage = readFileSync("src/app/page.tsx", "utf8");
    expect(consolePage).toContain(CONSENT_WORDING["console-add-lead-2026-11"]);
  });

  it("public form records method, source, wording version and time", async () => {
    await capture.POST(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "10.9.9.1" }, body: JSON.stringify({ name: "Q", email: "q@example.com", phone: "602-555-0100", consent: true, page_url: "https://app2.leaddaddy.ai/bfcm" }) }));
    const rec = readConsentRecord(db.table("crm_contact")[0].custom_fields)!;
    expect(rec).toMatchObject({ status: "granted", method: "web_form", source: "https://app2.leaddaddy.ai/bfcm", wording_version: "bfcm-form-2026-11", captured_by: null });
    expect(Date.parse(rec.at)).not.toBeNaN();
  });

  it("a rep ticking the box is recorded as rep attested, with who did it", async () => {
    await leads.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ first_name: "R", email: "r@example.com", tcpaConsent: true }) }));
    expect(readConsentRecord(db.table("crm_contact")[0].custom_fields)).toMatchObject({ method: "rep_attested", captured_by: "rep@example.com", source: "console:add-lead" });
  });

  it("existing leads are not back filled", () => {
    const row = { id: "1", custom_fields: { tcpa_consent: "granted" } } as unknown as ContactRow;
    expect(toRecord(row).consent_record).toBeNull();
    expect(toRecord(row).consent).toBe("granted");
  });

  it("a STOP reply keeps how consent was first given and adds revoked_at", () => {
    const first = { status: "granted", method: "web_form", source: "/bfcm", wording_version: "bfcm-form-2026-11", wording_text: "x", at: "2026-11-01T00:00:00Z", captured_by: null };
    expect(revokeConsent(first, "2026-11-13T00:00:00Z", "sms:STOP")).toMatchObject({ status: "revoked", method: "web_form", at: "2026-11-01T00:00:00Z", revoked_at: "2026-11-13T00:00:00Z" });
  });

  it("the consent record can't be edited through the CRM", () => {
    expect(sanitizePatch({ custom: { consent_record: "granted" } }).errors.length).toBe(1);
  });
});
