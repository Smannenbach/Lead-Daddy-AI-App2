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
  if (!contact) return Response.json({ error: "Lead not found" }, { status: 404 });

  const targets: Array<{ kind: "email" | "phone"; value: string }> = [];
  if (contact.email?.trim()) targets.push({ kind: "email", value: contact.email.trim().toLowerCase() });
  if (contact.phone?.trim()) targets.push({ kind: "phone", value: contact.phone.trim() });
  if (targets.length === 0) {
    return Response.json({ contactId, results: [], error: "No email or phone on this lead to verify" }, { status: 400 });
  }

  const results: VerifyResult[] = await verifyContactPoints(targets);
  await logVerification(contactId, results, auth.user.email ?? null);

  return Response.json({ contactId, results });
}
