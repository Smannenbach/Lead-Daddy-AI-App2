import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth";
import { consentRecord } from "@/lib/consent";
import { csvToLeadRows } from "@/lib/leads/csv";
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
//   company?, job_title?}], hasHeader? } (max 500) -> { created, skipped, skippedRows: [{ row, reason }] }
// Dedupe: a row whose normalized email already exists in crm_contact (same
// org, not deleted) OR repeats an earlier row in the same file is skipped and
// counted, not an error. Rows without
// first_name AND without email are skipped. Inserts go in batches of 100.
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { rows?: unknown; csv?: unknown; filename?: unknown; tcpaConsent?: boolean; hasHeader?: boolean }
    | null;
  // Preferred: send the raw file text as `csv` (+ `filename`) and let the server parse and
  // validate it. `rows` (already parsed in the browser) still works for older pages.
  if (body && body.csv !== undefined) {
    const parsed = csvToLeadRows(body.csv, body.filename);
    if (!parsed.ok) return Response.json({ code: parsed.code, error: parsed.error }, { status: 400 });
    body.rows = parsed.rows;
    body.hasHeader = parsed.hasHeader;
  }
  if (!body || !Array.isArray(body.rows)) {
    return Response.json({ code: "not_csv", error: "Upload a .csv file with your leads." }, { status: 400 });
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return Response.json({ code: "too_many_rows", error: `Import up to ${MAX_IMPORT_ROWS} leads at a time.` }, { status: 400 });
  }

  const db = createServiceClient();
  const orgId = organizationId();

  const { rows, skippedRows: invalidRows } = validateImportRows(body.rows, body.hasHeader ? 2 : 1);
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

  const { fresh, skippedRows: duplicateRows } = splitDuplicates(rows, existingEmails);
  const skippedRows = [...invalidRows, ...duplicateRows].sort((a, b) => a.row - b.row);

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
          custom_fields: body?.tcpaConsent
            ? {
                tcpa_consent: "granted",
                consent_record: consentRecord({ granted: true, method: "rep_attested_import", source: "console:csv-import", wordingVersion: "csv-import-2026-11", at: now, capturedBy: auth.user.email ?? null }),
              }
            : {},
          lead_source: CSV_LEAD_SOURCE,
          stage: "new",
          created_date: now,
          updated_date: now,
        })),
      )
      .select("id");
    if (error) {
      console.error("[import] insert failed", error.message);
      return apiError("server_error", `Saved ${created} lead(s), then something went wrong. Check the list before importing again.`, 500, { created });
    }
    created += data?.length ?? 0;
  }

  return Response.json({ created, skipped: skippedRows.length, skippedRows });
}
