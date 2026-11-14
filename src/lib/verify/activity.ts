// Adds a plain-language Activity entry to a lead after a verification run.
// No provider names here: "Email checked: valid", not "(reoon)".
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { appendTimeline, type TimelineEntry } from "@/lib/crm/model";
import type { VerifyResult } from "@/lib/verify/contact-points";

const RESULT_TEXT: Record<string, string> = {
  valid: "valid",
  invalid: "not valid",
  risky: "risky (may not deliver)",
  unknown: "couldn't be checked",
};

export function verificationActivity(results: VerifyResult[], actor: string | null, at: string): TimelineEntry[] {
  return results.map((r) => ({
    type: "verified",
    at,
    by: actor,
    detail: `${r.kind === "email" ? "Email" : "Phone"} ${r.value} checked: ${RESULT_TEXT[r.result] ?? r.result}`,
  }));
}

export async function logVerification(leadId: string, results: VerifyResult[], actor: string | null, db = createServiceClient()): Promise<void> {
  if (results.length === 0) return;
  const { data } = await db.from("crm_contact").select("id, engagement_history").eq("id", leadId).eq("organization_id", organizationId()).maybeSingle();
  if (!data) return;
  const entries = verificationActivity(results, actor, new Date().toISOString());
  const { error } = await db
    .from("crm_contact")
    .update({ engagement_history: appendTimeline(data.engagement_history, entries) as never })
    .eq("id", leadId)
    .eq("organization_id", organizationId());
  if (error) console.error("[verify] activity log failed", error.message);
}
