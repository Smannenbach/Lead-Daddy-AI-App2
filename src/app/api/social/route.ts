import { apiError, serverError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { postToSocial, listConnections, SOCIAL_TOOLS } from "@/lib/social/composio";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const out: Record<string, unknown> = {};
    for (const network of Object.keys(SOCIAL_TOOLS) as Array<keyof typeof SOCIAL_TOOLS>) {
      out[network] = await listConnections(network).catch((e: unknown) => ({ error: String(e) }));
    }
    return Response.json({ connections: out });
  } catch (err) {
    return serverError("social GET", err, 502, "We couldn't load your connected social accounts. Try again in a minute.");
  }
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    network?: keyof typeof SOCIAL_TOOLS;
    connectedAccountId?: string;
    content?: string;
  } | null;
  if (!body?.network || !body.connectedAccountId || !body.content?.trim()) {
    return apiError("invalid_request", "Pick an account and write a post first.", 400);
  }
  try {
    const result = await postToSocial({
      network: body.network,
      connectedAccountId: body.connectedAccountId,
      content: body.content,
    });
    const now = new Date().toISOString();
    const { error } = await createServiceClient().from("lead_event").insert({
      event_type: "social_post",
      detail: `[${body.network}] ${body.content.slice(0, 500)}`,
      data: { network: body.network, connectedAccountId: body.connectedAccountId },
      organization_id: organizationId(),
      created_date: now,
      updated_date: now,
    });
    if (error) console.error("lead_event insert failed", error.message);
    return Response.json({ ok: true, result });
  } catch (err) {
    return serverError("social POST", err, 502, "That post didn't go out. Try again in a minute.");
  }
}
