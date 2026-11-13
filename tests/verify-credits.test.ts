import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "./fakes/db";

let db = new FakeDb();
const verifyCalls: unknown[] = [];
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/verify/contact-points", () => ({
  verifyContactPoints: vi.fn(async (t: Array<{ kind: "email" | "phone"; value: string }>) => {
    verifyCalls.push(t);
    return t.map((x) => ({ ...x, provider: x.kind === "email" ? "reoon" : "realvalidito", result: "valid", error: x.kind === "phone" ? "HTTP 500 from upstream" : undefined }));
  }),
}));
process.env.LEADDADDY_ORGANIZATION_ID = "org-test";
process.env.REOON_API_KEY = "test";
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ remaining_daily_credits: 40, remaining_instant_credits: 2, status: "success" })));
vi.stubGlobal("fetch", fetchMock);

const { POST } = await import("@/app/api/leads/[id]/verify/route");
const run = (id: string, q = "") => POST(new Request(`http://x/api/leads/${id}/verify${q}`, { method: "POST" }), { params: Promise.resolve({ id }) });

describe("verify credits", () => {
  beforeEach(() => {
    db = new FakeDb();
    verifyCalls.length = 0;
    fetchMock.mockClear();
  });

  it("dry run returns the checks and spends nothing", async () => {
    const lead = db.seed("crm_contact", { organization_id: "org-test", first_name: "A", email: "a@example.com", phone: "+16025550100", engagement_history: [] });
    process.env.VERIFY_EMAIL_CREDITS = "1";
    const body = await (await run(lead.id as string, "?dryRun=true")).json();
    expect(body).toMatchObject({ dryRun: true, cost: { emailChecks: 1, phoneChecks: 1, estimatedCredits: null }, emailCreditsRemaining: 42 });
    expect(verifyCalls).toEqual([]); // no provider call
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("check-account-balance"); // the only call: the free balance check
    delete process.env.VERIFY_EMAIL_CREDITS;
  });

  it("a real run reports credits remaining, plain messages, and no raw provider errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const lead = db.seed("crm_contact", { organization_id: "org-test", first_name: "A", email: "a@example.com", phone: "+16025550100", engagement_history: [] });
    const body = await (await run(lead.id as string)).json();
    expect(body.emailCreditsRemaining).toBe(42);
    expect(body.results.map((r: { message: string }) => r.message)).toEqual(["Email is valid.", "Phone is valid."]);
    expect(JSON.stringify(body)).not.toContain("HTTP 500");
    spy.mockRestore();
  });
});
