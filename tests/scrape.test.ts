import { describe, expect, it, vi } from "vitest";
import { buildScrapeBody, parseScrapeResponse, scrapeUrl, validateScrapeUrl, ScrapeError } from "@/lib/scrape/firecrawl";

describe("validateScrapeUrl", () => {
  it("accepts and normalizes public http(s) URLs", () => {
    expect(validateScrapeUrl("https://example.com")).toBe("https://example.com/");
    expect(validateScrapeUrl("  example.com/team ")).toBe("https://example.com/team");
  });
  it("rejects junk, other schemes and private hosts", () => {
    for (const bad of ["", "   ", "not a url", "ftp://example.com", "javascript:alert(1)", "http://localhost:3000", "http://192.168.1.1", "https://nodot", 42, null]) {
      expect(validateScrapeUrl(bad)).toBeNull();
    }
  });
});

describe("Firecrawl v2 request body", () => {
  it("has no top-level extract key and asks for JSON through formats", () => {
    const body = buildScrapeBody("https://example.com/", "find people");
    expect(body).not.toHaveProperty("extract");
    expect(body.formats).toEqual(["markdown", { type: "json", prompt: "find people" }]);
    expect(Object.keys(body).sort()).toEqual(["formats", "onlyMainContent", "url"]);
  });
});

describe("parseScrapeResponse", () => {
  it("reads v2 data.json", () => {
    const r = parseScrapeResponse("https://example.com/", { success: true, data: { markdown: "# Hi", json: { people: [] } } });
    expect(r).toEqual({ url: "https://example.com/", markdown: "# Hi", extracted: { people: [] } });
  });
  it("throws a ScrapeError when Firecrawl reports failure", () => {
    expect(() => parseScrapeResponse("u", { success: false })).toThrow(ScrapeError);
  });
});

describe("scrapeUrl (mocked, no credits spent)", () => {
  it("posts the v2 body and surfaces provider errors only as a ScrapeError", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { markdown: "x", json: { a: 1 } } }), { status: 200 }));
    const r = await scrapeUrl("https://example.com/", "p", ok as unknown as typeof fetch);
    expect(r.extracted).toEqual({ a: 1 });
    const sent = JSON.parse((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).not.toHaveProperty("extract");

    const bad = vi.fn(async () => new Response("Unrecognized key in body", { status: 400 }));
    await expect(scrapeUrl("https://example.com/", "p", bad as unknown as typeof fetch)).rejects.toBeInstanceOf(ScrapeError);
  });
});
