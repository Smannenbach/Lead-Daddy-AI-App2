// Shared contact-point verification: runs Reoon (email) / RealValidito (phone)
// for the given values and persists rows to the Base44 verification tables
// (keyed by contact point value, latest row wins at read time). Never throws —
// per-target failures come back as result "unknown" with an error note, so
// callers (single-lead verify route, scrape autoVerify) stay non-fatal.

import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyEmail } from "@/lib/verify/reoon";
import { verifyPhone } from "@/lib/verify/realvalidito";

export interface VerifyTarget {
  kind: "email" | "phone";
  value: string;
}

export interface VerifyResult {
  kind: "email" | "phone";
  value: string;
  provider: string;
  result: string; // valid | invalid | risky | unknown
  error?: string;
}

export async function verifyContactPoints(targets: VerifyTarget[]): Promise<VerifyResult[]> {
  const db = createServiceClient();
  const orgId = organizationId();
  const results: VerifyResult[] = [];
  for (const t of targets) {
    const provider = t.kind === "email" ? "reoon" : "realvalidito";
    try {
      const verdict = t.kind === "email" ? await verifyEmail(t.value) : await verifyPhone(t.value);
      const now = new Date().toISOString();
      const row = {
        verification_status: verdict.result,
        verification_source: provider,
        verification_date: now,
        organization_id: orgId,
        created_date: now,
        updated_date: now,
      };
      const inserted =
        t.kind === "email"
          ? await db.from("email_verification").insert({ ...row, email: t.value })
          : await db.from("phone_verification").insert({ ...row, phone_number: t.value });
      if (inserted.error) throw new Error(inserted.error.message);
      results.push({ kind: t.kind, value: t.value, provider, result: verdict.result });
    } catch (err) {
      results.push({
        kind: t.kind,
        value: t.value,
        provider,
        result: "unknown",
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return results;
}
