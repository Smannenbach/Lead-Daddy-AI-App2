import { describe, it, expect } from "vitest";
import {
  applyView,
  appendTimeline,
  customFieldKeys,
  groupByStage,
  historyFor,
  mergeCustomFields,
  normalizeStage,
  sanitizePatch,
  summarize,
  toCsv,
  toRecord,
  MAX_TIMELINE,
  type ContactRow,
  type CrmRecord,
} from "@/lib/crm/model";

function row(over: Partial<ContactRow> = {}): ContactRow {
  return {
    id: "1",
    first_name: "Ada",
    last_name: "Lovelace",
    company: "Acme",
    job_title: "CTO",
    email: "ada@acme.com",
    phone: "+15550001",
    stage: "new",
    lead_score: 50,
    estimated_value: 1000,
    tags: ["vip"],
    next_follow_up: null,
    assigned_to: null,
    lead_source: "manual",
    notes: null,
    custom_fields: {},
    created_date: "2026-11-01T00:00:00Z",
    updated_date: "2026-11-01T00:00:00Z",
    ...over,
  };
}

const rec = (over: Partial<ContactRow> = {}, es = "unverified"): CrmRecord => toRecord(row(over), es);

describe("toRecord", () => {
  it("normalizes legacy stages, tags and consent", () => {
    const r = toRecord(row({ stage: "Lead", tags: ["a", " a ", 3, "b"], custom_fields: { tcpa_consent: "granted", crm_fields: { loan_type: "DSCR", "Bad Key": "x" } } }));
    expect(r.stage).toBe("new");
    expect(r.tags).toEqual(["a", "b"]);
    expect(r.consent).toBe("granted");
    expect(r.custom).toEqual({ loan_type: "DSCR" });
  });
  it("normalizeStage accepts case variants", () => {
    expect(normalizeStage(" Qualified ")).toBe("qualified");
    expect(normalizeStage(null)).toBe("new");
  });
});

