// Helpers for tests that need a real Postgres. They run only under scripts/test-db.sh,
// which sets TEST_DATABASE_URL to a throwaway local database. Never the live project.
import { execFileSync } from "node:child_process";

export const DB_URL = process.env.TEST_DATABASE_URL ?? "";
export const hasDb = DB_URL !== "";

/** Runs SQL and returns rows as objects (via psql json output). */
export function sql<T = Record<string, unknown>>(query: string): T[] {
  const psql = process.env.TEST_PSQL ?? "psql";
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${query}) t`;
  const out = execFileSync(psql, [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", wrapped], { encoding: "utf8" });
  return JSON.parse(out.trim()) as T[];
}

/** Runs a statement with no result rows. Throws with the Postgres error on failure. */
export function exec(statement: string): void {
  const psql = process.env.TEST_PSQL ?? "psql";
  execFileSync(psql, [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-c", statement], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
