import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (globalThis as { __leadDaddyDemoDb?: unknown }).__leadDaddyDemoDb;
});

describe("demo mode ON (NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE=true)", () => {
  it("runs on sample data with no Supabase keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { listRecords } = await import("@/lib/crm/server");
    const { records } = await listRecords();
    expect(records).toHaveLength(12);
    expect(records.every((r) => r.email?.endsWith("@example.com"))).toBe(true); // fictional people only
    expect(new Set(records.map((r) => r.stage))).toEqual(new Set(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]));
  });

  it("lets the demo user in, everywhere", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", "true");
    const { requireUser } = await import("@/lib/auth");
    const r = await requireUser();
    expect("user" in r && r.user.email).toBe("demo@leaddaddy.example");
    const { proxy } = await import("@/proxy");
    expect((await proxy(new NextRequest("https://x.vercel.app/crm"))).status).toBe(200);
  });

  it("never sends, even with real looking keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("LEAD_DADDY_ALLOW_PREVIEW_SENDS", "true");
    const { sendsDisabledReason } = await import("@/lib/channels/send-guard");
    expect(sendsDisabledReason()).toBe("demo mode");
  });

  it("health check says ok and demo", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", "true");
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "up", demo: true });
  });

  it("edits stick for the life of the server", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", "true");
    const { listRecords, updateRecord } = await import("@/lib/crm/server");
    const { sanitizePatch } = await import("@/lib/crm/model");
    const [first] = (await listRecords()).records;
    const r = await updateRecord(first.id, sanitizePatch({ stage: "won" }), "demo@leaddaddy.example", first.updated_date);
    expect(r.ok).toBe(true);
    expect((await listRecords()).records.find((x) => x.id === first.id)?.stage).toBe("won");
  });
});

describe("demo mode OFF (the live app)", () => {
  it("uses the real Supabase client and real sign-in rules", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test");
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { MemoryDb } = await import("@/lib/demo/memory-db");
    expect(createServiceClient()).not.toBeInstanceOf(MemoryDb);
    const { isDemoMode } = await import("@/lib/demo/mode");
    expect(isDemoMode()).toBe(false);
    for (const v of ["1", "yes", "TRUE", "on"]) {
      vi.stubEnv("NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE", v);
      expect(isDemoMode()).toBe(false); // only the exact value "true" switches it on
    }
  });
});
