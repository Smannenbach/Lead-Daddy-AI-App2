import { serverError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth";
import { listRecords } from "@/lib/crm/server";

// GET /api/crm/records -> { records: CrmRecord[], truncated: boolean }
// Org-scoped, allowlisted. Powers the table + kanban views (client-side view engine).
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    return Response.json(await listRecords());
  } catch (e) {
    return serverError("crm GET", e);
  }
}
