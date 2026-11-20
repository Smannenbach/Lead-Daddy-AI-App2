// Unauthenticated health check for uptime monitoring. Reports ok/presence only.

import { createServiceClient } from "@/lib/supabase/server";
import { enabledProviders } from "@/lib/ai/providers";
import { isDemoMode } from "@/lib/demo/mode";

export async function GET() {
  let db = "down";
  try {
    const { error } = await createServiceClient().from("organization").select("id").limit(1);
    db = error ? "down" : "up";
  } catch {
    db = "down";
  }
  const providers = enabledProviders().map((p) => p.key);
  const demo = isDemoMode();
  const ok = db === "up" && (providers.length > 0 || demo);
  return Response.json(
    { ok, db, providers, ...(demo ? { demo: true } : {}), time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
