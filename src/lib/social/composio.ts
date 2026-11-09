// Composio bridge: per-user connections for LinkedIn + social posting.
// Docs: https://docs.composio.dev - uses the connected account IDs from the user's Composio org.

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

function headers(): Record<string, string> {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY not configured");
  return { "x-api-key": key, "Content-Type": "application/json" };
}

export async function listConnections(toolkit: "linkedin" | "twitter" | "instagram" | "facebook") {
  const res = await fetch(`${COMPOSIO_BASE}/connectedAccounts?toolkit=${toolkit}`, { headers: headers() });
  if (!res.ok) throw new Error(`Composio error: HTTP ${res.status}`);
  return res.json();
}

/** Execute a Composio tool (e.g. LINKEDIN_CREATE_POST, TWITTER_CREATE_TWEET) for a connected account. */
export async function executeTool(opts: {
  tool: string;
  connectedAccountId: string;
  input: Record<string, unknown>;
}) {
  const res = await fetch(`${COMPOSIO_BASE}/tools/${opts.tool}/execute`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      connectedAccountId: opts.connectedAccountId,
      input: opts.input,
    }),
  });
  if (!res.ok) throw new Error(`Composio execute error: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export type SocialNetwork = "linkedin" | "twitter" | "facebook" | "instagram";

export const SOCIAL_TOOLS: Record<SocialNetwork, { tool: string; contentField: string }> = {
  linkedin: { tool: "LINKEDIN_CREATE_POST", contentField: "text" },
  twitter: { tool: "TWITTER_CREATE_TWEET", contentField: "text" },
  facebook: { tool: "FACEBOOK_CREATE_POST", contentField: "text" },
  instagram: { tool: "INSTAGRAM_CREATE_POST", contentField: "caption" },
};

export async function postToSocial(opts: {
  network: keyof typeof SOCIAL_TOOLS;
  connectedAccountId: string;
  content: string;
}) {
  const spec = SOCIAL_TOOLS[opts.network];
  if (!spec) throw new Error(`Unsupported network: ${opts.network}`);
  return executeTool({
    tool: spec.tool,
    connectedAccountId: opts.connectedAccountId,
    input: { [spec.contentField]: opts.content },
  });
}
