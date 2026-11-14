import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth-helpers/redirect";

describe("login page never creates accounts", () => {
  it("magic link uses shouldCreateUser: false", () => {
    expect(readFileSync("src/app/login/page.tsx", "utf8")).toContain("shouldCreateUser: false");
  });
  it("magic link and reset show the same message whether or not the email exists", () => {
    const src = readFileSync("src/app/login/page.tsx", "utf8");
    expect(src).toContain("If that email has a Lead Daddy account");
    expect(src).not.toMatch(/setError\(error\.message\)/); // no raw auth errors that reveal accounts
  });
});

describe("auth callback redirect", () => {
  it.each([
    ["/reset-password", "/reset-password"],
    [null, "/"],
    ["https://evil.example.com", "/"],
    ["//evil.example.com", "/"],
    ["/\\evil.example.com", "/"],
  ])("%s -> %s", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});
