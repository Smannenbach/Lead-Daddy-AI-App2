// Phone validation + normalization used by EVERY lead write path (inline edit, record
// page, Add a lead, CSV import, public form). Stored format is E.164 ("+16025550100")
// so verification lookups, dedupe and Twilio all see the same value.
//
// Rules (US-first, international allowed with a leading +):
//   * formatting characters ( ) - . space are ignored
//   * 10 digits                -> +1 + digits (US/Canada)
//   * 11 digits starting with 1 -> +digits
//   * +country code, 8 to 15 digits total -> kept as +digits
//   * anything else (letters, too short, too long) is rejected

export const PHONE_ERROR = "Enter a valid phone number, like (602) 555-0100.";

export function normalizePhone(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string" && typeof input !== "number") return { ok: false, error: PHONE_ERROR };
  const raw = String(input).trim();
  if (raw === "") return { ok: true, value: null };
  if (!/^\+?[\d\s().-]+$/.test(raw)) return { ok: false, error: PHONE_ERROR };
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return { ok: false, error: PHONE_ERROR };
    return { ok: true, value: `+${digits}` };
  }
  if (digits.length === 10 && /^[2-9]/.test(digits)) return { ok: true, value: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits.slice(1))) return { ok: true, value: `+${digits}` };
  return { ok: false, error: PHONE_ERROR };
}
