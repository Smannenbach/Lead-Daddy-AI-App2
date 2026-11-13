// Server-only: loads a campaign's recipients with consent + verification status, for
// the launch gate and the pre-launch preview.
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { latestStatusByEmail, latestStatusByPhone } from "@/lib/verify/status";
import { campaignChannels, previewSkips, type Channel, type PreviewContact, type SequenceState } from "@/lib/campaigns/sequences";

type Db = ReturnType<typeof createServiceClient>;

export interface CampaignRow {
  id: string;
  name: string | null;
  status: string | null;
  target_audience: unknown;
  start_date?: string | null;
}

export interface Audience {
  leadIds: string[];
  channelSeq: string[];
  sequence: SequenceState;
  deletedAt?: string | null;
}

export function readAudience(ta: unknown): Audience {
  const o = (ta && typeof ta === "object" && !Array.isArray(ta) ? ta : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const seq = (o.sequence && typeof o.sequence === "object" ? o.sequence : {}) as Partial<SequenceState>;
  return {
    leadIds: arr(o.leadIds),
    channelSeq: arr(o.channelSeq),
    sequence: { steps: Array.isArray(seq.steps) ? seq.steps : [], launchedAt: seq.launchedAt ?? null, runs: Array.isArray(seq.runs) ? seq.runs : [] },
    deletedAt: typeof o.deleted_at === "string" ? o.deleted_at : null,
  };
}

export async function loadPreviewContacts(leadIds: string[], db: Db = createServiceClient()): Promise<PreviewContact[]> {
  if (leadIds.length === 0) return [];
  const { data } = await db
    .from("crm_contact")
    .select("id, first_name, last_name, email, phone, custom_fields")
    .eq("organization_id", organizationId())
    .in("id", leadIds)
    .is("deleted_at", null);
  const rows = (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; custom_fields: unknown }>;
  const [es, ps] = await Promise.all([
    latestStatusByEmail(rows.map((r) => r.email ?? "")),
    latestStatusByPhone(rows.map((r) => r.phone ?? "")),
  ]);
  return rows.map((r) => {
    const cf = (r.custom_fields ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Unnamed lead",
      tcpaConsent: cf.tcpa_consent === "granted",
      emailStatus: r.email ? es.get(r.email.trim().toLowerCase()) ?? "unverified" : "unverified",
      phoneStatus: r.phone ? ps.get(r.phone.trim().toLowerCase()) ?? "unverified" : "unverified",
    };
  });
}

export async function previewCampaign(campaign: CampaignRow, db?: Db) {
  const a = readAudience(campaign.target_audience);
  const channels: Channel[] = campaignChannels(a.sequence.steps, a.channelSeq);
  const contacts = await loadPreviewContacts(a.leadIds, db);
  const { willReach, skipped } = previewSkips(channels, contacts);
  return {
    campaignId: campaign.id,
    channels,
    recipients: a.leadIds.length,
    found: contacts.length,
    missing: a.leadIds.length - contacts.length,
    willReach,
    skipped,
  };
}
