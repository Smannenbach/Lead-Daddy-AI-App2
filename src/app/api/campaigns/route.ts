import { requireUser } from "@/lib/auth";
import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { sendSms } from "@/lib/channels/twilio";
import { sendEmail } from "@/lib/channels/email";
import { latestStatusByEmail, latestStatusByPhone } from "@/lib/verify/status";
import type { SequenceState, SequenceStep } from "@/lib/campaigns/sequences";
import { previewCampaign, readAudience } from "@/lib/campaigns/recipients";
import { tooLong } from "@/lib/leads/limits";

interface LaunchBody {
  name: string;
  channelSeq?: string[]; // ordered: sms | email | call
  leadIds?: string[];
  steps?: SequenceStep[]; // full sequence (channel/offset/body[/subject]); empty = fill at launch
  brief?: string; // what the campaign is about (used when generateCopy)
  generateCopy?: boolean; // AI-write step bodies via the campaign-writer agent
}

/** New campaigns are email only unless the user picks texts or calls on purpose. */
export const DEFAULT_CHANNELS = ["email"] as const;

// Live schema has no campaign_recipients table; recipients, channel sequence and the
// sequence-runner state live in marketing_campaign.target_audience (jsonb):
//   { leadIds: string[], channelSeq: string[], sequence: SequenceState }
interface TargetAudience {
  leadIds?: unknown;
  channelSeq?: unknown;
  sequence?: unknown;
}

// GET /api/campaigns -> { campaigns: [{ id, name, status, recipients, steps, channels, sent, skipped, pendingSteps, launchedAt, startDate }] }
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const db = createServiceClient();
  const { data, error } = await db
    .from("marketing_campaign")
    .select("id, name, status, target_audience, start_date")
    .eq("organization_id", organizationId())
    .order("created_date", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const campaigns = (data ?? []).filter((c) => !readAudience(c.target_audience).deletedAt && c.status !== "deleted").map((c) => {
    const ta = (c.target_audience ?? {}) as { leadIds?: string[]; sequence?: SequenceState };
    const seq = ta.sequence ?? { steps: [], launchedAt: null, runs: [] };
    const doneSteps = new Set(
      seq.runs.filter((r) => r.status === "sent" || r.status === "failed").map((r) => r.stepIndex),
    );
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      recipients: ta.leadIds?.length ?? 0,
      steps: seq.steps.length,
      channels: seq.steps.map((s) => s.channel),
      sent: seq.runs.filter((r) => r.status === "sent").length,
      skipped: seq.runs.filter((r) => r.status.startsWith("skipped")).length,
      pendingSteps: seq.steps.length - doneSteps.size,
      launchedAt: seq.launchedAt,
      startDate: c.start_date,
    };
  });

  return Response.json({ campaigns });
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

async function logCampaignEvent(eventType: string, detail: string, data: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createServiceClient().from("lead_event").insert({
    event_type: eventType,
    detail,
    data,
    organization_id: organizationId(),
    created_date: now,
    updated_date: now,
  });
  if (error) console.error("lead_event insert failed", error.message);
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as LaunchBody | null;
  if (!body?.name?.trim()) return Response.json({ code: "name_required", error: "Give the campaign a name." }, { status: 400 });
  if (tooLong("campaign_name", body.name.trim())) {
    return Response.json({ code: "too_long", error: tooLong("campaign_name", body.name.trim()) }, { status: 400 });
  }

  const now = new Date().toISOString();
  const db = createServiceClient();

  let steps = body.steps ?? [];
  if (steps.length === 0 && body.generateCopy) {
    const generated = await generateCampaignSteps(body.name.trim(), body.brief ?? "", asStringArray(body.channelSeq).length > 0 ? asStringArray(body.channelSeq) as ("email" | "sms" | "call")[] : [...DEFAULT_CHANNELS]);
    if ("error" in generated) return Response.json({ error: generated.error }, { status: 502 });
    steps = generated.steps;
  }

  const { data: campaign, error } = await db
    .from("marketing_campaign")
    .insert({
      organization_id: organizationId(),
      name: body.name.trim(),
      status: "draft",
      target_audience: {
        leadIds: body.leadIds ?? [],
        channelSeq: asStringArray(body.channelSeq).length > 0 ? asStringArray(body.channelSeq) : [...DEFAULT_CHANNELS],
        sequence: { steps, launchedAt: null, runs: [] } satisfies SequenceState,
      },
      created_date: now,
      updated_date: now,
    })
    .select("id")
    .single();
  if (error || !campaign) return Response.json({ error: error?.message ?? "create failed" }, { status: 500 });

  return Response.json({ id: campaign.id, status: "draft" }, { status: 201 });
}

