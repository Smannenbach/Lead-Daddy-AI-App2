import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";
import { readTimeline } from "@/lib/crm/model";

let db = new FakeDb();
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

const record = await import("@/app/api/crm/records/[id]/route");
const bulk = await import("@/app/api/crm/bulk/route");
const merge = await import("@/app/api/crm/merge/route");
const notes = await import("@/app/api/crm/records/[id]/notes/[noteId]/route");
const campaign = await import("@/app/api/campaigns/[id]/route");
const campaigns = await import("@/app/api/campaigns/route");
const { listRecords } = await import("@/lib/crm/server");

const lead = (extra: Record<string, unknown> = {}) =>
  db.seed("crm_contact", { organization_id: "org-test", first_name: "QA TEST", stage: "New", custom_fields: {}, engagement_history: [], tags: [], ...extra });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const json = (method: string, body?: unknown, url = "http://x") => new Request(url, { method, body: body ? JSON.stringify(body) : undefined });

describe("delete leads", () => {
  beforeEach(() => {
    db = new FakeDb();
  });

  it("soft delete: drops out of lists, campaign recipients; writes Activity and audit", async () => {
    const a = lead({ email: "a@example.com" });
    const b = lead({ email: "b@example.com" });
    const c = db.seed("marketing_campaign", { organization_id: "org-test", name: "QA TEST Campaign", status: "draft", target_audience: { leadIds: [a.id, b.id] } });
    const res = await record.DELETE(json("DELETE"), params({ id: a.id as string }));
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    expect(a.deleted_at).toBeTruthy();
    expect(readTimeline(a.engagement_history).at(-1)?.detail).toBe("Lead deleted");
    expect((await listRecords()).records.map((r) => r.id)).toEqual([b.id]);
    expect((c.target_audience as { leadIds: string[] }).leadIds).toEqual([b.id]);
    expect(db.table("lead_event").map((e) => e.event_type)).toContain("lead_deleted");
  });

  it("bulk delete", async () => {
    const ids = [lead().id, lead().id, lead().id] as string[];
    const res = await bulk.POST(json("POST", { ids, action: "delete" }));
    expect(await res.json()).toEqual({ deleted: 3, notFound: 0 });
  });

  it("purge needs explicit confirmation, then removes the person's data", async () => {
    const a = lead({ email: "p@example.com", phone: "+16025550100" });
    db.seed("email_verification", { organization_id: "org-test", email: "p@example.com" });
    db.seed("phone_verification", { organization_id: "org-test", phone_number: "+16025550100" });
    db.seed("unified_lead", { organization_id: "org-test", email: "p@example.com" });
    const url = "http://x/api/crm/records/id?purge=true";
    expect((await record.DELETE(json("DELETE", {}, url), params({ id: a.id as string }))).status).toBe(400);
    expect(db.table("crm_contact")).toHaveLength(1);
    const res = await record.DELETE(json("DELETE", { confirm: "PURGE" }, url), params({ id: a.id as string }));
    expect(res.status).toBe(200);
    expect(db.table("crm_contact")).toHaveLength(0);
    expect(db.table("email_verification")).toHaveLength(0);
    expect(db.table("phone_verification")).toHaveLength(0);
    expect(db.table("unified_lead")).toHaveLength(0);
    const auditRow = db.table("lead_event").find((e) => e.event_type === "lead_purged")!;
    expect(JSON.stringify(auditRow)).not.toContain("p@example.com"); // no personal data kept
  });

  it("merge keeps the primary, fills gaps, combines tags and Activity, never copies consent", async () => {
    const keep = lead({ email: "keep@example.com", tags: ["a"], custom_fields: { tcpa_consent: "none" }, engagement_history: [{ type: "note", at: "2026-11-01T00:00:00Z", by: null, detail: "first" }] });
    const dup = lead({ email: "dup@example.com", phone: "+16025550100", company: "Acme", tags: ["b"], custom_fields: { tcpa_consent: "granted", crm_fields: { loan: "DSCR" } }, engagement_history: [{ type: "note", at: "2026-11-02T00:00:00Z", by: null, detail: "second" }] });
    const c = db.seed("marketing_campaign", { organization_id: "org-test", name: "C", status: "draft", target_audience: { leadIds: [dup.id] } });
    const res = await merge.POST(json("POST", { primaryId: keep.id, duplicateIds: [dup.id] }));
    expect((await res.json()).merged).toEqual([dup.id]);
    expect(keep).toMatchObject({ email: "keep@example.com", phone: "+16025550100", company: "Acme", tags: ["a", "b"] });
    expect((keep.custom_fields as Record<string, unknown>).tcpa_consent).toBe("none");
    expect(readTimeline(keep.engagement_history).map((e) => e.detail)).toEqual(["first", "second", "Merged in QA TEST"]);
    expect(dup.deleted_at).toBeTruthy();
    expect((c.target_audience as { leadIds: string[] }).leadIds).toEqual([keep.id]);
  });
});

describe("delete notes and campaigns", () => {
  beforeEach(() => {
    db = new FakeDb();
  });

  it("deletes a note by id and logs it; system Activity can't be deleted", async () => {
    const a = lead({ engagement_history: [{ type: "note", at: "2026-11-01T00:00:00Z", by: "qa@example.com", detail: "QA TEST note" }, { type: "stage_changed", at: "2026-11-02T00:00:00Z", by: null, detail: "Stage: new → won" }] });
    const [note, system] = readTimeline(a.engagement_history);
    expect((await notes.DELETE(json("DELETE"), params({ id: a.id as string, noteId: system.id! }))).status).toBe(400);
    const res = await notes.DELETE(json("DELETE"), params({ id: a.id as string, noteId: note.id! }));
    expect(res.status).toBe(200);
    expect(readTimeline(a.engagement_history).map((e) => e.detail)).toEqual(["Stage: new → won", "A note was deleted"]);
  });

  it("deleting a campaign hides it and stops it", async () => {
    const c = db.seed("marketing_campaign", { organization_id: "org-test", name: "QA TEST Campaign", status: "live", target_audience: { leadIds: [] } });
    expect((await campaign.DELETE(json("DELETE"), params({ id: c.id as string }))).status).toBe(200);
    expect(c.status).toBe("deleted");
    expect((await (await campaigns.GET()).json()).campaigns).toEqual([]);
  });
});

describe("bulk add tag", () => {
  beforeEach(() => {
    db = new FakeDb();
  });
  it("adds a tag and keeps existing tags", async () => {
    const a = lead({ tags: ["hot"] });
    const b = lead({ tags: [] });
    const res = await bulk.POST(json("POST", { ids: [a.id, b.id], action: "add_tags", tags: ["bfcm"] }));
    expect(await res.json()).toEqual({ updated: 2, failed: [] });
    expect(a.tags).toEqual(["hot", "bfcm"]);
    expect(b.tags).toEqual(["bfcm"]);
  });
});
