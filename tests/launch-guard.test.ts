import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";

let db = new FakeDb();
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/channels/twilio", () => ({ sendSms: vi.fn(), startCall: vi.fn() }));
vi.mock("@/lib/channels/email", () => ({ sendEmail: vi.fn() }));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";
const { PATCH } = await import("@/app/api/campaigns/route");

const launch = async (status: string, leadIds: string[]) => {
  const c = db.seed("marketing_campaign", { organization_id: "org-test", name: "QA TEST Campaign", status, target_audience: { leadIds } });
  const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ action: "launch", campaignId: c.id }) }));
  return { res, body: await res.json(), c };
};

describe("launch guard", () => {
  beforeEach(() => {
    db = new FakeDb();
  });
  it("rejects 0 recipients", async () => {
    const { res, body } = await launch("draft", []);
    expect(res.status).toBe(400);
    expect(body.code).toBe("no_recipients");
  });
  it.each(["live", "active", "Active"])("rejects a campaign that is already %s", async (status) => {
    const { res, body, c } = await launch(status, ["x"]);
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ code: "already_running", error: "This campaign is already running." });
    expect(c.status).toBe(status); // unchanged
  });
  it("rejects completed and deleted campaigns", async () => {
    expect((await launch("completed", ["x"])).body.code).toBe("not_launchable");
    expect((await launch("deleted", ["x"])).body.code).toBe("not_launchable");
  });
});
