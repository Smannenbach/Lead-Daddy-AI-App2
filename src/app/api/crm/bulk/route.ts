import { requireUser } from "@/lib/auth";
import { sanitizePatch } from "@/lib/crm/model";
import { updateRecord } from "@/lib/crm/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BULK = 200;

// POST /api/crm/bulk  body: { ids: string[], patch: { stage?, tags?, assigned_to?, next_follow_up? } }
// Only a safe subset of fields can be bulk-edited. -> { updated, failed: [{ id, error }] }
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { ids?: unknown; patch?: Record<string, unknown> } | null;
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))] : [];
  if (ids.length === 0) return Response.json({ error: "ids required" }, { status: 400 });
  if (ids.length > MAX_BULK) return Response.json({ error: `at most ${MAX_BULK} records per bulk edit` }, { status: 400 });

  const allowed = ["stage", "tags", "assigned_to", "next_follow_up"];
  const raw = body?.patch && typeof body.patch === "object" ? body.patch : {};
  const picked = Object.fromEntries(Object.entries(raw).filter(([k]) => allowed.includes(k)));
  if (Object.keys(picked).length === 0) return Response.json({ error: `patch must include one of ${allowed.join(", ")}` }, { status: 400 });
  const patch = sanitizePatch(picked);
  if (patch.errors.length > 0) return Response.json({ errors: patch.errors }, { status: 400 });

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
