// Authorization: the live Base44 schema has no profiles table, so access is
// gated by an email allowlist (env ALLOWED_EMAILS) after normal Supabase auth.

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEMO_USER, isDemoMode } from "@/lib/demo/mode";

export const DEFAULT_ALLOWED_EMAILS = "steve@loandaddy.ai,mykoal@loandaddy.ai";

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? DEFAULT_ALLOWED_EMAILS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}

type AuthResult = { user: User } | { error: Response };

/** Signed-in user on the allowlist, or a ready-to-return 401/403 response. */
export async function requireUser(): Promise<AuthResult> {
  // Demo mode: sample data only, so the built-in demo user is always allowed in.
  if (isDemoMode()) return { user: { ...DEMO_USER } as unknown as User };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ code: "unauthorized", error: "Your session has expired. Sign in again." }, { status: 401 }) };
  if (!isAllowedEmail(user.email)) {
    return { error: Response.json({ code: "forbidden", error: "This account doesn't have access to Lead Daddy yet. Ask an admin to add it." }, { status: 403 }) };
  }
  return { user };
}
