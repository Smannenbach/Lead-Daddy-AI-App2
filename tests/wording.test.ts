import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("user facing wording", () => {
  it("login placeholder is a neutral address", () => {
    const src = readFileSync("src/app/login/page.tsx", "utf8");
    expect(src).toContain('placeholder="you@company.com"');
    expect(src).not.toContain("you@loandaddy.ai");
  });
  it("default email sender name and subject say Lead Daddy", () => {
    expect(readFileSync("src/lib/channels/email.ts", "utf8")).toContain('"Lead Daddy <');
    expect(readFileSync("src/app/api/campaigns/[id]/advance/route.ts", "utf8")).toContain('"A note from Lead Daddy"');
  });
});
