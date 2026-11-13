// Pure validation for the public lead-capture endpoint. No network, no IO.
import { normalizePhone } from "@/lib/phone";
import { LIMITS, tooLong } from "@/lib/leads/limits";

export interface CaptureInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  company?: unknown;
  consent?: unknown;
  website?: unknown; // honeypot — must be empty
}

export interface CapturePayload {
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  company: string | null;
  consent: boolean;
}

export type CaptureError =
  | "honeypot"
  | "missing_contact"
  | "missing_email"
  | "missing_phone"
  | "bad_email"
  | "bad_phone"
  | "too_long";

export function validateCapture(input: CaptureInput): { ok: true; value: CapturePayload } | { ok: false; error: CaptureError } {
  if (typeof input.website === "string" && input.website.trim() !== "") {
    return { ok: false, error: "honeypot" };
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const company = typeof input.company === "string" ? input.company.trim() : "";
  if (name.length > LIMITS.first_name + LIMITS.last_name || tooLong("email", email) || phone.length > 40 || tooLong("financing_need", message) || tooLong("company", company)) {
    return { ok: false, error: "too_long" };
  }

  // Both are required on the public form (owner decision 2026-11-13). Consent stays optional.
  if (!email) return { ok: false, error: "missing_email" };
  if (!phone) return { ok: false, error: "missing_phone" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "bad_email" };
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone.ok) return { ok: false, error: "bad_phone" };

  return {
    ok: true,
    value: {
      name: name || (email ? email.split("@")[0] : "Visitor"),
      email: email || null,
      phone: normalizedPhone.value,
      message: message || null,
      company: company || null,
      consent: input.consent === true || input.consent === "true",
    },
  };
}

/** Stable idempotency key so re-submits of the same email don't duplicate. */
export function captureIdempotencyKey(email: string | null, phone: string | null): string {
  const raw = (email || phone || Math.random().toString(36)).trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `capture-${(h >>> 0).toString(16)}`;
}

/** Tells the page whether consent was given so it can show the right confirmation. */
export function captureResponse(id: string, consent: boolean, duplicate = false) {
  return { ok: true, id, consent: { given: consent }, ...(duplicate ? { duplicate: true } : {}) };
}
