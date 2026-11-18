// Preview safe mode. On a Vercel *preview* deployment (VERCEL_ENV=preview), real
// outbound sends (texts, calls, emails) and paid verifications are turned off, so a
// work-in-progress copy can't contact a real lead or spend credits even if live keys
// are configured. Production (VERCEL_ENV=production) and local dev are unchanged.
//
//   LEAD_DADDY_ALLOW_PREVIEW_SENDS=true  -> allow them on previews anyway (on purpose)
//   LEAD_DADDY_DISABLE_SENDS=true        -> turn them off anywhere, production included

export class SendsDisabledError extends Error {
  readonly code = "sends_disabled";
  constructor(what: string) {
    super(`${what} is turned off in this preview. Nothing was sent or charged.`);
  }
}

export function sendsDisabledReason(env: Record<string, string | undefined> = process.env): string | null {
  if (env.LEAD_DADDY_DISABLE_SENDS === "true") return "LEAD_DADDY_DISABLE_SENDS=true";
  if (env.VERCEL_ENV === "preview" && env.LEAD_DADDY_ALLOW_PREVIEW_SENDS !== "true") return "Vercel preview deployment";
  return null;
}

/** Throws SendsDisabledError when outbound sends / paid checks are off. */
export function assertSendsAllowed(what: string): void {
  const reason = sendsDisabledReason();
  if (reason) {
    console.warn(`[send-guard] blocked ${what}: ${reason}`);
    throw new SendsDisabledError(what);
  }
}
