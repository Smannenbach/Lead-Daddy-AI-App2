import { describe, expect, it } from "vitest";
import { exec, hasDb, sql } from "./helpers";

describe.skipIf(!hasDb)("migration: crm_contact length limits", () => {
  it("leaves an existing over-long row alone (NOT VALID)", () => {
    // Simulate a pre-existing long value by inserting with the check disabled for this session.
    exec("alter table crm_contact drop constraint chk_crm_contact_company_len; insert into crm_contact (first_name, company) values ('Legacy', repeat('x', 400)); alter table crm_contact add constraint chk_crm_contact_company_len check (char_length(company) <= 200) not valid;");
    expect(sql<{ n: number }>("select char_length(company) n from crm_contact where first_name = 'Legacy'")[0].n).toBe(400);
  });
  it("rejects a new 400 character company", () => {
    expect(() => exec("insert into crm_contact (first_name, company) values ('New', repeat('x', 400))")).toThrow(/chk_crm_contact_company_len/);
  });
  it("accepts a value at the limit", () => {
    exec("insert into crm_contact (first_name, company) values ('Edge', repeat('x', 200))");
  });
  it("campaign names are limited", () => {
    expect(() => exec("insert into marketing_campaign (name) values (repeat('x', 201))")).toThrow(/chk_marketing_campaign_name_len/);
  });
});
