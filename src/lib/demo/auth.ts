// Sign-in stand-in for demo mode. Safe to import in the browser (no sample data here).
import { DEMO_USER } from "@/lib/demo/mode";

const ok = { error: null };

/** Auth stand-in: everyone is the demo user, every sign-in step "works". */
export function demoAuthClient() {
  const user = { ...DEMO_USER };
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      signInWithPassword: async () => ({ data: { user, session: { user } }, error: null }),
      signInWithOtp: async () => ({ data: {}, ...ok }),
      resetPasswordForEmail: async () => ({ data: {}, ...ok }),
      updateUser: async () => ({ data: { user }, ...ok }),
      exchangeCodeForSession: async () => ({ data: { user }, ...ok }),
      signOut: async () => ok,
    },
  };
}
