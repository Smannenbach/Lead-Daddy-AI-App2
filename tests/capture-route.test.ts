import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";
import { readCustomFields, readTimeline } from "@/lib/crm/model";

let db = new FakeDb();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

const { POST } = await import("@/app/api/capture/route");
let ip = 0;
const post = (body: unknown) =>
  POST(new Request("http://x/api/capture", { method: "POST", headers: { "x-forwarded-for": `10.0.0.${++ip}` }, body: JSON.stringify(body) }));

describe("POST /api/capture (public form)", () => {
  beforeEach(() => {
    db = new FakeDb();
  });

  it("(a) tells the page consent was NOT given", async () => {
    const res = await post({ name: "Foxtrot Form", email: "qa.foxtrot@example.com", consent: false });
    expect(res.status).toBe(201);
    expect((await res.json()).consent).toEqual({ given: false });
  });

  it("(a) tells the page consent WAS given", async () => {
    const res = await post({ name: "Golf", email: "qa.golf@example.com", consent: true });
    expect((await res.json()).consent).toEqual({ given: true });
  });

  it("(b) rejects a submission with no email and no phone", async () => {
    const res = await post({ name: "Only A Name" });
    expect(res.status).toBe(400);
    expect(db.table("crm_contact")).toHaveLength(0);
  });

  it("(c) stores the finance answer on the lead and (d) logs the submission in Activity", async () => {
    await post({ name: "Foxtrot Form", email: "qa.foxtrot@example.com", message: "750k SFR rental", consent: false, page_url: "https://app2.leaddaddy.ai/bfcm" });
    const [lead] = db.table("crm_contact");
    expect(readCustomFields(lead.custom_fields)).toEqual({ financing_need: "750k SFR rental" });
    const [entry] = readTimeline(lead.engagement_history);
    expect(entry.detail).toContain("Submitted the lead form (/bfcm)");
    expect(entry.detail).toContain("Consent box not checked");
    expect(entry.detail).toContain("Looking to finance: 750k SFR rental");
  });

  it("phone-only submissions now reach the CRM (QA missed: they were dropped)", async () => {
    await post({ name: "Hotel", phone: "(602) 555-0100", consent: false });
    expect(db.table("crm_contact")).toHaveLength(1);
  });

  it("a repeat submission adds Activity to the existing lead instead of a duplicate", async () => {
    await post({ name: "India", email: "qa.india@example.com", message: "first" });
    await post({ name: "India", email: "qa.india@example.com", message: "second" });
    expect(db.table("crm_contact")).toHaveLength(1);
    expect(readTimeline(db.table("crm_contact")[0].engagement_history)).toHaveLength(2);
  });
});
