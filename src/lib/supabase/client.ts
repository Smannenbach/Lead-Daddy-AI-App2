import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { isDemoMode } from "@/lib/demo/mode";
import { demoAuthClient } from "@/lib/demo/auth";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

export function createClient(): BrowserClient {
  // Demo mode: the built-in demo sign-in, no Supabase (see src/lib/demo/mode.ts).
  if (isDemoMode()) return demoAuthClient() as unknown as BrowserClient;
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
