import { requireUser } from "@/lib/auth";
import { scrapeUrl, LEAD_EXTRACT_PROMPT } from "@/lib/scrape/firecrawl";
import { extractPeopleFromDigest, personToContactInsert } from "@/lib/scrape/digest";
import { callModelWithFallback, enabledProviders } from "@/lib/ai/providers";
import { autoSelect } from "@/lib/ai/router";
import { logAiRun, assertAiBudget } from "@/lib/ai/log";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyContactPoints } from "@/lib/verify/contact-points";

interface ScrapeRequest {
  url: string;
  autoCreate?: boolean;
  autoVerify?: boolean;
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as ScrapeRequest | null;
  if (!body?.url?.trim()) return Response.json({ error: "url is required" }, { status: 400 });

  let scraped;
  try {
    scraped = await scrapeUrl(body.url, LEAD_EXTRACT_PROMPT);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "scrape failed" }, { status: 502 });
  }

  // AI digest of raw content -> structured lead intel
  let digest: { text: string; provider: string; model: string } | null = null;
  try {
    await assertAiBudget();
    const decision = autoSelect("scrape digest of extracted page data", "scraper-analyst");
    const result = await callModelWithFallback(decision.provider, [
      { role: "system", content: decision.agent!.systemPrompt },
      {
        role: "user",
        content: `Source URL: ${body.url}\n\nExtracted data:\n${JSON.stringify(scraped.extracted)}\n\nPage content (first 6000 chars):\n${scraped.markdown.slice(0, 6000)}`,
      },
    ], enabledProviders());
    await logAiRun({
      task: "scrape_digest",
      provider: decision.provider,
      model: result.model,
      agent: decision.agent!.name,
      reason: decision.reason,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
    digest = { text: result.text, provider: result.provider, model: result.model };
  } catch (err) {
    digest = { text: `digest failed: ${err instanceof Error ? err.message : "unknown"}`, provider: "", model: "" };
  }

  // autoCreate: turn digest people into crm_contact leads. Parse failures
  // yield an empty createdLeadIds, never a 500; per-person insert/verify
  // failures are non-fatal.
  let createdLeadIds: string[] | undefined;
  if (body.autoCreate) {
    createdLeadIds = [];
    try {
      const people = extractPeopleFromDigest(digest?.text);
      if (people.length > 0) {
        const db = createServiceClient();
        const now = new Date().toISOString();
        const opts = { leadSource: urlHost(scraped.url), orgId: organizationId(), now };
        for (const person of people) {
          const row = personToContactInsert(person, opts);
          if (!row) continue; // first_name is required to create a lead
          try {
            const { data, error } = await db.from("crm_contact").insert(row).select("id").single();
            if (error || !data) continue;
            createdLeadIds.push(data.id);
            if (body.autoVerify) {
              const targets = [
                row.email ? { kind: "email" as const, value: row.email } : null,
                row.phone ? { kind: "phone" as const, value: row.phone } : null,
              ].filter((t) => t !== null);
              if (targets.length > 0) await verifyContactPoints(targets);
            }
          } catch {
            // non-fatal: skip this person, keep creating the rest
          }
        }
      }
    } catch {
      // never 500 on autoCreate failures
    }
  }

  return Response.json({
    url: scraped.url,
    extracted: scraped.extracted,
    digest: digest?.text,
    digestModel: digest?.model,
    markdownChars: scraped.markdown.length,
    ...(createdLeadIds ? { createdLeadIds } : {}),
  });
}
