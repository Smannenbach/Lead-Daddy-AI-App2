import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DB_URL, exec, hasDb } from "./helpers";

// Runs SQL as a logged-in Supabase user (role authenticated + jwt sub), like the public API.
function asUser(uid: string, statement: string): string {
  const psql = process.env.TEST_PSQL ?? "psql";
  const script = `set role authenticated; set request.jwt.claim.sub = '${uid}'; ${statement}`;
  return execFileSync(psql, [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-At", "-c", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const tryAsUser = (uid: string, statement: string) => {
  try {
    return { ok: true, out: asUser(uid, statement) };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
};

const ORG = "e5eef388-09e1-4fd4-9e93-19121d60125b";
const ADMIN = "00000000-0000-0000-0000-00000000a001";
let n = 0;
const stranger = () => `00000000-0000-0000-0000-0000000b${String(++n).padStart(4, "0")}`;

describe.skipIf(!hasDb)("security: a new login can't join an organization by itself", () => {
  it("existing member still sees the org's leads", () => {
    expect(Number(asUser(ADMIN, "select count(*) from crm_contact"))).toBeGreaterThan(0);
  });

  it("a stranger with no profile row sees nothing", () => {
    expect(asUser(stranger(), "select count(*) from crm_contact")).toBe("0");
  });

  it("BLOCKED: insert own profile row naming the org", () => {
    const s = stranger();
    expect(tryAsUser(s, `insert into "user" (id, organization_id) values ('${s}', '${ORG}')`).ok).toBe(false);
    expect(asUser(s, "select count(*) from crm_contact")).toBe("0");
  });

  it("BLOCKED: insert own profile row and let the default pick the org", () => {
    const s = stranger();
    const r = tryAsUser(s, `insert into "user" (id) values ('${s}')`);
    // Either refused, or created with no organization. Never inside the org.
    expect(asUser(s, "select count(*) from crm_contact")).toBe("0");
    if (r.ok) expect(asUser(s, `select coalesce(organization_id, 'none') from "user" where id = '${s}'`)).toBe("none");
  });

  it("BLOCKED: switch an existing profile row into the org", () => {
    const s = stranger();
    asUser(s, `insert into "user" (id, organization_id) values ('${s}', null)`);
    expect(tryAsUser(s, `update "user" set organization_id = '${ORG}' where id = '${s}'`).ok).toBe(false);
    expect(asUser(s, "select count(*) from crm_contact")).toBe("0");
  });

  it("still allowed: create your own organization and join it", () => {
    const s = stranger();
    const org = asUser(s, `insert into organization (name, owner_id) values ('Mine', '${s}') returning id`).split("\n")[0];
    asUser(s, `insert into "user" (id, organization_id) values ('${s}', '${org}')`);
    expect(asUser(s, `select organization_id from "user" where id = '${s}'`)).toBe(org);
    expect(asUser(s, "select count(*) from crm_contact")).toBe("0"); // own org is empty
  });

  it("still allowed: a super admin adds a teammate to the org", () => {
    const s = stranger();
    asUser(ADMIN, `insert into "user" (id, organization_id) values ('${s}', '${ORG}')`);
    expect(Number(asUser(s, "select count(*) from crm_contact"))).toBeGreaterThan(0);
  });

  it("can't take the org's id for a new organization", () => {
    const s = stranger();
    expect(tryAsUser(s, `insert into organization (id, name, owner_id) values ('${ORG}', 'x', '${s}')`).ok).toBe(false);
  });

  it("reset helper works", () => {
    exec("select 1");
  });
});
