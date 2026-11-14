import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";

let db = new FakeDb();
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

const { POST } = await import("@/app/api/leads/import/route");
const post = (body: unknown) => POST(new Request("http://x/api/leads/import", { method: "POST", body: JSON.stringify(body) }));

const QA_FILE = {
  hasHeader: true,
  rows: [
    { first_name: "Bravo", last_name: "Csv", email: "qa.test.bravo@example.com" },
    { first_name: "Charlie", last_name: "Csv", email: "qa.test.charlie@example.com" },
    { first_name: "Dupe", last_name: "Csv", email: "QA.TEST.BRAVO@example.com " },
  ],
};

describe("POST /api/leads/import", () => {
  beforeEach(() => {
    db = new FakeDb();
  });

  it("QA file: 2 created, 1 skipped with row number and reason", async () => {
    const res = await post(QA_FILE);
    expect(await res.json()).toEqual({ created: 2, skipped: 1, skippedRows: [{ row: 4, reason: "Same email as row 2" }] });
    const emails = db.table("crm_contact").map((r) => r.email);
    expect(emails.filter((e) => e === "qa.test.bravo@example.com")).toHaveLength(1);
  });

  it("importing the same file again skips all 3", async () => {
    await post(QA_FILE);
    const body = await (await post(QA_FILE)).json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(3);
    expect(db.table("crm_contact")).toHaveLength(2);
  });
});

describe("POST /api/leads (Add a lead) phone check", () => {
  it("rejects abc with a plain message", async () => {
    const leads = await import("@/app/api/leads/route");
    const res = await leads.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ first_name: "A", phone: "abc" }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Enter a valid phone number, like (602) 555-0100.");
  });
});

describe("POST /api/leads/import with raw csv", () => {
  beforeEach(() => {
    db = new FakeDb();
  });
  it("rejects a .txt upload and creates nothing", async () => {
    const res = await post({ csv: "QA TEST text file\nnot a lead", filename: "qa.txt" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("not_csv");
    expect(db.table("crm_contact")).toHaveLength(0);
  });
  it("imports a real csv and reports skipped rows by file line", async () => {
    const body = await (await post({ csv: "first_name,email,phone\nEcho,echo@example.com,\nNoContact,,\n", filename: "leads.csv" })).json();
    expect(body).toEqual({ created: 1, skipped: 1, skippedRows: [{ row: 3, reason: "No email or phone" }] });
  });
});
