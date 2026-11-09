// Unauthenticated health check for uptime monitoring. Reports ok/presence only.

import { createServiceClient } from "@/lib/supabase/server";
import { enabledProviders } from "@/lib/ai/providers";

export async function GET() {
  let db = "down";
  try {
    const { error } = await createServiceClient().from("organization").select("id").limit(1);
    db = error ? "down" : "up";
  } catch {
    db = "down";
  }
  const providers = enabledProviders().map((p) => p.key);
  const ok = db === "up" && providers.length > 0;
  return Response.json(
    { ok, db, providers, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
