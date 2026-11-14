import { requireUser } from "@/lib/auth";
import { softDeleteCampaign } from "@/lib/crm/delete";

// DELETE /api/campaigns/:id -> { ok }. Soft delete: hidden from the list and stopped
// (status 'deleted', so the cron runner skips it). Nothing already sent is undone.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const r = await softDeleteCampaign(id, auth.user.email ?? null);
  if (!r.ok) return Response.json({ code: "not_found", error: "Campaign not found." }, { status: 404 });
  return Response.json({ ok: true });
}
