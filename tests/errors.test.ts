import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizePatch } from "@/lib/crm/model";

const SNAKE = /\b[a-z]+_[a-z_]+\b/; // lead_score, estimated_value, first_name ...
const PROVIDERS = /reoon|realvalidito|firecrawl|composio|twilio|resend|sendgrid|supabase|openrouter|anthropic|openai/i;

describe("plain validation messages (QA: 'lead_score must be 0–100')", () => {
  it.each([
    [{ lead_score: 500 }, "Score must be a number from 0 to 100."],
    [{ estimated_value: -5 }, "Estimated value must be a dollar amount of 0 or more."],
    [{ first_name: "" }, "First name can't be empty."],
    [{ stage: "bogus" }, "Pick a stage: New, Contacted, Qualified, Proposal, Negotiation, Won, Lost."],
    [{ next_follow_up: "not a date" }, "Follow up date must be a real date."],
    [{ email: "nope" }, "Enter a valid email address."],
  ])("%j", (input, message) => {
    const { errors } = sanitizePatch(input);
    expect(errors).toEqual([message]);
    expect(errors[0]).not.toMatch(SNAKE);
    expect(errors[0]).not.toMatch(PROVIDERS);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("API routes never send raw errors to the user", () => {
  const routes = files("src/app/api");
  it.each(routes)("%s", (file) => {
    const src = readFileSync(file, "utf8");
    // Every JSON error body built inline must carry a code.
    for (const m of src.matchAll(/Response\.json\(\s*\{\s*error:/g)) {
      throw new Error(`error response without a code at offset ${m.index}`);
    }
    // No raw exception / driver message passed straight into a response.
    expect(src).not.toMatch(/Response\.json\([^)]*(err|e|error)(\?)?\.message/);
  });
});
