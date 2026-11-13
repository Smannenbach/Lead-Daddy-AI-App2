import { describe, expect, it } from "vitest";
import { buildExport, exportFileName, localDateTime, resolveTimeZone } from "@/lib/crm/export";
import { toRecord, type ContactRow } from "@/lib/crm/model";

const row = (extra: Partial<ContactRow> = {}) =>
  toRecord({
    id: "11111111-1111-1111-1111-111111111111", first_name: "Mike", last_name: "Smith", company: "Acme", job_title: "Owner",
    email: "mike@example.com", phone: "+16025550100", stage: "Qualified", lead_score: 80, estimated_value: 5000, tags: ["hot"],
    next_follow_up: null, assigned_to: "myke@example.com", lead_source: "csv-import", notes: null,
    custom_fields: { crm_fields: { loan_type: "DSCR" }, crm_field_labels: { loan_type: "Loan Type" } },
    created_date: "2026-11-14T02:23:00Z", updated_date: "2026-11-14T02:23:00Z", ...extra,
  } as ContactRow);

describe("export time zone (QA: 7:23 PM Phoenix export named with the next day)", () => {
  it("names the file and formats dates in the account zone", () => {
    const now = new Date("2026-11-14T02:23:00Z"); // 7:23 PM Nov 13 in Phoenix
    expect(exportFileName(now, "America/Phoenix")).toBe("lead-daddy-leads-2026-11-13-1923.csv");
    expect(localDateTime("2026-11-14T02:23:00Z", "America/Phoenix")).toBe("2026-11-13 19:23");
  });
  it("uses a valid ?tz, then the setting, then Phoenix", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
    expect(resolveTimeZone("Not/AZone")).toBe("America/Phoenix");
    process.env.LEAD_DADDY_TIME_ZONE = "America/Chicago";
    expect(resolveTimeZone(null)).toBe("America/Chicago");
    delete process.env.LEAD_DADDY_TIME_ZONE;
  });
});

describe("export columns", () => {
  it("includes every field: Title, Owner, Source, split names and custom fields with labels", () => {
    const { csv } = buildExport([row()], { tz: "America/Phoenix" });
    const [header, line] = csv.split("\r\n");
    for (const h of ["First name", "Last name", "Title", "Owner", "Source", "Loan Type", "Created"]) expect(header).toContain(`"${h}"`);
    expect(line).toContain('"Mike","Smith"');
    expect(line).toContain('"DSCR"');
    expect(line).toContain('"2026-11-13 19:23"');
  });
  it("accepts an optional column list, in that order", () => {
    const { csv, unknown } = buildExport([row()], { tz: "America/Phoenix", columns: ["email", "custom.loan_type", "nope"] });
    expect(csv.split("\r\n")).toEqual(['"Email","Loan Type"', '"mike@example.com","DSCR"']);
    expect(unknown).toEqual(["nope"]);
  });
  it("keeps spreadsheet formula protection", () => {
    expect(buildExport([row({ company: "=CMD()" })], { tz: "UTC", columns: ["company"] }).csv).toContain(`"'=CMD()"`);
  });
});
