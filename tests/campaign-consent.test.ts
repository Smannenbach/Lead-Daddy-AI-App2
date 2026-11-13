import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";
import { PRESET_VIEWS, applyView, toRecord, type ContactRow } from "@/lib/crm/model";
import { previewSkips, skipReason } from "@/lib/campaigns/sequences";

let db = new FakeDb();
const sent: string[] = [];
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/channels/twilio", () => ({ sendSms: vi.fn(async (to: string) => { sent.push(`sms:${to}`); return {}; }), startCall: vi.fn() }));
vi.mock("@/lib/channels/email", () => ({ sendEmail: vi.fn(async (o: { to: string }) => { sent.push(`email:${o.to}`); return { id: "x", provider: "resend" }; }) }));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

const campaigns = await import("@/app/api/campaigns/route");
const preview = await import("@/app/api/campaigns/[id]/preview/route");
const req = (method: string, body?: unknown) => new Request("http://x/api/campaigns", { method, body: body ? JSON.stringify(body) : undefined });

function seedLead(name: string, consent: "granted" | "none", email: string, phone: string) {
  const r = db.seed("crm_contact", { organization_id: "org-test", first_name: name, email, phone, stage: "New", custom_fields: { tcpa_consent: consent } });
  db.seed("email_verification", { organization_id: "org-test", email, verification_status: "valid", verification_date: "2026-11-01T00:00:00Z" });
  db.seed("phone_verification", { organization_id: "org-test", phone_number: phone, verification_status: "valid", verification_date: "2026-11-01T00:00:00Z" });
  return r.id as string;
}

describe("campaign consent", () => {
  beforeEach(() => {
    db = new FakeDb();
    sent.length = 0;
  });

  it("new campaigns default to email only", async () => {
    const res = await campaigns.POST(req("POST", { name: "QA TEST Campaign" }));
    expect(res.status).toBe(201);
    expect((db.table("marketing_campaign")[0].target_audience as { channelSeq: string[] }).channelSeq).toEqual(["email"]);
  });

  it("preview lists who would be skipped and why, before launch", async () => {
    const yes = seedLead("Yes", "granted", "yes@example.com", "+16025550101");
    const no = seedLead("No", "none", "no@example.com", "+16025550102");
    const c = db.seed("marketing_campaign", { organization_id: "org-test", name: "QA", status: "draft", target_audience: { leadIds: [yes, no], channelSeq: ["email", "sms"] } });
    const body = await (await preview.GET(new Request("http://x"), { params: Promise.resolve({ id: c.id as string }) })).json();
    expect(body.willReach).toBe(2); // both get email
    expect(body.skipped).toEqual([{ leadId: no, name: "No", channel: "sms", reason: "No consent on file for texts or calls" }]);
  });

  it("launch is blocked until the user accepts the consent skips", async () => {
    const no = seedLead("No", "none", "no@example.com", "+16025550102");
    const c = db.seed("marketing_campaign", { organization_id: "org-test", name: "QA", status: "draft", target_audience: { leadIds: [no], channelSeq: ["email", "sms"] } });
    const first = await campaigns.PATCH(req("PATCH", { action: "launch", campaignId: c.id }));
    expect(first.status).toBe(409);
    expect((await first.json()).code).toBe("recipients_will_be_skipped");
    expect(db.table("marketing_campaign")[0].status).toBe("draft");
    expect(sent).toEqual([]); // launch never sends anything itself
  });

  it("every send step still skips sms and call without consent", () => {
    for (const channel of ["sms", "call"] as const) {
      expect(skipReason({ channel, tcpaConsent: false, emailStatus: "valid", phoneStatus: "valid" })).toBe("skipped_no_consent");
    }
    expect(previewSkips(["call"], [{ id: "1", name: "A", tcpaConsent: false, emailStatus: "valid", phoneStatus: "valid" }]).willReach).toBe(0);
  });

  it("direct text send refuses a lead without consent and never takes a free-form number", async () => {
    const no = seedLead("No", "none", "no@example.com", "+16025550102");
    const res = await campaigns.PUT(req("PUT", { channel: "sms", leadId: no, text: "hi", to: "+19995550000" }));
    expect(res.status).toBe(403);
    const noLead = await campaigns.PUT(req("PUT", { channel: "sms", to: "+19995550000", text: "hi" }));
    expect(noLead.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("Ready to contact view requires consent", () => {
    const ready = PRESET_VIEWS.find((v) => v.id === "ready")!;
    const base = { first_name: "A", last_name: null, company: null, job_title: null, email: "a@example.com", phone: null, stage: "New", lead_score: null, estimated_value: null, tags: [], next_follow_up: null, assigned_to: null, lead_source: null, notes: null, created_date: "", updated_date: "" };
    const withConsent = toRecord({ ...base, id: "1", custom_fields: { tcpa_consent: "granted" } } as ContactRow, "valid");
    const without = toRecord({ ...base, id: "2", custom_fields: {} } as ContactRow, "valid");
    expect(applyView([withConsent, without], ready).map((r) => r.id)).toEqual(["1"]);
  });
});
