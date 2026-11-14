import { requireUser } from "@/lib/auth";
import { apiError, serverError } from "@/lib/api/errors";
import { listRecords } from "@/lib/crm/server";
import { buildExport, exportFileName, resolveTimeZone } from "@/lib/crm/export";

// GET /api/crm/export?columns=first_name,last_name,email,custom.loan_type&tz=America/Phoenix
// -> text/csv attachment with every lead field (or just `columns`), dates and the file
//    name in the account time zone. Deleted leads are never included.
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const tz = resolveTimeZone(url.searchParams.get("tz"));
  const columns = url.searchParams.get("columns")?.split(",").map((c) => c.trim()).filter(Boolean) ?? null;

  let records;
  try {
    records = (await listRecords()).records;
  } catch (e) {
    return serverError("export", e);
  }
  const out = buildExport(records, { tz, columns });
  if (columns && out.columns.length === 0) return apiError("no_columns", "None of those columns exist. Leave columns empty to export everything.", 400);

  return new Response(out.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(new Date(), tz)}"`,
      "X-Export-Time-Zone": tz,
      "Cache-Control": "no-store",
    },
  });
}
