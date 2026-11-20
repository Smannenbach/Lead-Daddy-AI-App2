import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKIP = new Set(["NODE_ENV", "ORGANIZATION_ID", "VERCEL_ENV"]); // set by the platform, or a legacy alias

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe(".env.example", () => {
  const listed = new Set([...readFileSync(".env.example", "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

  it("lists every environment variable the code reads", () => {
    const used = new Set<string>();
    for (const f of files("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) used.add(m[1]);
      for (const m of src.matchAll(/"([A-Z][A-Z0-9_]*_(?:API_KEY|MODEL))"/g)) used.add(m[1]);
    }
    const missing = [...used].filter((v) => !SKIP.has(v) && !listed.has(v));
    expect(missing).toEqual([]);
  });

  it("holds names only, never values", () => {
    for (const line of readFileSync(".env.example", "utf8").split("\n")) {
      if (/^[A-Z]/.test(line)) expect(line).toMatch(/^[A-Z][A-Z0-9_]*=\s*(#.*)?$/);
    }
  });
});
