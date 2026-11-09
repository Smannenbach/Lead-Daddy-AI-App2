// The single chokepoint for outbound SMS. Every send goes through guardedSendSms, which:
//  1. blocks any number that ever opted out (a refusal belongs to the NUMBER, not one contact row),
//  2. requires TCPA consent for marketing sends,
//  3. caps marketing volume per day (A2P 10DLC is not registered yet; SMS_DAILY_CAP, default 100),
//  4. fails closed: if opt-out state can't be read, nothing is sent.
// The opt-out confirmation reply is the one send allowed to an opted-out number.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SmsPurpose = "marketing" | "reply" | "optout_confirmation";
export type SmsResult = { sent: true } | { sent: false; reason: "opted_out" | "no_consent" | "daily_cap" | "guard_unavailable" };

export interface SmsGuardStore {
  contactsByPhone(variants: string[]): Promise<{ id: string; custom_fields: Record<string, unknown> | null }[]>;
  hasOptOutEvent(canonical: string): Promise<boolean>;
  countOutboundSince(iso: string): Promise<number>;
  updateContactFields(id: string, fields: Record<string, unknown>): Promise<void>;
  logEvent(type: string, detail: string, data: Record<string, unknown>): Promise<void>;
}

const DEFAULT_CAP = 100;

export function smsDailyCap(): number {
  const raw = process.env.SMS_DAILY_CAP;
  if (raw === undefined || raw.trim() === "") return DEFAULT_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_CAP;
}

function tenDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return null;
}

/** E.164 for US numbers; "+digits" otherwise. */
export function canonicalPhone(raw: string): string {
  const ten = tenDigits(raw);
  if (ten) return `+1${ten}`;
  const d = raw.replace(/\D/g, "");
  return d ? `+${d}` : raw.trim();
}

/** Every format a contact row might have stored this number in. */
export function phoneVariants(raw: string): string[] {
  const out = new Set<string>([raw.trim(), canonicalPhone(raw)]);
  const ten = tenDigits(raw);
  if (ten) {
    const [a, b, c] = [ten.slice(0, 3), ten.slice(3, 6), ten.slice(6)];
    for (const f of [ten, `1${ten}`, `+1${ten}`, `(${a}) ${b}-${c}`, `${a}-${b}-${c}`, `${a}.${b}.${c}`, `+1 ${a} ${b} ${c}`]) out.add(f);
  }
  return [...out].filter(Boolean);
}

/** True if this number opted out (any contact row, or a number-level STOP record). Throws if unreadable. */
export async function isNumberOptedOut(store: SmsGuardStore, to: string): Promise<boolean> {
  return isOptedOut(store, to);
}

async function isOptedOut(store: SmsGuardStore, to: string): Promise<boolean> {
  const contacts = await store.contactsByPhone(phoneVariants(to));
  if (contacts.some((c) => (c.custom_fields ?? {}).tcpa_consent === "revoked")) return true;
  return store.hasOptOutEvent(canonicalPhone(to));
}

function startOfUtcDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function guardedSendSms(
  store: SmsGuardStore,
  to: string,
  body: string,
  opts: { purpose: SmsPurpose; consentGranted?: boolean },
  send: (to: string, body: string) => Promise<unknown>,
  now: Date = new Date(),
): Promise<SmsResult> {
  if (opts.purpose !== "optout_confirmation") {
    try {
      if (await isOptedOut(store, to)) return { sent: false, reason: "opted_out" };
      if (opts.purpose === "marketing") {
        if (opts.consentGranted !== true) return { sent: false, reason: "no_consent" };
        if ((await store.countOutboundSince(startOfUtcDay(now))) >= smsDailyCap()) {
          return { sent: false, reason: "daily_cap" };
        }
      }
    } catch {
      return { sent: false, reason: "guard_unavailable" };
    }
  }

  await send(to, body);
  await store
    .logEvent("sms_outbound", body.slice(0, 300), { to: canonicalPhone(to), purpose: opts.purpose })
    .catch(() => undefined);
  return { sent: true };
}

/** Honour STOP for the number: every matching contact, plus a number-level record. */
export async function recordOptOut(store: SmsGuardStore, from: string, nowIso: string): Promise<void> {
  const contacts = await store.contactsByPhone(phoneVariants(from));
  for (const c of contacts) {
    await store.updateContactFields(c.id, { ...(c.custom_fields ?? {}), tcpa_consent: "revoked", opted_out_at: nowIso });
  }
  await store.logEvent("sms_optout", "STOP received", { phone: canonicalPhone(from), contactIds: contacts.map((c) => c.id) });
}

/** Supabase-backed store over existing tables (crm_contact, lead_event) — no DDL. */
export function supabaseSmsStore(db: SupabaseClient, org: string): SmsGuardStore {
  return {
    async contactsByPhone(variants) {
      const { data, error } = await db
        .from("crm_contact")
        .select("id, custom_fields")
        .eq("organization_id", org)
        .in("phone", variants)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; custom_fields: Record<string, unknown> | null }[];
    },
    async hasOptOutEvent(canonical) {
      const { data, error } = await db
        .from("lead_event")
        .select("id")
        .eq("organization_id", org)
        .eq("event_type", "sms_optout")
        .eq("data->>phone", canonical)
        .limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async countOutboundSince(iso) {
      const { count, error } = await db
        .from("lead_event")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org)
        .eq("event_type", "sms_outbound")
        .gte("created_date", iso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async updateContactFields(id, fields) {
      const { error } = await db
        .from("crm_contact")
        .update({ custom_fields: fields, updated_date: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", org);
      if (error) throw new Error(error.message);
    },
    async logEvent(type, detail, data) {
      const { error } = await db
        .from("lead_event")
        .insert({ unified_lead_id: null, event_type: type, detail, data, organization_id: org });
      if (error) throw new Error(error.message);
    },
  };
}
