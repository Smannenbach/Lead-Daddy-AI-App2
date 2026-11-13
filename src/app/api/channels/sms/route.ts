// Inbound SMS webhook: when a lead replies to a campaign text, Twilio posts here.
// We match the sender to a crm_contact, run the AI sales-caller for a reply,
// text it back via Twilio, and audit the exchange. STOP/opt-out is honored first.

import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { parseWebhook, sendSms } from "@/lib/channels/twilio";
import { isOptOut } from "@/lib/channels/optout";
import { revokeConsent } from "@/lib/consent";
import { validateTwilioSignature } from "@/lib/twilio-signature";
import { callModelWithFallback, enabledProviders } from "@/lib/ai/providers";
import { autoSelect } from "@/lib/ai/router";
import { logAiRun } from "@/lib/ai/log";

export async function POST(request: Request) {
  const form = await parseWebhook(request);
  const url = new URL(request.url);
  const valid = await validateTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    url: url.toString(),
    params: form,
    signatureHeader: request.headers.get("x-twilio-signature"),
  });
  if (!valid) return new Response("invalid signature", { status: 403 });

  const from = form.From ?? "";
  const bodyText = form.Body ?? "";
  if (!from || !bodyText) return new Response("ok", { status: 200 });

  const db = createServiceClient();
  const org = organizationId();
  const { data: contact } = await db
    .from("crm_contact")
    .select("id, custom_fields")
    .eq("organization_id", org)
    .eq("phone", from)
    .is("deleted_at", null)
    .maybeSingle();

  const now = new Date().toISOString();
  await db.from("lead_event").insert({
    unified_lead_id: null,
    event_type: "sms_inbound",
    detail: bodyText.slice(0, 300),
    data: { from, contactId: contact?.id ?? null },
    organization_id: org,
  });

  // Honor opt-out instantly and persist it.
  if (isOptOut(bodyText)) {
    if (contact) {
      const cf = (contact.custom_fields ?? {}) as Record<string, unknown>;
      await db
        .from("crm_contact")
        .update({
          custom_fields: { ...cf, tcpa_consent: "revoked", opted_out_at: now, consent_record: revokeConsent(cf.consent_record, now, "sms:STOP") },
          updated_date: now,
        })
        .eq("id", contact.id);
    }
    await sendSms(from, "You have been opted out. No further messages from LeadDaddy.ai. Reply HELP for help.");
    return twiml();
  }

  if (!contact) return twiml();

  // AI reply via the sales-caller persona.
  let reply = "Thanks — a specialist will follow up with you shortly.";
  try {
    const decision = autoSelect(bodyText, "sales-caller");
    const result = await callModelWithFallback(decision.provider, [
      { role: "system", content: decision.agent!.systemPrompt + "\nYou are replying by SMS: keep it under 300 characters, no markdown." },
      { role: "user", content: bodyText },
    ], enabledProviders());
    if (result.text.trim()) reply = result.text.slice(0, 450);
    await logAiRun({
      leadId: contact.id,
      task: "sms_reply",
      provider: decision.provider,
      model: result.model,
      agent: decision.agent!.name,
      reason: decision.reason,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
    await db.from("lead_event").insert({
      unified_lead_id: null,
      event_type: "sms_outbound",
      detail: reply.slice(0, 300),
      data: { to: from, contactId: contact.id, automated: true },
      organization_id: org,
    });
  } catch (err) {
    console.error("sms reply failed", err);
  }

  await sendSms(from, reply);
  return twiml();
}

function twiml(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET(request: Request) {
  return POST(request);
}
