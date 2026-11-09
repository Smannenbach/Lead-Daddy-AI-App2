// RealValidito phone validation (https://realvalidito.com)

export interface PhoneVerdict {
  result: "valid" | "invalid" | "risky" | "unknown";
  raw: Record<string, unknown>;
}

export async function verifyPhone(phone: string): Promise<PhoneVerdict> {
  const key = process.env.REALVALIDITO_API_KEY;
  if (!key) throw new Error("REALVALIDITO_API_KEY not configured");
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
