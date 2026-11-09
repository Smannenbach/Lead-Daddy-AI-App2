import { enabledProviders, type ProviderSpec } from "./providers";

export interface AgentPersona {
  name: string;
  description: string;
  systemPrompt: string;
  preferredStrength: string; // router tries to match a provider strength to this
}

export const AGENTS: AgentPersona[] = [
  {
    name: "sales-caller",
    description: "AI voice/SMS sales agent - qualifies leads, books follow-ups",
    preferredStrength: "voice",
    systemPrompt: [
      "You are the LeadDaddy.ai AI sales agent on a live business call or SMS thread.",
      "Goal: qualify the lead (interest, timeline, property/loan needs) and book a follow-up.",
      "Hard rules: business-purpose positioning only. Never give legal, tax, or investment advice.",
      "Respect opt-outs instantly ('stop'/'remove me' -> end politely, log consent revoked).",
      "TCPA: only continue if consent is granted; if unknown, ask for permission to continue.",
      "Keep replies short and natural - this is a conversation, not an essay.",
    ].join("\n"),
  },
  {
    name: "lead-verifier",
    description: "Triage and enrichment - scores scraped data, flags verification gaps",
    preferredStrength: "extraction",
    systemPrompt: [
      "You are the LeadDaddy.ai lead verifier. You receive scraped or provided lead data.",
      "Extract: full name, company, title, emails, phones, LinkedIn/social URLs.",
      "Flag what is missing or looks fake. Rate confidence 0-1 for each field.",
      "Respond with compact JSON only: {full_name, company, title, emails[], phones[], linkedin_url, social_urls[], confidence, missing[]}",
    ].join("\n"),
  },
  {
    name: "campaign-writer",
    description: "Writes call scripts, SMS and email sequences per campaign",
    preferredStrength: "creative",
    systemPrompt: [
      "You are the LeadDaddy.ai campaign copywriter for DSCR investment-property lending outreach.",
      "Write compliant, concise outreach: call opener, 3-step SMS sequence, 3-email sequence.",
      "Rules: business-purpose only, include opt-out language on SMS/email, no legal/tax promises,",
      "no guaranteed-rate claims. Personalize from the lead fields provided.",
    ].join("\n"),
  },
  {
    name: "scraper-analyst",
    description: "Digests raw page/market data into structured, verified lead intel",
    preferredStrength: "digest",
    systemPrompt: [
      "You are the LeadDaddy.ai scraping analyst. You receive raw page text or lists.",
      "Pull out people, roles, contact info, and business signals relevant to investment-property lending.",
      "Deduplicate, normalize (phones E.164, emails lowercase), and drop obvious junk.",
      "Output compact JSON only.",
    ].join("\n"),
  },
];

export function findAgent(name: string | undefined | null): AgentPersona | null {
  if (!name) return null;
  return AGENTS.find((a) => a.name === name.trim().toLowerCase()) ?? null;
}

export interface RouteDecision {
  provider: ProviderSpec;
  agent: AgentPersona | null;
  reason: string;
}

const SIGNALS: Array<{ pattern: RegExp; strength: string; agent: string | null; label: string }> = [
  { pattern: /\b(call|voice|phone (call|conversation)|talk to|dial)\b/i, strength: "voice", agent: "sales-caller", label: "live conversation" },
  { pattern: /\b(scrape|scraped|crawl|page text|raw html|extract from url)\b/i, strength: "digest", agent: "scraper-analyst", label: "scrape digest" },
  { pattern: /\b(verify|verification|validate|is this (email|phone) real|triage)\b/i, strength: "extraction", agent: "lead-verifier", label: "verification triage" },
  { pattern: /\b(sequence|campaign|outreach copy|email copy|sms copy|script)\b/i, strength: "creative", agent: "campaign-writer", label: "campaign copy" },
  { pattern: /\b(legal|compliance|tcpa|disclosure|business-purpose)\b/i, strength: "compliance", agent: null, label: "compliance-sensitive" },
  { pattern: /\b(summar|digest|long|report|research)\b/i, strength: "long-context", agent: null, label: "long-context summary" },
];

/** Auto-select the best provider + agent for a prompt. Transparent rules, no magic. */
export function autoSelect(prompt: string, agentName?: string | null): RouteDecision {
  const available = enabledProviders();
  if (available.length === 0) throw new Error("No AI providers configured");

  let agent = findAgent(agentName);
  let strength = agent?.preferredStrength ?? "reasoning";
  let why = agent ? `agent '${agent.name}' prefers ${strength}` : "default reasoning task";

  for (const sig of SIGNALS) {
    if (sig.pattern.test(prompt)) {
      strength = sig.strength;
      if (!agent && sig.agent) agent = findAgent(sig.agent);
      why = `matched '${sig.label}'`;
      break;
    }
  }

  let provider =
    available.find((p) => p.strengths.includes(strength)) ??
    available.find((p) => p.key === "anthropic") ??
    available[0];

  // Cheap-task downgrade: if the matched provider is expensive but a cheap one covers it, use cheap.
  const cheap = available.find((p) => p.strengths.includes("cheap"));
  if (cheap && cheap.inputPerM < provider.inputPerM && ["extraction", "triage", "classification", "cheap"].includes(strength)) {
    provider = cheap;
    why += `; downgraded to cheap model (${cheap.label})`;
  }

  return { provider, agent, reason: `${why} -> ${provider.label}` };
}
