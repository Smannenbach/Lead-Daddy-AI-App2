// Consent record: HOW consent was given, WHERE, the EXACT wording shown, and WHEN.
//
// Stored in crm_contact.custom_fields.consent_record (jsonb, no schema change), next to
// the existing custom_fields.tcpa_consent status that the send gates read. Existing
// leads are not back filled: they keep tcpa_consent only and have no consent_record.
//
// TODO(counsel): this file needs legal review before it is relied on. In particular:
//   * whether the wording below is adequate consent for texts and autodialed calls;
//   * whether a rep ticking a box ("rep_attested") is acceptable proof of consent;
//   * how long records must be kept, and whether IP / user agent should be captured.
// Do not edit the wording text here to "improve" it. Each entry is the exact text
// shown at the time; new wording gets a NEW version key so old records stay accurate.

export type ConsentMethod = "web_form" | "rep_attested" | "rep_attested_import" | "sms_keyword";

/** Exact wording shown to the person or rep, copied verbatim from the UI that showed it. */
export const CONSENT_WORDING: Readonly<Record<string, string>> = {
  // src/app/bfcm/page.tsx checkbox, as of 2026-11-13
  "bfcm-form-2026-11":
    "I agree to be contacted by phone, SMS, and email about this offer (TCPA consent). Message & data rates may apply; opt out anytime.",
  // "Add a lead" checkbox (src/components/app/LeadTools.tsx, was src/app/page.tsx), as of 2026-11-13
  "console-add-lead-2026-11": "Lead granted TCPA consent for SMS/call outreach",
  // CSV import has no consent wording of its own: the rep attests for the whole file.
  "csv-import-2026-11": "Lead granted TCPA consent for SMS/call outreach (applied to every row of the import)",
};

export interface ConsentRecord {
  status: "granted" | "none" | "revoked";
  method: ConsentMethod;
  source: string; // page URL or app surface, e.g. "console:add-lead"
  wording_version: string | null; // key into CONSENT_WORDING, null when no wording was shown
  wording_text: string | null; // the text itself, so the record stands alone
  at: string; // ISO timestamp the consent (or refusal / revocation) was recorded
  captured_by: string | null; // rep email for rep_attested, null for a public form
  revoked_at?: string | null;
}

export function consentRecord(opts: {
  granted: boolean;
  method: ConsentMethod;
  source: string;
  wordingVersion: keyof typeof CONSENT_WORDING | null;
  at: string;
  capturedBy?: string | null;
}): ConsentRecord {
  return {
    status: opts.granted ? "granted" : "none",
    method: opts.method,
    source: opts.source.slice(0, 500),
    wording_version: opts.wordingVersion,
    wording_text: opts.wordingVersion ? CONSENT_WORDING[opts.wordingVersion] ?? null : null,
    at: opts.at,
    captured_by: opts.capturedBy ?? null,
  };
}

/** Marks an existing record revoked (STOP reply). Keeps how it was first given. */
export function revokeConsent(existing: unknown, at: string, source: string): ConsentRecord {
  const prior = existing && typeof existing === "object" ? (existing as Partial<ConsentRecord>) : {};
  return {
    status: "revoked",
    method: prior.method ?? "sms_keyword",
    source: prior.source ?? source,
    wording_version: prior.wording_version ?? null,
    wording_text: prior.wording_text ?? null,
    at: prior.at ?? at,
    captured_by: prior.captured_by ?? null,
    revoked_at: at,
  };
}

export function readConsentRecord(customFields: unknown): ConsentRecord | null {
  const cf = customFields && typeof customFields === "object" ? (customFields as Record<string, unknown>) : {};
  const r = cf.consent_record;
  return r && typeof r === "object" && !Array.isArray(r) ? (r as ConsentRecord) : null;
}
