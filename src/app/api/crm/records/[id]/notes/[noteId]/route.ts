import { requireUser } from "@/lib/auth";
import { deleteNote } from "@/lib/crm/delete";

// DELETE /api/crm/records/:id/notes/:noteId -> { ok }
// noteId is the `id` each timeline entry has in GET /api/crm/records/:id.
// Only notes can be deleted; system Activity (stage changes, verifications) is kept.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id, noteId } = await params;
  const r = await deleteNote(id, noteId, auth.user.email ?? null);
  if (!r.ok) return Response.json({ code: r.code, error: r.error }, { status: r.status });
  return Response.json({ ok: true });
}
