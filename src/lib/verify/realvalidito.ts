// RealValidito phone validation (https://realvalidito.com)

export interface PhoneVerdict {
  result: "valid" | "invalid" | "risky" | "unknown";
  raw: Record<string, unknown>;
}

export async function verifyPhone(phone: string): Promise<PhoneVerdict> {
  const key = process.env.REALVALIDITO_API_KEY;
  if (key) {
    try {
      return await verifyViaRealValidito(key, phone);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/401|403|authentication|api_key|incorrect/i.test(msg)) throw err;
      // key dead (keys churn) — fall through to Twilio Lookup
    }
  }
  return verifyViaTwilioLookup(phone);
}

async function verifyViaRealValidito(key: string, phone: string): Promise<PhoneVerdict> {
  const res = await fetch(
    `https://api.realvalidito.com/v1/phone?api_key=${encodeURIComponent(key)}&phone=${encodeURIComponent(phone)}`,
  );
  if (!res.ok) throw new Error(`RealValidito error: HTTP ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  const valid = j.valid ?? j.status;
  let result: PhoneVerdict["result"] = "unknown";
  if (valid === true || String(valid).toLowerCase() === "valid") result = "valid";
  else if (valid === false || String(valid).toLowerCase() === "invalid") result = "invalid";
  return { result, raw: j };
}

/** Fallback: Twilio Lookup v2 carrier + line-type (~$0.005/lookup). */
export async function verifyViaTwilioLookup(phone: string): Promise<PhoneVerdict> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("No phone verification provider available (RealValidito key dead, Twilio missing)");
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=carrier,line_type_intelligence`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) throw new Error(`Twilio Lookup error: HTTP ${res.status}`);
  const j = (await res.json()) as {
    carrier?: { name?: string | null } | null;
    line_type_intelligence?: { type?: string | null } | null;
  };
  const hasCarrier = Boolean(j.carrier?.name);
  const lineType = j.line_type_intelligence?.type ?? null;
  const result: PhoneVerdict["result"] = hasCarrier && lineType !== "nonFixedVoicemail" ? "valid" : "invalid";
  return { result, raw: { ...j, provider: "twilio_lookup" } };
}
