// Pure parsing of lead-verifier AI digests into structured people.
// The digest is model prose that SHOULD contain JSON (possibly wrapped in
// prose or markdown fences) describing people found on the scraped page.
// Everything here is pure — no network, no DB — so it is directly testable.

import type { CrmContact } from "@/lib/supabase/database.types";

export interface DigestPerson {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
}

export type ContactInsertRow = Pick<
  CrmContact,
  | "organization_id"
  | "first_name"
  | "last_name"
  | "company"
  | "job_title"
  | "email"
  | "phone"
  | "social_profiles"
  | "lead_source"
  | "stage"
  | "created_date"
  | "updated_date"
>;

export interface ContactInsertOptions {
  leadSource: string;
  orgId: string;
  now: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Accept strings and scalar JSON values (e.g. unquoted phone numbers), trimmed.
function asText(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

// Parse a balanced JSON value starting at `start` (which must be "{" or "[").
// String-aware bracket matching; returns null when the span is not valid JSON.
function tryParseJsonAt(text: string, start: number): unknown | null {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** First parseable JSON value in free text; undefined when nothing parses. */
export function extractJsonValue(text: string): unknown | undefined {
  const whole = text.trim();
  if (whole.length === 0) return undefined;
  try {
    return JSON.parse(whole);
  } catch {
    // fall through to substring scanning
  }
  for (let i = 0; i < whole.length; i++) {
    const ch = whole[i];
    if (ch !== "{" && ch !== "[") continue;
    const value = tryParseJsonAt(whole, i);
    if (value !== null) return value;
  }
  return undefined;
}

/**
 * Normalize one parsed object into a DigestPerson. `name` splits into
 * first/last (explicit first_name/last_name win); `title` aliases
 * `job_title`; `linkedin` falls back to `linkedin_url`. Returns null for
 * non-objects and for objects with no usable first_name (first_name is
 * required to create a lead).
 */
export function toDigestPerson(raw: unknown): DigestPerson | null {
  if (!isRecord(raw)) return null;
  let firstName = asText(raw.first_name);
  let lastName = asText(raw.last_name);
  if (!firstName) {
    const full = asText(raw.name) ?? asText(raw.full_name);
    if (full) {
      const parts = full.split(/\s+/);
      firstName = parts[0];
      if (parts.length > 1) lastName = parts.slice(1).join(" ");
    }
  }
  if (!firstName) return null;
  const email = asText(raw.email);
  return {
    first_name: firstName,
    last_name: lastName,
    email: email ? email.toLowerCase() : null,
    phone: asText(raw.phone),
    company: asText(raw.company),
    job_title: asText(raw.job_title) ?? asText(raw.title),
    linkedin_url: asText(raw.linkedin_url) ?? asText(raw.linkedin),
  };
}

/**
 * Pull the list of people out of a digest. Supports `{ people: [...] }`,
 * a bare array of people, or a single person object; JSON may be wrapped in
 * prose or markdown fences (the first parseable object wins). Entries that
 * are not usable people are dropped. Returns [] when the digest has no
 * parseable JSON — never throws.
 */
export function extractPeopleFromDigest(digest: string | null | undefined): DigestPerson[] {
  if (!digest) return [];
  const value = extractJsonValue(digest);
  if (value === undefined || value === null) return [];
  let list: unknown[];
  if (Array.isArray(value)) list = value;
  else if (isRecord(value) && Array.isArray(value.people)) list = value.people;
  else if (isRecord(value) && "people" in value) return [];
  else list = [value];
  const people: DigestPerson[] = [];
  for (const item of list) {
    const person = toDigestPerson(item);
    if (person) people.push(person);
  }
  return people;
}

/** Full crm_contact insert row for a digest person (first_name always set). */
export function personToContactInsert(person: DigestPerson, opts: ContactInsertOptions): ContactInsertRow {
  return {
    organization_id: opts.orgId,
    first_name: person.first_name,
    last_name: person.last_name,
    company: person.company,
    job_title: person.job_title,
    email: person.email,
    phone: person.phone,
    social_profiles: person.linkedin_url ? { linkedin: person.linkedin_url } : null,
    lead_source: opts.leadSource,
    stage: "new",
    created_date: opts.now,
    updated_date: opts.now,
  };
}
