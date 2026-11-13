import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import config from "../next.config";

describe("security headers", () => {
  it("sends the full set on every path", async () => {
    const rules = await config.headers!();
    expect(rules[0].source).toBe("/:path*");
    const keys = rules[0].headers.map((h) => h.key);
    for (const k of ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(keys).toContain(k);
    }
  });
  it("blocks framing and allows only Supabase as an outside connection in production", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(csp).not.toContain("unsafe-eval");
    expect(securityHeaders(false).find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
  });
});
