// Public lead capture for the BFCM landing page. No auth (it's a form endpoint);
// guarded by honeypot + shape validation + idempotent upsert into unified_lead,
// mirrored to crm_contact for the outreach pipeline.

import { validateCapture, captureIdempotencyKey } from "@/lib/capture/validate";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRate, clientKey } from "@/lib/ratelimit";

const CAPTURE_LIMIT = 10; // submissions per IP per window
const CAPTURE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const rate = checkRate(`capture:${clientKey(request)}`, Date.now(), CAPTURE_LIMIT, CAPTURE_WINDOW_MS);
  if (!rate.allowed) {
    return Response.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "invalid" }, { status: 400 });

  const v = validateCapture(body);
  if (!v.ok) {
    // Honeypots get a polite fake-success so bots learn nothing.
    if (v.error === "honeypot") return Response.json({ ok: true }, { status: 200 });
    return Response.json({ error: v.error }, { status: 400 });
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
  if (existing) return Response.json({ ok: true, id: existing.id, duplicate: true });

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
  if (error || !lead) return Response.json({ error: error?.message ?? "capture failed" }, { status: 500 });

  // Mirror into the CRM so the lead is visible in the console pipeline immediately
  // (skip if a contact with this email already exists).
  if (p.email) {
    const { data: dup } = await db
      .from("crm_contact")
      .select("id")
      .eq("organization_id", org)
      .eq("email", p.email)
      .is("deleted_at", null)
      .maybeSingle();
    if (!dup) {
      const nameParts = p.name.split(/\s+/);
      await db.from("crm_contact").insert({
        organization_id: org,
        first_name: nameParts[0] ?? p.name,
        last_name: nameParts.slice(1).join(" ") || null,
        email: p.email,
        phone: p.phone,
        company: p.company,
        custom_fields: { tcpa_consent: p.consent ? "granted" : "none", unified_lead_id: lead.id },
        lead_source: "bfcm-landing",
        stage: "new",
        created_date: now,
        updated_date: now,
      });
    }
  }

  return Response.json({ ok: true, id: lead.id }, { status: 201 });
}
