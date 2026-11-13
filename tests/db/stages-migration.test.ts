import { describe, expect, it } from "vitest";
import { exec, hasDb, sql } from "./helpers";
import { STAGES, normalizeStage, summarize, toRecord, type ContactRow } from "@/lib/crm/model";

describe.skipIf(!hasDb)("migration: crm_contact app2 stages", () => {
  it("existing rows are unchanged by the migration", () => {
    const before = sql<{ stage: string | null; n: number }>("select stage, n from migration_snapshot order by stage nulls last");
    const after = sql<{ stage: string | null; n: number }>("select stage, count(*)::int n from crm_contact group by stage order by stage nulls last");
    expect(after).toEqual(before.map((r) => ({ stage: r.stage, n: Number(r.n) })));
  });

  it("every stage the app offers saves (app writes lowercase keys; trigger capitalizes)", () => {
    for (const s of STAGES) {
      exec(`update crm_contact set stage = '${s.key}' where first_name = 'Seed1'`);
      const [row] = sql<{ stage: string }>("select stage from crm_contact where first_name = 'Seed1'");
      expect(row.stage).toBe(s.label);
      expect(normalizeStage(row.stage)).toBe(s.key);
    }
  });

  it("Base44 stages still save", () => {
    for (const s of ["Lead", "Prospect", "Application", "Underwriting", "Approved", "Closed", "Nurture"]) {
      exec(`update crm_contact set stage = '${s}' where first_name = 'Seed2'`);
    }
  });

  it("unknown stages are still rejected", () => {
    expect(() => exec("update crm_contact set stage = 'Bogus' where first_name = 'Seed3'")).toThrow(/chk_crm_contact_stage/);
  });

  it("Won total updates after a lead moves to Won", () => {
    exec("update crm_contact set stage = 'won', estimated_value = 1234 where first_name = 'Seed4'");
    const rows = sql<ContactRow>("select id, first_name, last_name, company, job_title, email, phone, stage, lead_score, estimated_value, tags, next_follow_up, assigned_to, lead_source, notes, custom_fields, created_date, updated_date from crm_contact where deleted_at is null");
    expect(summarize(rows.map((r) => toRecord(r))).wonValue).toBe(1234);
  });
});
