import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { isDemoMode } from "@/lib/demo/mode";
import { demoAuthClient, demoDb } from "@/lib/demo/clients";

// Anon cookie client — auth only (getUser/session). Base44 RLS blocks the anon key
// on business tables, so API routes never query data through this client.
export async function createClient() {
  if (isDemoMode()) return demoAuthClient() as unknown as ReturnType<typeof createServerClient<Database>>;
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // server component context; proxy refreshes sessions
          }
        },
      },
    },
  );
}

// Service-role client — ALL data access in API routes goes through this AFTER the
// route verifies the user and checks the email allowlist (src/lib/auth.ts).
// Never import this from client components or expose it to the browser.
export function createServiceClient() {
  if (isDemoMode()) return demoDb() as unknown as ReturnType<typeof createSupabaseClient<Database>>;
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
