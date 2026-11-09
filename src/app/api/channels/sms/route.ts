// Inbound SMS webhook: when a lead replies to a campaign text, Twilio posts here.
// We match the sender to a crm_contact, run the AI sales-caller for a reply,
// text it back via Twilio, and audit the exchange. STOP/opt-out is honored first.

import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { parseWebhook, sendSms } from "@/lib/channels/twilio";
import { isOptOut } from "@/lib/channels/optout";
import { guardedSendSms, phoneVariants, recordOptOut, supabaseSmsStore } from "@/lib/channels/sms-guard";
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
  const store = supabaseSmsStore(db, org);
  // A number can map to several contact rows (duplicates, different formats). Never use
  // maybeSingle() here: it errors on duplicates and the STOP would be silently dropped.
  const matches = await store.contactsByPhone(phoneVariants(from)).catch(() => []);
  const contact = matches[0] ?? null;

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
    try {
      await recordOptOut(store, from, now);
    } catch (err) {
      // Never swallow a refusal silently: surface it so Twilio retries and logs show it.
      console.error("opt-out persist failed", err);
      return new Response("opt-out persist failed", { status: 500 });
    }
    await guardedSendSms(
      store,
      from,
      "You have been opted out. No further messages from LeadDaddy.ai. Reply HELP for help.",
      { purpose: "optout_confirmation" },
      sendSms,
    );
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
  } catch (err) {
    console.error("sms reply failed", err);
  }

  // The guard logs the sms_outbound event and refuses opted-out numbers.
  await guardedSendSms(store, from, reply, { purpose: "reply" }, sendSms);
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
