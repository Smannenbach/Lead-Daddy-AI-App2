// Twilio: SMS send + outbound voice call with AI answer webhook.
import { assertSendsAllowed } from "@/lib/channels/send-guard";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

function basicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not configured");
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function fromNumber(): string {
  const from = process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_DEFAULT_FROM;
  if (!from) throw new Error("TWILIO_PHONE_NUMBER not configured");
  return from;
}

/**
 * Voice caller-ID pool: comma-separated E.164 numbers (TWILIO_SENDER_POOL).
 * Round-robins so outbound AI calls rotate across your Lead Daddy numbers.
 * NOTE: only include numbers whose inbound webhooks you accept — if a callee
 * calls back, their call hits that number's configured voice webhook.
 */
let poolCursor = 0;
export function senderPool(): string[] {
  return (process.env.TWILIO_SENDER_POOL ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function nextFromNumber(): string {
  const pool = senderPool();
  if (pool.length === 0) return fromNumber();
  const num = pool[poolCursor % pool.length];
  poolCursor += 1;
  return num;
}

async function twilioPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`${TWILIO_BASE}/Accounts/${sid}/${path}`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio error: HTTP ${res.status} ${text.slice(0, 300)}`);
  // Twilio returns XML or JSON depending on the extension; parse defensively
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

export async function sendSms(to: string, body: string): Promise<Record<string, unknown>> {
  assertSendsAllowed("Texting");
  return twilioPost("Messages.json", { To: to, From: fromNumber(), Body: body });
}

/** Outbound call: Twilio answers and fetches TwiML from our /api/channels/voice webhook. */
export async function startCall(to: string, context?: string): Promise<Record<string, unknown>> {
  assertSendsAllowed("Calling");
  const base = process.env.APP_BASE_URL; // e.g. https://leaddaddy-ai.vercel.app
  if (!base) throw new Error("APP_BASE_URL not configured (needed for voice webhook)");
  return twilioPost("Calls.json", {
    To: to,
    From: nextFromNumber(),
    Url: `${base}/api/channels/voice${context ? `?context=${encodeURIComponent(context.slice(0, 400))}` : ""}`,
  });
}

/** Parse Twilio's application/x-www-form-urlencoded webhook body. */
export async function parseWebhook(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text).entries());
}
