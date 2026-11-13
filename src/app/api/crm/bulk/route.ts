import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth";
import { sanitizePatch } from "@/lib/crm/model";
import { updateRecord } from "@/lib/crm/server";
import { softDeleteLeads } from "@/lib/crm/delete";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BULK = 200;

// POST /api/crm/bulk  body: { ids: string[], patch: { stage?, tags?, assigned_to?, next_follow_up? } }
//                   or { ids: string[], action: "delete" } -> { deleted, notFound }
// Only a safe subset of fields can be bulk-edited. -> { updated, failed: [{ id, error }] }
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { ids?: unknown; patch?: Record<string, unknown> } | null;
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))] : [];
  if (ids.length === 0) return Response.json({ code: "no_selection", error: "Select at least one lead." }, { status: 400 });
  if (ids.length > MAX_BULK) return Response.json({ code: "too_many", error: `You can change up to ${MAX_BULK} leads at a time.` }, { status: 400 });

  // { ids, action: "delete" } -> soft delete all of them in one go.
  if ((body as { action?: unknown } | null)?.action === "delete") {
    const r = await softDeleteLeads(ids, auth.user.email ?? null);
    return Response.json({ deleted: r.deleted.length, notFound: r.notFound.length });
  }

  const allowed = ["stage", "tags", "assigned_to", "next_follow_up"];
  const raw = body?.patch && typeof body.patch === "object" ? body.patch : {};
  const picked = Object.fromEntries(Object.entries(raw).filter(([k]) => allowed.includes(k)));
  if (Object.keys(picked).length === 0) return Response.json({ code: "nothing_to_change", error: "Pick a stage, tags, owner or follow up date to change." }, { status: 400 });
  const patch = sanitizePatch(picked);
  if (patch.errors.length > 0) return apiError("invalid_fields", patch.errors.join(" "), 400, { errors: patch.errors });

  let updated = 0;
  const failed: Array<{ id: string; error: string }> = [];
  // Sequential on purpose: small batches, keeps per-record history + compare-and-set simple.
  for (const id of ids) {
    const r = await updateRecord(id, patch, auth.user.email ?? null);
    if (r.ok) updated += 1;
    else failed.push({ id, error: r.error });
  }
  return Response.json({ updated, failed });
}
