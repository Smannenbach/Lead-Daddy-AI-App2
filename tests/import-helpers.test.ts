import { describe, expect, it } from "vitest";
import { candidateEmails, chunk, splitDuplicates, validateImportRows } from "@/lib/leads/import";

describe("splitDuplicates", () => {
  it("drops rows whose normalized email already exists in crm_contact", () => {
    const { rows } = validateImportRows([
      { first_name: "Ada", email: " ADA@acme.com " },
      { first_name: "Grace", email: "grace@acme.com" },
      { first_name: "Mystery" },
    ]);
    const split = splitDuplicates(rows, new Set(["ada@acme.com"]));
    expect(split.fresh.map((r) => r.first_name)).toEqual(["Grace", "Mystery"]);
    expect(split.duplicates).toBe(1);
  });

  it("returns everything as fresh when nothing exists yet", () => {
    const { rows } = validateImportRows([{ first_name: "Ada", email: "ada@acme.com" }]);
    const split = splitDuplicates(rows, new Set());
    expect(split.fresh).toHaveLength(1);
    expect(split.duplicates).toBe(0);
  });
});

describe("candidateEmails", () => {
  it("returns unique non-null normalized emails", () => {
    const { rows } = validateImportRows([
      { first_name: "A", email: "a@x.com" },
      { first_name: "B", email: "A@x.com" },
      { first_name: "C" },
    ]);
    expect(candidateEmails(rows)).toEqual(["a@x.com"]);
  });
});

describe("chunk", () => {
  it("splits into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
    expect(chunk([1], 100)).toEqual([[1]]);
  });

  it("rejects non-positive sizes", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});
