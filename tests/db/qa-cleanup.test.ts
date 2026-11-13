import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DB_URL, exec, hasDb, sql } from "./helpers";

const ORG = "e5eef388-09e1-4fd4-9e93-19121d60125b";
const QA = [
  ["492c6f9a-f9d1-4392-96e8-5bf0492ef92e", "QA TEST Alpha2", "qa.test.alpha2@example.com"],
  ["a111fd84-64aa-4b39-8172-fdb78824e3c0", "QA TEST Bravo", "qa.test.bravo@example.com"],
  ["a3655cec-de4e-421e-b284-d90882bf0ab8", "QA TEST Charlie", "qa.test.charlie@example.com"],
  ["da1bb621-543e-479b-98c3-0ab6b1238a8c", "QA TEST Dupe", "qa.test.bravo@example.com"],
  ["ad78c21b-b700-4dd1-aaa8-d485f321a0c4", "QA TEST Delta", "qa.test.delta@example.com"],
  ["0e94d6dd-989c-4454-8f9d-9855b0873af2", "QA TEST Echo", "qa.test.echo@example.com"],
  ["e2b720db-de08-4aa6-8bf0-59ec8ca86885", "QA TEST Foxtrot", "qa.test.foxtrot@example.com"],
  ["03833dd0-0ae9-4a27-92ea-663171857446", "QA TEST this is not a csv file. Just plain text.", null],
  ["865c62e3-06a7-4226-add9-2d109ce43d9d", "QA TEST Golf Consent", "qa.test.golf@example.com"],
  ["60b4d871-feed-4a21-8ea7-17c22f795621", "QA TEST India Long", "qa.test.india@example.com"],
];

describe.skipIf(!hasDb)("scripts/qa-cleanup.sql (local replica only)", () => {
  it("soft deletes exactly the 10 QA leads and the QA campaign, nothing else", () => {
    for (const [id, name, email] of QA) {
      exec(`insert into crm_contact (id, organization_id, first_name, email, stage) values ('${id}', '${ORG}', '${name}', ${email ? `'${email}'` : "null"}, 'New')`);
    }
    exec(`insert into crm_contact (organization_id, first_name, email, stage) values ('${ORG}', 'Real Customer', 'real@example.com', 'New')`);
    exec(`insert into crm_contact (organization_id, first_name, email, stage) values ('${ORG}', 'QA TEST Lookalike', 'someone@realco.com', 'New')`);
    exec(`insert into marketing_campaign (id, organization_id, name, status) values ('9621c5c8-286c-4c6d-8c9c-5b51d2c7db16', '${ORG}', 'QA TEST Campaign', 'draft')`);

    execFileSync(process.env.TEST_PSQL ?? "psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", "scripts/qa-cleanup.sql"], { stdio: "pipe" });

    const left = sql<{ first_name: string }>(`select first_name from crm_contact where organization_id = '${ORG}' and deleted_at is null order by first_name`);
    const names = left.map((r) => r.first_name);
    expect(names).toContain("Real Customer");
    expect(names).toContain("QA TEST Lookalike"); // QA prefix but a real-looking domain: kept
    expect(names.filter((n) => QA.some(([, qa]) => qa === n))).toEqual([]);
    expect(names).toHaveLength(14); // 12 replica seed rows + the 2 above, all untouched
    expect(sql<{ n: number }>(`select count(*)::int n from crm_contact where deleted_at is not null`)[0].n).toBe(10);
    expect(sql<{ status: string }>(`select status from marketing_campaign where name = 'QA TEST Campaign'`)[0].status).toBe("deleted");
  });
});
