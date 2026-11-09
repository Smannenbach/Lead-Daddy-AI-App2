// Latest verification status lookups against the live Base44 verification tables.
// Keys are normalized (lowercased, trimmed); a value with no rows maps to "unverified".

import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";

function normalize(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

function pickLatest(rows: Array<{ verification_status: string | null; verification_date: string | null; created_date: string }>): string {
  let bestTs = "";
  let best: string | null = null;
  for (const r of rows) {
    const ts = r.verification_date ?? r.created_date;
    if (ts >= bestTs) {
      bestTs = ts;
      best = r.verification_status;
    }
  }
  return best ?? "unverified";
}

export async function latestStatusByEmail(emails: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const list = normalize(emails);
  if (list.length === 0) return map;
  const db = createServiceClient();
  const { data, error } = await db
    .from("email_verification")
    .select("email, verification_status, verification_date, created_date")
    .eq("organization_id", organizationId())
    .in("email", list);
  if (error) return map;
  const rows = data ?? [];
  for (const value of list) {
    map.set(value, pickLatest(rows.filter((r) => (r.email ?? "").toLowerCase() === value)));
  }
  return map;
}

export async function latestStatusByPhone(phones: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const list = normalize(phones);
  if (list.length === 0) return map;
  const db = createServiceClient();
  const { data, error } = await db
    .from("phone_verification")
    .select("phone_number, verification_status, verification_date, created_date")
    .eq("organization_id", organizationId())
    .in("phone_number", list);
  if (error) return map;
  const rows = data ?? [];
  for (const value of list) {
    map.set(value, pickLatest(rows.filter((r) => (r.phone_number ?? "").toLowerCase() === value)));
  }
  return map;
}
