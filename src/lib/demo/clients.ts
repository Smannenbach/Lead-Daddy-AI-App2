// Stand-ins for the Supabase clients in demo mode (see src/lib/demo/mode.ts).
import { MemoryDb } from "@/lib/demo/memory-db";
import { seedDemo } from "@/lib/demo/seed";

/** One seeded in-memory database per server instance (kept across hot reloads in dev). */
export function demoDb(): MemoryDb {
  const g = globalThis as unknown as { __leadDaddyDemoDb?: MemoryDb };
  if (!g.__leadDaddyDemoDb) {
    const db = new MemoryDb();
    seedDemo(db);
    g.__leadDaddyDemoDb = db;
  }
  return g.__leadDaddyDemoDb;
}

export { demoAuthClient } from "@/lib/demo/auth";
