import { requireUser } from "@/lib/auth";
import {
  CSV_LEAD_SOURCE,
  IMPORT_BATCH_SIZE,
  MAX_IMPORT_ROWS,
  candidateEmails,
  chunk,
  splitDuplicates,
  validateImportRows,
} from "@/lib/leads/import";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";

// Frozen contract: body { rows: [{first_name?, last_name?, email?, phone?,
//   company?, job_title?}] } (max 500) -> { created, skipped }
// Dedupe: a row whose normalized email already exists in crm_contact (same
// org, not deleted) is skipped and counted, not an error. Rows without
// first_name AND without email are skipped. Inserts go in batches of 100.
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { rows?: unknown; tcpaConsent?: boolean } | null;
  if (!Array.isArray(body?.rows)) {
    return Response.json({ error: "rows must be an array" }, { status: 400 });
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return Response.json({ error: `rows exceeds max of ${MAX_IMPORT_ROWS}` }, { status: 400 });
  }

  const db = createServiceClient();
  const orgId = organizationId();

  const { rows, skipped } = validateImportRows(body.rows);
  const emails = candidateEmails(rows);

  let existingEmails = new Set<string>();
  if (emails.length > 0) {
    const { data } = await db
      .from("crm_contact")
      .select("email")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("email", emails);
    existingEmails = new Set(
      (data ?? [])
        .map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : ""))
        .filter(Boolean),
    );
  }

  const { fresh, duplicates } = splitDuplicates(rows, existingEmails);

  let created = 0;
  const now = new Date().toISOString();
  for (const batch of chunk(fresh, IMPORT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("crm_contact")
      .insert(
        batch.map((r) => ({
          organization_id: orgId,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          phone: r.phone,
          company: r.company,
          job_title: r.job_title,
          custom_fields: body?.tcpaConsent ? { tcpa_consent: "granted" } : {},
          lead_source: CSV_LEAD_SOURCE,
          stage: "new",
          created_date: now,
          updated_date: now,
        })),
      )
      .select("id");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    created += data?.length ?? 0;
  }

  return Response.json({ created, skipped: skipped + duplicates });
}
