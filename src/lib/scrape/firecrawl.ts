// Firecrawl scrape + LLM extraction (https://firecrawl.dev)

export interface ScrapeResult {
  url: string;
  markdown: string;
  extracted: Record<string, unknown> | null;
}

export async function scrapeUrl(url: string, extractPrompt?: string): Promise<ScrapeResult> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  const body: Record<string, unknown> = { url, formats: ["markdown"] };
  if (extractPrompt) {
    body.formats = ["markdown", "extract"];
    body.extract = { prompt: extractPrompt };
  }
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firecrawl error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as {
    success: boolean;
    data?: { markdown?: string; extract?: Record<string, unknown> };
  };
  if (!j.success || !j.data) throw new Error("Firecrawl scrape failed");
  return { url, markdown: j.data.markdown ?? "", extracted: j.data.extract ?? null };
}

export const LEAD_EXTRACT_PROMPT = [
  "Extract every person mentioned with: full name, job title, company, email addresses,",
  "phone numbers, LinkedIn profile URLs, and other social media profile URLs.",
  "Also note the company name and any real-estate or investment related signals.",
  "Return structured data only.",
].join(" ");
