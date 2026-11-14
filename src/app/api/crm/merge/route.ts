import { requireUser } from "@/lib/auth";
import { mergeLeads } from "@/lib/crm/delete";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/crm/merge  body { primaryId, duplicateIds: string[] } -> { ok, primaryId, merged }
// Keeps the primary lead, fills its empty fields from the duplicates, combines tags,
// custom fields and Activity, moves campaign membership, and soft deletes the duplicates.
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { primaryId?: unknown; duplicateIds?: unknown } | null;
  const primaryId = typeof body?.primaryId === "string" && UUID.test(body.primaryId) ? body.primaryId : null;
  const dups = Array.isArray(body?.duplicateIds) ? [...new Set(body.duplicateIds.filter((x): x is string => typeof x === "string" && UUID.test(x)))] : [];
  if (!primaryId || dups.length === 0) {
    return Response.json({ code: "invalid_request", error: "Pick the lead to keep and at least one duplicate." }, { status: 400 });
  }
  if (dups.length > 50) return Response.json({ code: "too_many", error: "Merge up to 50 duplicates at a time." }, { status: 400 });
  const r = await mergeLeads(primaryId, dups, auth.user.email ?? null);
  if (!r.ok) return Response.json({ code: r.code, error: r.error }, { status: r.status });
  return Response.json(r);
}
