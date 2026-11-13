import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { previewCampaign } from "@/lib/campaigns/recipients";

// GET /api/campaigns/:id/preview -> who a launch would reach and who would be skipped, and why.
// { campaignId, channels, recipients, found, missing, willReach, skipped: [{ leadId, name, channel, reason }] }
// Read only: sends nothing, spends nothing.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { data: campaign } = await createServiceClient()
    .from("marketing_campaign")
    .select("id, name, status, target_audience")
    .eq("id", id)
    .eq("organization_id", organizationId())
    .maybeSingle();
  if (!campaign) return Response.json({ code: "not_found", error: "Campaign not found." }, { status: 404 });
  return Response.json(await previewCampaign(campaign));
}
