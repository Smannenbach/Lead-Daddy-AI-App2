import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("@/lib/scrape/firecrawl", async (orig) => {
  const real = await orig<typeof import("@/lib/scrape/firecrawl")>();
  return {
    ...real,
    scrapeUrl: vi.fn(async () => {
      throw new real.ScrapeError("Firecrawl HTTP 400: Unrecognized key in body, please review the v2 API documentation");
    }),
  };
});

const { POST } = await import("@/app/api/scrape/route");
const call = (body: unknown) => POST(new Request("http://x/api/scrape", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/scrape", () => {
  it("rejects a bad URL with a plain message before calling Firecrawl", async () => {
    const res = await call({ url: "not a url" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "invalid_url", error: "Enter a valid URL, like https://example.com." });
  });

  it("never returns the raw provider message to the user", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({ url: "https://example.com" });
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.code).toBe("scrape_failed");
    expect(JSON.stringify(body)).not.toMatch(/firecrawl|unrecognized|v2/i);
    expect(String(spy.mock.calls[0])).toMatch(/Unrecognized key/); // logged on the server only
  });
});
