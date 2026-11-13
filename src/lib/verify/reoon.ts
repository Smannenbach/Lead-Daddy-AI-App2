// Reoon email verification (https://reoon.com)

export interface EmailVerdict {
  result: "valid" | "invalid" | "risky" | "unknown";
  raw: Record<string, unknown>;
}

export async function verifyEmail(email: string): Promise<EmailVerdict> {
  const key = process.env.REOON_API_KEY;
  if (!key) throw new Error("REOON_API_KEY not configured");
  const res = await fetch(
    `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}&mode=power`,
  );
  if (!res.ok) throw new Error(`Reoon error: HTTP ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  const status = String(j.status ?? "").toLowerCase();
  let result: EmailVerdict["result"] = "unknown";
  if (status === "valid" || status === "safe") result = "valid"; // Reoon "safe" = deliverable
  else if (["invalid", "disabled", "rejected", "unsafe"].includes(status)) result = "invalid";
  else if (["unknown", "risky", "catch_all", "role"].includes(status)) result = "risky";
  return { result, raw: j };
}

export interface ReoonBalance {
  daily: number | null;
  instant: number | null;
  total: number | null;
}

/**
 * Remaining Reoon credits (GET /api/v1/check-account-balance/?key=). Returns null
 * when the key is missing or the call fails; never throws, never spends a credit.
 */
export async function getReoonBalance(fetchImpl: typeof fetch = fetch): Promise<ReoonBalance | null> {
  const key = process.env.REOON_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchImpl(`https://emailverifier.reoon.com/api/v1/check-account-balance/?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
    const daily = num(j.remaining_daily_credits);
    const instant = num(j.remaining_instant_credits);
    return { daily, instant, total: daily === null && instant === null ? null : (daily ?? 0) + (instant ?? 0) };
  } catch {
    return null;
  }
}

/**
 * Credits one check costs. Reoon's docs don't state the power mode price, so this is a
 * setting, not a guess: VERIFY_EMAIL_CREDITS / VERIFY_PHONE_CREDITS. Unset -> null.
 * TODO(owner): confirm the per-check cost with Reoon and RealValidito, then set these.
 */
export function creditsPerCheck(kind: "email" | "phone"): number | null {
  const raw = kind === "email" ? process.env.VERIFY_EMAIL_CREDITS : process.env.VERIFY_PHONE_CREDITS;
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
