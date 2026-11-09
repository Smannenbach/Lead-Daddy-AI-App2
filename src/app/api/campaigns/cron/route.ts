// Advances every live campaign one due step. Invoked by Vercel Cron (bearer CRON_SECRET)
// or manually with the same header. The per-step consent/verification gates in
// /api/campaigns/[id]/advance do the real compliance work.

import { createServiceClient } from "@/lib/supabase/server";
import { organizationId } from "@/lib/supabase/org";

export async function GET(request: Request) {
  // Server-to-server credential: dedicated CRON_SECRET, falling back to the
  // service role (always present in this deployment).
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const { data: campaigns } = await db
    .from("marketing_campaign")
    .select("id")
    .eq("status", "live")
    .eq("organization_id", organizationId());

  const origin = new URL(request.url).origin;
  const results: unknown[] = [];
  for (const c of campaigns ?? []) {
    try {
      const res = await fetch(`${origin}/api/campaigns/${c.id}/advance`, {
        method: "POST",
        headers: {
          // advance() requires a user session; cron is server-to-server, so we
          // pass a synthetic allowed identity via the same allowlist check path.
          "x-cron-secret": secret,
        },
      });
      results.push({ id: c.id, status: res.status, body: await res.json().catch(() => null) });
    } catch (err) {
      results.push({ id: c.id, error: err instanceof Error ? err.message : "advance failed" });
    }
  }

  return Response.json({ advanced: results.length, results });
}
