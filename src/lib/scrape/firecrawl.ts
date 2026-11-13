// Firecrawl scrape + LLM extraction (https://firecrawl.dev), API v2.
// v2 removed the top-level `extract` key. JSON extraction is now a format object:
//   formats: ["markdown", { type: "json", prompt }]  ->  data.json

export interface ScrapeResult {
  url: string;
  markdown: string;
  extracted: Record<string, unknown> | null;
}

export class ScrapeError extends Error {
  constructor(message: string, readonly providerStatus?: number) {
    super(message);
  }
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|169\.254\.|\[?::1\]?$)/i;

/** Normalizes user input to an http(s) URL, or null when it is not a usable public address. */
export function validateScrapeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let raw = input.trim();
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".") || PRIVATE_HOST.test(u.hostname)) return null;
  return u.toString();
}

export function buildScrapeBody(url: string, extractPrompt?: string): Record<string, unknown> {
  return {
    url,
    formats: extractPrompt ? ["markdown", { type: "json", prompt: extractPrompt }] : ["markdown"],
    onlyMainContent: true,
  };
}

export function parseScrapeResponse(url: string, j: unknown): ScrapeResult {
  const o = (j && typeof j === "object" ? j : {}) as { success?: boolean; data?: Record<string, unknown> };
  if (!o.success || !o.data) throw new ScrapeError("Firecrawl returned no data");
  const d = o.data;
  const json = d.json ?? d.extract; // v2 returns `json`; older responses used `extract`
  return {
    url,
    markdown: typeof d.markdown === "string" ? d.markdown : "",
    extracted: json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null,
  };
}

export async function scrapeUrl(url: string, extractPrompt?: string, fetchImpl: typeof fetch = fetch): Promise<ScrapeResult> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new ScrapeError("FIRECRAWL_API_KEY not configured");
  const res = await fetchImpl("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildScrapeBody(url, extractPrompt)),
  });
  if (!res.ok) throw new ScrapeError(`Firecrawl HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  return parseScrapeResponse(url, await res.json());
}

export const LEAD_EXTRACT_PROMPT = [
  "Extract every person mentioned with: full name, job title, company, email addresses,",
  "phone numbers, LinkedIn profile URLs, and other social media profile URLs.",
  "Also note the company name and any real-estate or investment related signals.",
  "Return structured data only.",
].join(" ");
