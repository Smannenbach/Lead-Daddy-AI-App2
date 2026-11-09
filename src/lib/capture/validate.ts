// Pure validation for the public lead-capture endpoint. No network, no IO.

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
  | "bad_email"
  | "bad_phone";

export function validateCapture(input: CaptureInput): { ok: true; value: CapturePayload } | { ok: false; error: CaptureError } {
  if (typeof input.website === "string" && input.website.trim() !== "") {
    return { ok: false, error: "honeypot" };
  }
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 200) : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 320) : "";
  const phone = typeof input.phone === "string" ? input.phone.trim().slice(0, 40) : "";
  const message = typeof input.message === "string" ? input.message.trim().slice(0, 2000) : "";
  const company = typeof input.company === "string" ? input.company.trim().slice(0, 200) : "";

  if (!email && !phone) return { ok: false, error: "missing_contact" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "bad_email" };
  if (phone && !/^[+()\-.\s\d]{7,20}$/.test(phone)) return { ok: false, error: "bad_phone" };

  return {
    ok: true,
    value: {
      name: name || (email ? email.split("@")[0] : "Visitor"),
      email: email || null,
      phone: phone || null,
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
