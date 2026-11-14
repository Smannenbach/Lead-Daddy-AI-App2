import { describe, expect, it } from "vitest";
import { describeChange, historyFor, readTimeline, sanitizePatch } from "@/lib/crm/model";
import { verificationActivity } from "@/lib/verify/activity";
import { FakeDb } from "./fakes/db";
import { logVerification } from "@/lib/verify/activity";

process.env.LEADDADDY_ORGANIZATION_ID = "org-test";

describe("Activity wording (QA: 'first_name set to' with no value)", () => {
  it("uses a plain label and shows the value", () => {
    const h = historyFor({ first_name: "Mikey" }, sanitizePatch({ first_name: "Mike" }), "qa@example.com", "2026-11-13T00:00:00Z");
    expect(h[0].detail).toBe("First name set to Mike");
  });
  it.each([
    ["last_name", "Smith", "Last name set to Smith"],
    ["lead_score", 80, "Score set to 80"],
    ["estimated_value", 250000, "Estimated value set to $250,000"],
    ["tags", ["hot", "dscr"], "Tags set to hot, dscr"],
    ["phone", null, "Phone cleared"],
    ["next_follow_up", "2026-12-01T00:00:00Z", "Follow up date set to 2026-12-01"],
  ])("%s", (key, value, text) => {
    expect(describeChange(key, value)).toBe(text);
  });
});

describe("verify runs show in Activity", () => {
  it("has plain text and no provider names", () => {
    const [e] = verificationActivity([{ kind: "email", value: "a@example.com", provider: "reoon", result: "invalid" }], "qa@example.com", "t");
    expect(e).toMatchObject({ type: "verified", detail: "Email a@example.com checked: not valid" });
    expect(e.detail).not.toMatch(/reoon|realvalidito/i);
  });
  it("appends to the lead's timeline", async () => {
    const db = new FakeDb();
    const row = db.seed("crm_contact", { organization_id: "org-test", first_name: "A", engagement_history: [] });
    await logVerification(row.id as string, [{ kind: "phone", value: "+16025550100", provider: "realvalidito", result: "valid" }], "qa@example.com", db as never);
    expect(readTimeline(row.engagement_history)[0].detail).toBe("Phone +16025550100 checked: valid");
  });
});