describe("applyView", () => {
  const list = [
    rec({ id: "a", first_name: "Zed", lead_score: 90, stage: "qualified", estimated_value: 5000 }, "valid"),
    rec({ id: "b", first_name: "Amy", lead_score: 10, company: "Globex", tags: ["cold"] }),
    rec({ id: "c", first_name: "Bob", lead_score: null, stage: "won", custom_fields: { crm_fields: { state: "AZ" } } }, "valid"),
  ];
  it("searches across name, company, tags and custom fields (all terms)", () => {
    expect(applyView(list, { search: "globex", filters: [], sort: [] }).map((r) => r.id)).toEqual(["b"]);
    expect(applyView(list, { search: "az", filters: [], sort: [] }).map((r) => r.id)).toEqual(["c"]);
    expect(applyView(list, { search: "amy cold", filters: [], sort: [] }).map((r) => r.id)).toEqual(["b"]);
    expect(applyView(list, { search: "amy warm", filters: [], sort: [] })).toHaveLength(0);
  });
  it("filters with numeric, tag and emptiness operators", () => {
    expect(applyView(list, { search: "", filters: [{ field: "lead_score", op: "gt", value: "69" }], sort: [] }).map((r) => r.id)).toEqual(["a"]);
    expect(applyView(list, { search: "", filters: [{ field: "tags", op: "is", value: "COLD" }], sort: [] }).map((r) => r.id)).toEqual(["b"]);
    expect(applyView(list, { search: "", filters: [{ field: "lead_score", op: "empty" }], sort: [] }).map((r) => r.id)).toEqual(["c"]);
    expect(applyView(list, { search: "", filters: [{ field: "custom.state", op: "is", value: "az" }], sort: [] }).map((r) => r.id)).toEqual(["c"]);
    expect(
      applyView(list, { search: "", filters: [{ field: "email_status", op: "is", value: "valid" }, { field: "stage", op: "is_not", value: "won" }], sort: [] }).map((r) => r.id),
    ).toEqual(["a"]);
  });
  it("sorts with empties last in both directions and stage by pipeline order", () => {
    expect(applyView(list, { search: "", filters: [], sort: [{ field: "lead_score", dir: "asc" }] }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(applyView(list, { search: "", filters: [], sort: [{ field: "lead_score", dir: "desc" }] }).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(applyView(list, { search: "", filters: [], sort: [{ field: "stage", dir: "asc" }] }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(applyView(list, { search: "", filters: [], sort: [{ field: "name", dir: "asc" }] }).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
  it("does not mutate the input", () => {
    const copy = list.map((r) => r.id);
    applyView(list, { search: "", filters: [], sort: [{ field: "name", dir: "asc" }] });
    expect(list.map((r) => r.id)).toEqual(copy);
  });
});

describe("groupByStage + summarize", () => {
  it("groups every record into exactly one column and derives totals", () => {
    const list = [
      rec({ id: "a", stage: "won", estimated_value: 100 }, "valid"),
      rec({ id: "b", stage: "lost", estimated_value: 999 }),
      rec({ id: "c", stage: "proposal", estimated_value: 50, next_follow_up: "2026-11-08", custom_fields: { tcpa_consent: "granted" } }),
      rec({ id: "d", stage: "won", estimated_value: null, next_follow_up: "2026-11-01" }),
    ];
    const g = groupByStage(list);
    expect(Object.values(g).flat()).toHaveLength(4);
    expect(g.won.map((r) => r.id)).toEqual(["a", "d"]);
    expect(summarize(list, new Date("2026-11-09T12:00:00Z"))).toEqual({
      count: 4,
      openValue: 50,
      wonValue: 100,
      validEmails: 1,
      consented: 1,
      followUpsDue: 1,
    });
  });
});

describe("sanitizePatch", () => {
  it("accepts valid edits and coerces types", () => {
    const p = sanitizePatch({ stage: "Won", lead_score: "75", estimated_value: "$12,500", tags: "a, b, a", email: " ADA@X.IO ", company: "  " });
    expect(p.errors).toEqual([]);
    expect(p.columns).toEqual({ stage: "won", lead_score: 75, estimated_value: 12500, tags: ["a", "b"], email: "ada@x.io", company: null });
  });
  it("rejects bad values without applying them", () => {
    const p = sanitizePatch({ stage: "maybe", lead_score: 140, email: "nope", first_name: "", next_follow_up: "soon" });
    expect(p.errors).toHaveLength(5);
    expect(p.columns.stage).toBeUndefined();
    expect(p.columns.lead_score).toBeUndefined();
    expect(p.columns.email).toBeUndefined();
  });
  it("never lets custom fields touch consent or reserved keys", () => {
    const p = sanitizePatch({ custom: { tcpa_consent: "granted", crm_fields: "x", sms_opt_out: "no", "Bad Key": "x", loan_type: "DSCR", old: "" } });
    expect(p.custom).toEqual({ loan_type: "DSCR", old: null });
    expect(p.errors).toHaveLength(4);
  });
  it("ignores unknown keys such as organization_id", () => {
    const p = sanitizePatch({ organization_id: "other-org", id: "x", deleted_at: null });
    expect(p.columns).toEqual({});
    expect(p.errors).toEqual([]);
  });
  it("rejects non-object bodies", () => {
    expect(sanitizePatch(null).errors).toHaveLength(1);
    expect(sanitizePatch([1]).errors).toHaveLength(1);
  });
});

describe("mergeCustomFields", () => {
  it("preserves consent and other keys while adding/removing custom fields", () => {
    const stored = { tcpa_consent: "granted", other: 1, crm_fields: { a: "1", b: "2" } };
    expect(mergeCustomFields(stored, { b: null, c: "3" })).toEqual({ tcpa_consent: "granted", other: 1, crm_fields: { a: "1", c: "3" } });
    expect(stored.crm_fields).toEqual({ a: "1", b: "2" });
  });
});

describe("timeline", () => {
  it("records only real changes plus notes", () => {
    const patch = sanitizePatch({ stage: "qualified", company: "Acme", custom: { state: "AZ" }, note: "Called, wants DSCR quote" });
    const h = historyFor({ stage: "new", company: "Acme", custom: {} }, patch, "steve@loandaddy.ai", "2026-11-09T00:00:00Z");
    expect(h.map((e) => e.type)).toEqual(["stage_changed", "field_changed", "note"]);
    expect(h[0].detail).toBe("Stage: new → qualified");
  });
  it("caps stored history and drops malformed entries", () => {
    const stored = [{ bogus: true }, ...Array.from({ length: MAX_TIMELINE }, (_, i) => ({ type: "note", at: String(i), by: null, detail: "x" }))];
    const out = appendTimeline(stored, [{ type: "note", at: "new", by: null, detail: "latest" }]);
    expect(out).toHaveLength(MAX_TIMELINE);
    expect(out.at(-1)?.detail).toBe("latest");
    expect(out[0].at).toBe("1");
  });
});

describe("customFieldKeys + toCsv", () => {
  it("collects custom keys and exports safe CSV", () => {
    const list = [rec({ custom_fields: { crm_fields: { z: "1" } } }), rec({ first_name: "=HYPERLINK(\"x\")", custom_fields: { crm_fields: { a: "2" } } })];
    expect(customFieldKeys(list)).toEqual(["a", "z"]);
    const csv = toCsv(list, [{ key: "name", label: "Name", type: "readonly", editable: false }, { key: "tags", label: "Tags", type: "tags", editable: true }]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"Name","Tags"');
    expect(lines[2].startsWith(`"'=HYPERLINK(""x"")`)).toBe(true);
  });
});
