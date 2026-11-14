import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let user: { id: string } | null = null;
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
const { proxy } = await import("@/proxy");

const hit = (path: string) => proxy(new NextRequest(`https://app2.leaddaddy.ai${path}`));

describe("logged out", () => {
  it.each(["/api/leads", "/api/leads/import", "/api/crm/records", "/api/scrape", "/api/social", "/api/ai"])("%s returns 401 JSON, not the login page", async (path) => {
    user = null;
    const res = await hit(path);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "unauthorized", error: "Your session has expired. Sign in again." });
  });
  it.each(["/", "/crm", "/crm/abc"])("page %s still redirects to login", async (path) => {
    user = null;
    const res = await hit(path);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app2.leaddaddy.ai/login");
  });
  it("signed in passes through", async () => {
    user = { id: "u" };
    expect((await hit("/api/leads")).status).toBe(200);
  });
});

describe("new app pages are behind login", () => {
  it.each(["/pipeline", "/campaigns", "/import", "/scraper", "/settings"])("%s redirects to login when signed out", async (path) => {
    user = null;
    const res = await hit(path);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app2.leaddaddy.ai/login");
  });
  it("/api/verify/credits returns 401 JSON when signed out", async () => {
    user = null;
    expect((await hit("/api/verify/credits")).status).toBe(401);
  });
  it("every app page is in the matcher", async () => {
    const { APP_PAGES, config } = await import("@/proxy");
    for (const p of APP_PAGES) expect(config.matcher).toContain(`${p}/:path*`);
  });
});
