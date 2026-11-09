import { createServiceClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { nextDueStep, skipReason, type SequenceState, type StepRun, type Channel } from "@/lib/campaigns/sequences";
import { latestStatusByEmail, latestStatusByPhone } from "@/lib/verify/status";
import { sendEmail } from "@/lib/channels/email";
import { sendSms, startCall } from "@/lib/channels/twilio";

interface TargetAudience {
  leadIds?: string[];
  channelSeq?: Channel[];
  sequence?: SequenceState;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Authorized via signed-in allowlisted user OR server-to-server secret
  // (dedicated CRON_SECRET, falling back to the service role).
  const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const isCron = Boolean(cronSecret) && request.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
  }

  const db = createServiceClient();
  const { data: campaign } = await db
    .from("marketing_campaign")
    .select("id, name, status, target_audience")
    .eq("id", id)
    .eq("organization_id", organizationId())
    .single();
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "live") return Response.json({ error: "Campaign is not live" }, { status: 409 });

  const ta = (campaign.target_audience ?? {}) as TargetAudience;
  const state: SequenceState = ta.sequence ?? { steps: [], launchedAt: null, runs: [] };
  const leadIds = ta.leadIds ?? [];
  if (leadIds.length === 0) return Response.json({ error: "No recipients" }, { status: 400 });

  const stepIndex = nextDueStep(state, new Date());
  if (stepIndex === null) return Response.json({ advanced: false, reason: "no due step" });
  const step = state.steps[stepIndex];

  const { data: contacts } = await db
    .from("crm_contact")
    .select("id, email, phone, custom_fields")
    .in("id", leadIds)
    .eq("organization_id", organizationId())
    .is("deleted_at", null);
  const list = contacts ?? [];

  const emailStatus = await latestStatusByEmail(list.map((c) => c.email).filter(Boolean) as string[]);
  const phoneStatus = await latestStatusByPhone(list.map((c) => c.phone).filter(Boolean) as string[]);

  const runs: StepRun[] = [];
  for (const contact of list) {
    const cf = (contact.custom_fields ?? {}) as Record<string, unknown>;
    const tcpaConsent = cf.tcpa_consent === "granted";
    const eStatus = contact.email ? emailStatus.get(contact.email.toLowerCase()) ?? "unverified" : "unverified";
    const pStatus = contact.phone ? phoneStatus.get(contact.phone.toLowerCase()) ?? "unverified" : "unverified";

    const skip = skipReason({ channel: step.channel, tcpaConsent, emailStatus: eStatus, phoneStatus: pStatus });
    if (skip) {
      runs.push({ leadId: contact.id, stepIndex, status: skip, at: new Date().toISOString() });
      continue;
    }

    try {
      if (step.channel === "email" && contact.email) {
        await sendEmail({ to: contact.email, subject: step.subject ?? "A note from LeadDaddy.ai", html: step.body });
      } else if (step.channel === "sms" && contact.phone) {
        await sendSms(contact.phone, step.body);
      } else if (step.channel === "call" && contact.phone) {
        await startCall(contact.phone, step.body);
      }
      runs.push({ leadId: contact.id, stepIndex, status: "sent", at: new Date().toISOString() });
      await db.from("lead_event").insert({
        unified_lead_id: null,
        event_type: "campaign_step",
        detail: `${step.channel} step ${stepIndex} sent via campaign '${campaign.name}'`,
        data: { campaignId: id, stepIndex, channel: step.channel },
        organization_id: organizationId(),
      });
    } catch (err) {
      runs.push({
        leadId: contact.id,
        stepIndex,
        status: "failed",
        at: new Date().toISOString(),
        detail: err instanceof Error ? err.message.slice(0, 200) : "send failed",
      });
    }
  }

  const updated: SequenceState = { ...state, runs: [...state.runs, ...runs] };
  await db
    .from("marketing_campaign")
    .update({ target_audience: { ...ta, sequence: updated }, updated_date: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId());

  const sent = runs.filter((r) => r.status === "sent").length;
  return Response.json({ advanced: true, stepIndex, channel: step.channel, sent, skipped: runs.length - sent });
}
