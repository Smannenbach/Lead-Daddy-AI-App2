import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { latestStatusByEmail, latestStatusByPhone } from "@/lib/verify/status";

// Frozen contract: { leads: [{ id, first_name, last_name, company, job_title,
//   email, phone, stage, email_status, phone_status }] }
// email_status / phone_status = latest verification_status from the Base44
// verification tables, or "unverified".
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const db = createServiceClient();
  const { data, error } = await db
    .from("crm_contact")
    .select("id, first_name, last_name, company, job_title, email, phone, stage, custom_fields")
    .eq("organization_id", organizationId())
    .is("deleted_at", null)
    .order("created_date", { ascending: false })
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const contacts = data ?? [];
  const [emailStatus, phoneStatus] = await Promise.all([
    latestStatusByEmail(contacts.map((c) => c.email ?? "")),
    latestStatusByPhone(contacts.map((c) => c.phone ?? "")),
  ]);

  const leads = contacts.map((c) => {
    const email = c.email?.trim().toLowerCase() ?? "";
    const phone = c.phone?.trim() ?? "";
    const cf = (c.custom_fields ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      company: c.company,
      job_title: c.job_title,
      email: c.email,
      phone: c.phone,
      stage: c.stage,
      consent: typeof cf.tcpa_consent === "string" ? cf.tcpa_consent : "none",
      email_status: email ? (emailStatus.get(email) ?? "unverified") : "unverified",
      phone_status: phone ? (phoneStatus.get(phone) ?? "unverified") : "unverified",
    };
  });
  return Response.json({ leads });
}

// Frozen contract: body { first_name, last_name?, email?, phone?, company?, job_title?, tcpaConsent? } -> { id }
// tcpaConsent=true records custom_fields.tcpa_consent="granted" (required before any SMS/call step).
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { first_name?: string; last_name?: string; email?: string; phone?: string; company?: string; job_title?: string; tcpaConsent?: boolean }
    | null;
  if (!body?.first_name?.trim()) return Response.json({ error: "first_name is required" }, { status: 400 });

  const now = new Date().toISOString();
  const db = createServiceClient();
  const { data, error } = await db
    .from("crm_contact")
    .insert({
      organization_id: organizationId(),
      first_name: body.first_name.trim(),
      last_name: body.last_name?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      phone: body.phone?.trim() || null,
      company: body.company?.trim() || null,
      job_title: body.job_title?.trim() || null,
      custom_fields: body.tcpaConsent ? { tcpa_consent: "granted" } : {},
      lead_source: "manual",
      stage: "new",
      created_date: now,
      updated_date: now,
    })
    .select("id")
    .single();
  if (error || !data) return Response.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  return Response.json({ id: data.id }, { status: 201 });
}
