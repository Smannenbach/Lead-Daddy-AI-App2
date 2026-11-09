// Twilio voice webhook: answers the call with an AI-driven conversation.
// Each Twilio turn asks this endpoint for the next TwiML; we stream AI speech via <Say> + <Gather>.

import { parseWebhook } from "@/lib/channels/twilio";
import { validateTwilioSignature } from "@/lib/twilio-signature";
import { callModel } from "@/lib/ai/providers";
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
  // Fail closed for unverified AI turns; still answer with benign TwiML so callers aren't dropped.
  if (!valid) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Please hold while we connect you.</Say><Hangup/></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  const speech = form.SpeechResult ?? "";

  let reply: string;
  if (!speech) {
    reply = "Hi, this is the LeadDaddy dot AI assistant calling about investment property financing. Are you the right person to speak with about that?";
  } else {
    try {
      const decision = autoSelect(speech, "sales-caller");
      const result = await callModel(decision.provider, [
        { role: "system", content: decision.agent!.systemPrompt + "\nContext: outbound cold call. Keep each turn under 2 sentences." },
        { role: "user", content: speech },
      ]);
      reply = result.text;
      await logAiRun({
        task: "voice_turn",
        provider: decision.provider,
        model: result.model,
        agent: decision.agent!.name,
        reason: decision.reason,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
    } catch {
      reply = "Sorry, I didn't catch that. Could you say that again?";
    }
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(reply)}</Say>
  <Gather input="speech" timeout="6" speechTimeout="auto" action="">
    <Say voice="Polly.Joanna"></Say>
  </Gather>
  <Say voice="Polly.Joanna">Thanks for your time. Have a great day.</Say>
  <Hangup/>
</Response>`;

  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function GET(request: Request) {
  return POST(request);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 900);
}
