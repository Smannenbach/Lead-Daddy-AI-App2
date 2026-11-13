import { requireUser } from "@/lib/auth";
import { sanitizePatch } from "@/lib/crm/model";
import { getRecord, updateRecord } from "@/lib/crm/server";
import { purgeLead, softDeleteLeads } from "@/lib/crm/delete";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/crm/records/:id -> { record, timeline }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Record not found" }, { status: 404 });
  const found = await getRecord(id);
  if (!found) return Response.json({ error: "Record not found" }, { status: 404 });
  return Response.json(found);
}

// PATCH /api/crm/records/:id  body: { ...fields, custom?: {}, note?: string, expectedUpdated?: string }
// -> { ok, updated_date, changes } | 400 { errors } | 404 | 409 (someone else saved first)
// TCPA consent and organization_id are never writable here (see sanitizePatch).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Record not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch = sanitizePatch(body);
  if (patch.errors.length > 0) return Response.json({ errors: patch.errors }, { status: 400 });
  const expected = typeof body?.expectedUpdated === "string" ? body.expectedUpdated : undefined;
  const result = await updateRecord(id, patch, auth.user.email ?? null, expected);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}

// DELETE /api/crm/records/:id            -> soft delete (drops out of lists, counts, exports, campaigns)
// DELETE /api/crm/records/:id?purge=true  body { confirm: "PURGE" }
//   -> permanent removal for a privacy deletion request (lead, verifications, form
//      submissions, campaign references). Cannot be undone.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ code: "not_found", error: "Lead not found." }, { status: 404 });
  const actor = auth.user.email ?? null;

  if (new URL(req.url).searchParams.get("purge") === "true") {
    const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
    if (body?.confirm !== "PURGE") {
      return Response.json(
        { code: "confirm_required", error: 'Permanent deletion can\'t be undone. Send { "confirm": "PURGE" } to go ahead.' },
        { status: 400 },
      );
    }
    const r = await purgeLead(id, actor);
    if (!r.ok) return Response.json({ code: "not_found", error: "Lead not found." }, { status: 404 });
    return Response.json({ ok: true, purged: true, removed: r.removed });
  }

  const r = await softDeleteLeads([id], actor);
  if (r.deleted.length === 0) return Response.json({ code: "not_found", error: "Lead not found." }, { status: 404 });
  return Response.json({ ok: true, deleted: 1 });
}
