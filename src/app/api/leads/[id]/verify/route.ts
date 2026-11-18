import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyContactPoints, type VerifyResult } from "@/lib/verify/contact-points";
import { logVerification } from "@/lib/verify/activity";
import { sendsDisabledReason } from "@/lib/channels/send-guard";
import { creditsPerCheck, getReoonBalance } from "@/lib/verify/reoon";

// Frozen contract: -> { contactId, results: [{ kind, value, provider, result }] }
// Added: results[].message (plain text), emailCreditsRemaining (number | null).
// POST ...?dryRun=true -> { dryRun, checks, cost: { emailChecks, phoneChecks, estimatedCredits }, emailCreditsRemaining }
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

  // ?dryRun=true: say what WOULD be checked and what it costs, call no provider, spend nothing.
  if (new URL(_request.url).searchParams.get("dryRun") === "true") {
    const perEmail = creditsPerCheck("email");
    const perPhone = creditsPerCheck("phone");
    const emailChecks = targets.filter((t) => t.kind === "email").length;
    const phoneChecks = targets.filter((t) => t.kind === "phone").length;
    const known = (emailChecks === 0 || perEmail !== null) && (phoneChecks === 0 || perPhone !== null);
    return Response.json({
      dryRun: true,
      contactId,
      checks: targets.map((t) => ({ kind: t.kind, value: t.value })),
      cost: {
        emailChecks,
        phoneChecks,
        estimatedCredits: known ? emailChecks * (perEmail ?? 0) + phoneChecks * (perPhone ?? 0) : null,
      },
      emailCreditsRemaining: (await getReoonBalance())?.total ?? null,
    });
  }

  // Paid checks are off on previews (see src/lib/channels/send-guard.ts).
  const blocked = sendsDisabledReason();
  if (blocked) {
    return Response.json({ code: "sends_disabled", error: "Verification is turned off in this preview. No credits were used." }, { status: 503 });
  }
  const results: VerifyResult[] = await verifyContactPoints(targets);
  await logVerification(contactId, results, auth.user.email ?? null);

  // `provider` stays for the frozen contract, but nothing user-facing should print it.
  // `message` is the plain text to show; raw provider errors stay in the server log.
  const shown = results.map(({ error, ...r }) => {
    if (error) console.error("[verify] provider error", r.kind, error);
    return { ...r, message: verifyMessage(r.kind, r.result) };
  });
  // Balance after the run so the page can warn before the next one. null = unknown.
  // Phone (RealValidito) balance isn't exposed by this app; only email credits are shown.
  return Response.json({ contactId, results: shown, emailCreditsRemaining: (await getReoonBalance())?.total ?? null });
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
