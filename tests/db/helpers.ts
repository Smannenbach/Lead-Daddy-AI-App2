// Helpers for tests that need a real Postgres. They run only under scripts/test-db.sh,
// which sets TEST_DATABASE_URL to a throwaway local database. Never the live project.
import { execFileSync } from "node:child_process";

const TEMPLATE_URL = process.env.TEST_DATABASE_URL ?? "";
export const hasDb = TEMPLATE_URL !== "";

/** Each test file gets its own copy of the template so files can't affect each other. */
function isolatedCopy(): string {
  if (!hasDb) return "";
  const psql = process.env.TEST_PSQL ?? "psql";
  const name = `t_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = TEMPLATE_URL.replace(/\/[^/]+$/, "/postgres");
  execFileSync(psql, [admin, "-v", "ON_ERROR_STOP=1", "-q", "-c", `create database ${name} template ld_template`]);
  return TEMPLATE_URL.replace(/\/[^/]+$/, `/${name}`);
}

export const DB_URL = isolatedCopy();

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
