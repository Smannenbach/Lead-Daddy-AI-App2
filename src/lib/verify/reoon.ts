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
