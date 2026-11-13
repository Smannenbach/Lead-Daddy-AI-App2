// Max lengths for lead text fields. The API rejects longer values with a plain message
// (it no longer truncates silently). Migration 20261113000200 adds the same limits in
// the database as a backstop (phone is looser there because Base44 may store formatting).
export const LIMITS = {
  first_name: 100,
  last_name: 100,
  company: 200,
  job_title: 150,
  email: 254, // RFC 5321 practical max
  phone: 20, // after normalization to E.164 (max 16)
  lead_source: 100,
  assigned_to: 254, // usually an email
  notes: 10000,
  note: 4000, // one Activity note
  tag: 40,
  custom_value: 500,
  financing_need: 2000,
  campaign_name: 200,
} as const;

export const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  job_title: "Title",
  email: "Email",
  phone: "Phone",
  lead_source: "Source",
  assigned_to: "Owner",
  notes: "Notes",
  note: "Note",
  tag: "Each tag",
  custom_value: "Custom field value",
  financing_need: "Financing answer",
  campaign_name: "Campaign name",
};

export function tooLong(field: keyof typeof LIMITS, value: string | null | undefined): string | null {
  if (!value || value.length <= LIMITS[field]) return null;
  return `${FIELD_LABELS[field] ?? field} can be up to ${LIMITS[field]} characters.`;
}
