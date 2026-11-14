import { describe, expect, it } from "vitest";
import { FakeDb } from "./fakes/db";
import { sameVersion, toMicros, updateRecord } from "@/lib/crm/server";
import { sanitizePatch } from "@/lib/crm/model";

process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

function setup() {
  const db = new FakeDb();
  const row = db.seed("crm_contact", { organization_id: "org-test", first_name: "Mike", stage: "New", custom_fields: {}, engagement_history: [] });
  return { db, id: row.id as string, version: row.updated_date as string };
}
const asDb = (db: FakeDb) => db as unknown as Parameters<typeof updateRecord>[4];

describe("version comparison", () => {
  it("keeps microseconds", () => {
    expect(toMicros("2026-11-13T02:00:00.123456+00:00")).toBe(toMicros("2026-11-13T02:00:00.123456Z"));
    expect(sameVersion("2026-11-13T02:00:00.123456+00:00", "2026-11-13T02:00:00.123457+00:00")).toBe(false);
    expect(sameVersion("2026-11-13T02:00:00.123+00:00", "2026-11-13T02:00:00.123000Z")).toBe(true);
  });
});

describe("updateRecord optimistic concurrency", () => {
  it("6 edits in a row with no reload all save", async () => {
    const { db, id } = setup();
    let version = (db.table("crm_contact")[0].updated_date as string);
    const edits = [{ company: "Acme" }, { job_title: "Owner" }, { stage: "qualified" }, { lead_score: 80 }, { estimated_value: 5000 }, { assigned_to: "Myke" }];
    for (const e of edits) {
      const r = await updateRecord(id, sanitizePatch(e), "qa@example.com", version, asDb(db));
      expect(r.ok).toBe(true);
      if (r.ok) version = r.updated_date; // what the UI does with the response
    }
    const saved = db.table("crm_contact")[0];
    expect(saved.stage).toBe("Qualified");
    expect(version).toBe(saved.updated_date); // response matches the stored version exactly
  });

  it("a truly stale edit is still rejected", async () => {
    const { db, id, version } = setup();
    const first = await updateRecord(id, sanitizePatch({ company: "Acme" }), "a@example.com", version, asDb(db));
    expect(first.ok).toBe(true);
    const stale = await updateRecord(id, sanitizePatch({ company: "Other" }), "b@example.com", version, asDb(db));
    expect(stale).toMatchObject({ ok: false, status: 409 });
    expect(db.table("crm_contact")[0].company).toBe("Acme");
  });
});
