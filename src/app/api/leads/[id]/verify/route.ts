import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyContactPoints, type VerifyResult } from "@/lib/verify/contact-points";
import { logVerification } from "@/lib/verify/activity";

// Frozen contract: -> { contactId, results: [{ kind, value, provider, result }] }
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id: contactId } = await params;

  const db = createServiceClient();
  const orgId = organizationId();
  const { data: contact } = await db
    .from("crm_contact")
    .select("id, email, phone")
    .eq("id", contactId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .single();
  if (!contact) return apiError("not_found", "Lead not found.", 404);

  const targets: Array<{ kind: "email" | "phone"; value: string }> = [];
  if (contact.email?.trim()) targets.push({ kind: "email", value: contact.email.trim().toLowerCase() });
  if (contact.phone?.trim()) targets.push({ kind: "phone", value: contact.phone.trim() });
  if (targets.length === 0) {
    return Response.json({ code: "missing_contact", contactId, results: [], error: "This lead has no email or phone to verify." }, { status: 400 });
  }

  const results: VerifyResult[] = await verifyContactPoints(targets);
  await logVerification(contactId, results, auth.user.email ?? null);

  // `provider` stays for the frozen contract, but nothing user-facing should print it.
  // `message` is the plain text to show; raw provider errors stay in the server log.
  const shown = results.map(({ error, ...r }) => {
    if (error) console.error("[verify] provider error", r.kind, error);
    return { ...r, message: verifyMessage(r.kind, r.result) };
  });
  return Response.json({ contactId, results: shown });
}

const RESULT_TEXT: Record<string, string> = {
  valid: "is valid",
  invalid: "is not valid",
  risky: "is risky and may not deliver",
  unknown: "couldn't be checked right now",
};

function verifyMessage(kind: "email" | "phone", result: string): string {
  return `${kind === "email" ? "Email" : "Phone"} ${RESULT_TEXT[result] ?? "couldn't be checked right now"}.`;
}
