import { describe, expect, it } from "vitest";
import { extractPeopleFromDigest, toDigestPerson } from "@/lib/scrape/digest";

describe("extractPeopleFromDigest", () => {
  it("parses a plain { people: [...] } object", () => {
    const digest = JSON.stringify({
      people: [
        { name: "Ada Lovelace", company: "Acme", job_title: "CTO", email: "Ada@Acme.com", phone: "+1 555", linkedin_url: "https://linkedin.com/in/ada" },
        { first_name: "Grace", last_name: "Hopper", title: "Admiral", company: "Navy" },
      ],
    });
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(2);
    expect(people[0]).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@acme.com",
      phone: "+1 555",
      company: "Acme",
      job_title: "CTO",
      linkedin_url: "https://linkedin.com/in/ada",
    });
    expect(people[1].first_name).toBe("Grace");
    expect(people[1].last_name).toBe("Hopper");
    expect(people[1].job_title).toBe("Admiral");
    expect(people[1].email).toBeNull();
  });

  it("tolerates JSON wrapped in prose", () => {
    const digest = 'Here is what I found on the page:\n\n{"people": [{"name": "Alan Turing", "company": "Bletchley"}]}\n\nLet me know if you need more.';
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(1);
    expect(people[0].first_name).toBe("Alan");
    expect(people[0].last_name).toBe("Turing");
  });

  it("tolerates markdown-fenced JSON", () => {
    const digest = 'Digest:\n```json\n{\n  "people": [{"name": "Edsger Dijkstra", "title": "Professor"}]\n}\n```\nDone.';
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(1);
    expect(people[0].first_name).toBe("Edsger");
    expect(people[0].job_title).toBe("Professor");
  });

  it("parses a single person object without a people key", () => {
    const digest = JSON.stringify({ name: "Barbara Liskov", company: "MIT", email: "barbara@mit.edu" });
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(1);
    expect(people[0].first_name).toBe("Barbara");
    expect(people[0].last_name).toBe("Liskov");
  });

  it("parses a top-level array of people", () => {
    const digest = JSON.stringify([{ name: "One" }, { name: "Two Person" }]);
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(2);
    expect(people[1].last_name).toBe("Person");
  });

  it("handles braces inside string values", () => {
    const digest = 'Found: {"people": [{"name": "Curly {Braces}", "company": "A {B} C"}]} end.';
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(1);
    expect(people[0].first_name).toBe("Curly");
    expect(people[0].last_name).toBe("{Braces}");
    expect(people[0].company).toBe("A {B} C");
  });

  it("returns empty array for garbage that contains no parseable JSON", () => {
    expect(extractPeopleFromDigest("digest failed: model timeout")).toEqual([]);
    expect(extractPeopleFromDigest("no people here")).toEqual([]);
    expect(extractPeopleFromDigest('{"people": "not-an-array"}')).toEqual([]);
  });

  it("returns empty array for null/empty digest text", () => {
    expect(extractPeopleFromDigest(null)).toEqual([]);
    expect(extractPeopleFromDigest(undefined)).toEqual([]);
    expect(extractPeopleFromDigest("")).toEqual([]);
  });

  it("skips array entries that are not objects", () => {
    const digest = JSON.stringify({ people: ["nope", null, { name: "Real Person" }, 42] });
    const people = extractPeopleFromDigest(digest);
    expect(people).toHaveLength(1);
    expect(people[0].first_name).toBe("Real");
  });
});

describe("toDigestPerson", () => {
  it("splits a single-word name into first_name only", () => {
    const person = toDigestPerson({ name: "Prince" });
    expect(person?.first_name).toBe("Prince");
    expect(person?.last_name).toBeNull();
  });

  it("prefers explicit first_name/last_name over name", () => {
    const person = toDigestPerson({ name: "Full Name", first_name: "Explicit", last_name: "Fields" });
    expect(person?.first_name).toBe("Explicit");
    expect(person?.last_name).toBe("Fields");
  });

  it("falls back to linkedin when linkedin_url is absent", () => {
    const person = toDigestPerson({ name: "X Y", linkedin: "https://linkedin.com/in/x" });
    expect(person?.linkedin_url).toBe("https://linkedin.com/in/x");
  });

  it("returns null for non-objects", () => {
    expect(toDigestPerson(null)).toBeNull();
    expect(toDigestPerson("string")).toBeNull();
    expect(toDigestPerson([{}])).toBeNull();
  });
});
