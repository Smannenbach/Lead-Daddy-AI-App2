// Public lead capture for the BFCM landing page. No auth (it's a form endpoint);
// guarded by honeypot + shape validation + idempotent upsert into unified_lead,
// mirrored to crm_contact for the outreach pipeline.

import { apiError } from "@/lib/api/errors";
import { validateCapture, captureIdempotencyKey, captureResponse } from "@/lib/capture/validate";
import { organizationId } from "@/lib/supabase/org";
import { consentRecord } from "@/lib/consent";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRate, clientKey } from "@/lib/ratelimit";

const CAPTURE_MESSAGES: Record<string, string> = {
  missing_contact: "Add an email or phone number so we can reach you.",
  bad_email: "Check your email address.",
  bad_phone: "Check your phone number.",
  too_long: "One of your answers is too long. Shorten it and try again.",
};

const CAPTURE_LIMIT = 10; // submissions per IP per window
const CAPTURE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const rate = checkRate(`capture:${clientKey(request)}`, Date.now(), CAPTURE_LIMIT, CAPTURE_WINDOW_MS);
  if (!rate.allowed) {
    return Response.json(
      { code: "too_many_requests", error: "Too many tries. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("invalid_request", "Something was wrong with that form. Try again.", 400);

  const v = validateCapture(body);
  if (!v.ok) {
    // Honeypots get a polite fake-success so bots learn nothing.
    if (v.error === "honeypot") return Response.json({ ok: true }, { status: 200 });
    return apiError(v.error, CAPTURE_MESSAGES[v.error] ?? "Check the form and try again.", 400);
  }
  const p = v.value;
  const key = captureIdempotencyKey(p.email, p.phone);
  const now = new Date().toISOString();
  const db = createServiceClient();
  const org = organizationId();
  const pageUrl = typeof body.page_url === "string" ? body.page_url.slice(0, 500) : null;
  const utm = typeof body.utm === "object" && body.utm !== null ? body.utm : {};

  const { data: existing } = await db
    .from("unified_lead")
    .select("id")
    .eq("organization_id", org)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    await mirrorToCrm(db, org, p, existing.id, pageUrl, now);
    return Response.json(captureResponse(existing.id, p.consent, true));
  }

  const { data: lead, error } = await db
    .from("unified_lead")
    .insert({
      organization_id: org,
      source: "bfcm-landing",
      provider: "leaddaddy-ai",
      name: p.name,
      email: p.email,
      phone: p.phone,
      message: p.message,
      page_url: pageUrl,
      utm: utm as import("@/lib/supabase/database.types").Json,
      consent: { status: p.consent ? "granted" : "none", at: p.consent ? now : null },
      status: "new",
      idempotency_key: key,
      created_date: now,
      updated_date: now,
    })
    .select("id")
    .single();
  if (error || !lead) {
    console.error("[capture] unified_lead insert failed", error?.message);
    return Response.json({ code: "server_error", error: "We couldn't save that. Try again in a minute." }, { status: 500 });
  }

  // Mirror into the CRM so the lead is visible in the console pipeline immediately.
  // Phone-only submissions are mirrored too (they used to be dropped). An existing
  // contact with the same email (or phone, when there's no email) gets the
  // submission added to its Activity instead of a duplicate lead.
  await mirrorToCrm(db, org, p, lead.id, pageUrl, now);

  return Response.json(captureResponse(lead.id, p.consent), { status: 201 });
}

type Db = ReturnType<typeof createServiceClient>;

async function mirrorToCrm(
  db: Db,
  org: string,
  p: import("@/lib/capture/validate").CapturePayload,
  unifiedLeadId: string,
  pageUrl: string | null,
  now: string,
): Promise<void> {
  const activity = {
    type: "system",
    at: now,
    by: "Lead capture form",
    detail: [
      `Submitted the lead form${pageUrl ? ` (${pathOf(pageUrl)})` : ""}.`,
      p.consent ? "Consent box checked." : "Consent box not checked.",
      p.message ? `Looking to finance: ${p.message}` : "",
    ].filter(Boolean).join(" "),
  };
  const finance = p.message ? { financing_need: p.message } : {};

  const lookup = db.from("crm_contact").select("id, custom_fields, engagement_history").eq("organization_id", org).is("deleted_at", null);
  const { data: existing } = await (p.email ? lookup.eq("email", p.email) : lookup.eq("phone", p.phone ?? "")).limit(1).maybeSingle();

  if (existing) {
    const cf = (existing.custom_fields ?? {}) as Record<string, unknown>;
    const crmFields = (cf.crm_fields ?? {}) as Record<string, unknown>;
    const history = Array.isArray(existing.engagement_history) ? existing.engagement_history : [];
    const { error } = await db
      .from("crm_contact")
      .update({
        custom_fields: { ...cf, crm_fields: { ...crmFields, ...finance } },
        engagement_history: [...history, activity].slice(-200),
      })
      .eq("id", existing.id);
    if (error) console.error("[capture] crm update failed", error.message);
    return;
  }

  const nameParts = p.name.split(/\s+/);
  const { error } = await db.from("crm_contact").insert({
    organization_id: org,
    first_name: nameParts[0] ?? p.name,
    last_name: nameParts.slice(1).join(" ") || null,
    email: p.email,
    phone: p.phone,
    company: p.company,
    custom_fields: {
      tcpa_consent: p.consent ? "granted" : "none",
      consent_record: consentRecord({ granted: p.consent, method: "web_form", source: pageUrl ?? "web form", wordingVersion: "bfcm-form-2026-11", at: now }),
      unified_lead_id: unifiedLeadId,
      crm_fields: finance,
    },
    engagement_history: [activity],
    lead_source: "bfcm-landing",
    stage: "new",
    created_date: now,
    updated_date: now,
  });
  if (error) console.error("[capture] crm insert failed", error.message);
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.slice(0, 80);
  }
}