/** Ask the campaign-writer agent for per-channel copy; build the step sequence from it. */
async function generateCampaignSteps(
  name: string,
  brief: string,
  channels: ("email" | "sms" | "call")[],
): Promise<{ steps: SequenceStep[] } | { error: string }> {
  const { autoSelect } = await import("@/lib/ai/router");
  const { callModelWithFallback, enabledProviders } = await import("@/lib/ai/providers");
  const { assertAiBudget, logAiRun } = await import("@/lib/ai/log");
  const { buildSteps } = await import("@/lib/campaigns/sequences");

  try {
    await assertAiBudget();
    const decision = autoSelect("campaign outreach copy sequence", "campaign-writer");
    const result = await callModelWithFallback(decision.provider, [
      { role: "system", content: decision.agent!.systemPrompt },
      {
        role: "user",
        content: [
          `Campaign name: ${name}`,
          `Brief: ${brief || "DSCR investment-property lending outreach for the Black Friday/Cyber Monday offer (waived processing fee)."}`,
          `Channels needed (in order): ${channels.join(", ")}.`,
          "For EACH channel return exactly one field in compact JSON:",
          channels.includes("email") ? '- "email_subject": subject line, "email": HTML-free email body with opt-out line' : "",
          channels.includes("sms") ? '- "sms": max 300 chars, include opt-out ("reply STOP")' : "",
          channels.includes("call") ? '- "call": a 2-sentence spoken opener for the AI voice agent' : "",
          "JSON only, no prose.",
        ].filter(Boolean).join("\n"),
      },
    ], enabledProviders());
    await logAiRun({
      task: "campaign_copy",
      provider: decision.provider,
      model: result.model,
      agent: decision.agent!.name,
      reason: decision.reason,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    const parsed = extractJsonValue(result.text) as Record<string, unknown> | null | undefined;
    if (!parsed) return { error: "AI copy could not be parsed; provide steps manually" };
    const bodies = {
      email: typeof parsed.email === "string" ? parsed.email : "(email body pending)",
      sms: typeof parsed.sms === "string" ? parsed.sms : "(sms body pending)",
      call: typeof parsed.call === "string" ? parsed.call : "(call opener pending)",
    };
    return {
      steps: buildSteps({
        channelSeq: channels,
        bodies,
        subjects: typeof parsed.email_subject === "string" ? { email: parsed.email_subject } : undefined,
      }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "copy generation failed" };
  }
}

/** First balanced-brace {...} JSON object in arbitrary text. */
import { extractJsonValue } from "@/lib/scrape/digest";

/** Launch: every recipient must have a "valid" latest verification for the first channel. */
export async function PATCH(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { campaignId?: string; action?: "launch"; acknowledgeSkips?: boolean } | null;
  if (body?.action !== "launch" || !body.campaignId) {
    return Response.json({ error: "action=launch and campaignId are required" }, { status: 400 });
  }

  const db = createServiceClient();
  const orgId = organizationId();
  const { data: campaign } = await db
    .from("marketing_campaign")
    .select("id, name, status, target_audience, start_date")
    .eq("id", body.campaignId)
    .eq("organization_id", orgId)
    .single();
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status === "live") {
    return Response.json({ id: campaign.id, status: "live" }); // idempotent relaunch
  }

  const audience = (campaign.target_audience ?? {}) as TargetAudience;
  const leadIds = asStringArray(audience.leadIds);
  if (leadIds.length === 0) {
    return Response.json({ error: "Add recipients before launching" }, { status: 400 });
  }

  const { data: contacts } = await db
    .from("crm_contact")
    .select("id, email, phone")
    .eq("organization_id", orgId)
    .in("id", leadIds)
    .is("deleted_at", null);
  const found = contacts ?? [];
  if (found.length < leadIds.length) {
    const foundIds = new Set(found.map((c) => c.id));
    return Response.json(
      { error: "Some recipients no longer exist", missingLeadIds: leadIds.filter((id) => !foundIds.has(id)) },
      { status: 409 },
    );
  }

  const channelSeq = asStringArray(audience.channelSeq);
  const firstChannel = channelSeq[0] ?? "email";
  const missing: string[] = [];
  if (firstChannel === "email") {
    const statuses = await latestStatusByEmail(found.map((c) => c.email ?? ""));
    for (const c of found) {
      if (statuses.get((c.email ?? "").trim().toLowerCase()) !== "valid") missing.push(c.id);
    }
  } else if (firstChannel === "sms" || firstChannel === "call") {
    const statuses = await latestStatusByPhone(found.map((c) => c.phone ?? ""));
    for (const c of found) {
      if (statuses.get((c.phone ?? "").trim().toLowerCase()) !== "valid") missing.push(c.id);
    }
  }
  if (missing.length > 0) {
    return Response.json(
      { error: `${missing.length} lead(s) lack a valid ${firstChannel === "email" ? "email" : "phone"} verification; verify before launch`, missingLeadIds: missing },
      { status: 409 },
    );
  }

  // Consent gate: texts and calls never go to a lead without consent. The send step
  // skips them too; this makes the user see and accept that BEFORE anything goes out.
  const preview = await previewCampaign(campaign);
  const consentSkips = preview.skipped.filter((s) => s.channel !== "email");
  if (consentSkips.length > 0 && body.acknowledgeSkips !== true) {
    return Response.json(
      {
        code: "recipients_will_be_skipped",
        error: `${new Set(consentSkips.map((s) => s.leadId)).size} recipient(s) can't get texts or calls. Review who will be skipped, then launch again to confirm.`,
        preview,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const prior = (campaign.target_audience ?? {}) as TargetAudience;
  const sequence = (prior.sequence ?? { steps: [], launchedAt: null, runs: [] }) as SequenceState;
  await db
    .from("marketing_campaign")
    .update({
      status: "live",
      start_date: campaign.start_date ?? now,
      updated_date: now,
      target_audience: {
        ...prior,
        sequence: { ...sequence, launchedAt: sequence.launchedAt ?? now },
      },
    })
    .eq("id", campaign.id);
  await logCampaignEvent("campaign_launched", `Campaign '${campaign.name}' launched: ${leadIds.length} recipients, first channel ${firstChannel}`, {
    campaignId: campaign.id,
    recipients: leadIds.length,
    firstChannel,
  });

  return Response.json({ id: campaign.id, status: "live", recipients: leadIds.length });
}

// Direct one-off send to ONE existing lead. The address always comes from the lead
// record (never from the request), texts need consent on file, and opted-out leads
// are refused. Used by the console; there is no free-form "send to any number" path.
export async function PUT(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { channel?: "sms" | "email"; text?: string; subject?: string; leadId?: string }
    | null;
  if ((body?.channel !== "sms" && body?.channel !== "email") || !body.leadId || !body.text?.trim()) {
    return Response.json({ code: "invalid_request", error: "Pick a lead, a channel and a message." }, { status: 400 });
  }

  const { data: lead } = await createServiceClient()
    .from("crm_contact")
    .select("id, email, phone, custom_fields")
    .eq("id", body.leadId)
    .eq("organization_id", organizationId())
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return Response.json({ code: "not_found", error: "That lead no longer exists." }, { status: 404 });

  const cf = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const to = body.channel === "sms" ? lead.phone : lead.email;
  if (!to) return Response.json({ code: "missing_contact", error: `This lead has no ${body.channel === "sms" ? "phone number" : "email"}.` }, { status: 400 });
  if (body.channel === "sms" && cf.tcpa_consent !== "granted") {
    return Response.json({ code: "no_consent", error: "This lead hasn't given consent for texts." }, { status: 403 });
  }

  try {
    if (body.channel === "sms") await sendSms(to, body.text);
    else await sendEmail({ to, subject: body.subject ?? "A note from Lead Daddy", html: body.text });
    await logCampaignEvent("channel_send", `[${body.channel}] to lead ${lead.id}: ${body.text.slice(0, 500)}`, {
      channel: body.channel,
      leadId: lead.id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[campaigns PUT] send failed", err instanceof Error ? err.message : err);
    return Response.json({ code: "send_failed", error: "That message didn't send. Try again in a minute." }, { status: 502 });
  }
}
