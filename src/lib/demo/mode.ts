// Demo mode: the app runs on built-in sample data with a built-in sign-in, no Supabase.
// It switches on ONLY when NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE=true is set on the deployment.
// The live app never sets it, so it can't fall into demo mode by accident.
// NEXT_PUBLIC_ so the browser code (login page, sidebar) can read it too.

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE === "true";
}

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-00000000d3e0",
  email: "demo@leaddaddy.example",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: { full_name: "Demo User" },
  created_at: "2026-11-01T00:00:00.000Z",
} as const;
