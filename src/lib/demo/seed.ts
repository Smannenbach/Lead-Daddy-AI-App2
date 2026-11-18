// Sample data for demo mode. Every person is fictional: names are made up, emails use
// example.com (reserved for examples), and phones use the 555-01xx range set aside for
// fiction. Nothing here belongs to a real lead.
import { CONSENT_WORDING } from "@/lib/consent";
import type { MemoryDb } from "@/lib/demo/memory-db";
import { organizationId } from "@/lib/supabase/org";

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();

type Lead = {
  first: string;
  last: string;
  company: string;
  title: string;
  stage: string;
  value: number | null;
  score: number | null;
  tags: string[];
  source: string;
  consent: "granted" | "none" | "revoked";
  emailStatus: "valid" | "invalid" | "risky" | null;
  phoneStatus: "valid" | "invalid" | null;
  finance?: string;
  followUpDays?: number;
  owner?: string;
  createdDaysAgo: number;
};

const LEADS: Lead[] = [
  { first: "Avery", last: "Calloway", company: "Calloway Rentals LLC", title: "Owner", stage: "new", value: 420000, score: 72, tags: ["dscr", "phoenix"], source: "bfcm-landing", consent: "granted", emailStatus: "valid", phoneStatus: "valid", finance: "Two door rental in Mesa, LLC borrower, about 25% down", createdDaysAgo: 1 },
  { first: "Jordan", last: "Pike", company: "Pike Property Group", title: "Managing Partner", stage: "contacted", value: 1150000, score: 64, tags: ["portfolio"], source: "csv-import", consent: "granted", emailStatus: "valid", phoneStatus: "valid", followUpDays: -1, owner: "demo@leaddaddy.example", createdDaysAgo: 6 },
  { first: "Riley", last: "Moreno", company: "Desert Bloom Homes", title: "Investor", stage: "qualified", value: 610000, score: 81, tags: ["dscr", "cash-out"], source: "bfcm-landing", consent: "granted", emailStatus: "valid", phoneStatus: "valid", finance: "Cash out refinance on a fourplex in Tempe", followUpDays: 2, createdDaysAgo: 9 },
  { first: "Casey", last: "Whitfield", company: "Whitfield Holdings", title: "Principal", stage: "proposal", value: 875000, score: 77, tags: ["rate-term"], source: "manual", consent: "none", emailStatus: "valid", phoneStatus: null, createdDaysAgo: 14 },
  { first: "Morgan", last: "Ashby", company: "Ashby Capital", title: "CFO", stage: "negotiation", value: 2300000, score: 88, tags: ["portfolio", "hot"], source: "scrape:example.com", consent: "granted", emailStatus: "valid", phoneStatus: "valid", followUpDays: 0, owner: "demo@leaddaddy.example", createdDaysAgo: 21 },
  { first: "Quinn", last: "Delgado", company: "Saguaro STR Co", title: "Owner", stage: "won", value: 540000, score: 90, tags: ["short-term-rental"], source: "bfcm-landing", consent: "granted", emailStatus: "valid", phoneStatus: "valid", finance: "Purchase of a short term rental in Scottsdale", createdDaysAgo: 30 },
  { first: "Taylor", last: "Brennan", company: "Brennan & Sons Realty", title: "Broker", stage: "lost", value: 300000, score: 35, tags: [], source: "csv-import", consent: "revoked", emailStatus: "risky", phoneStatus: "valid", createdDaysAgo: 40 },
  { first: "Skyler", last: "Nakamura", company: "Nakamura Realty Partners", title: "Acquisitions Lead", stage: "new", value: null, score: null, tags: ["referral"], source: "manual", consent: "none", emailStatus: null, phoneStatus: null, createdDaysAgo: 0 },
  { first: "Devon", last: "Ellison", company: "Ellison Builders", title: "President", stage: "contacted", value: 760000, score: 58, tags: ["new-construction"], source: "scrape:example.com", consent: "none", emailStatus: "invalid", phoneStatus: null, followUpDays: 5, createdDaysAgo: 3 },
  { first: "Harper", last: "Lindqvist", company: "Northstar Rentals", title: "Owner", stage: "qualified", value: 495000, score: 70, tags: ["dscr"], source: "bfcm-landing", consent: "granted", emailStatus: "valid", phoneStatus: "valid", finance: "Buying a duplex, needs to close in 30 days", createdDaysAgo: 4 },
  { first: "Rowan", last: "Okafor", company: "Okafor Investments", title: "Founder", stage: "new", value: 680000, score: 66, tags: ["portfolio"], source: "csv-import", consent: "none", emailStatus: "valid", phoneStatus: null, createdDaysAgo: 2 },
  { first: "Emerson", last: "Vale", company: "Vale Street Lofts", title: "Developer", stage: "proposal", value: 1900000, score: 74, tags: ["hot", "multifamily"], source: "manual", consent: "granted", emailStatus: "valid", phoneStatus: "valid", followUpDays: 1, owner: "demo@leaddaddy.example", createdDaysAgo: 11 },
];

export function seedDemo(db: MemoryDb): void {
  const org = organizationId();
  db.seed("organization", { id: org, name: "Lead Daddy Demo", owner_id: "demo" });

  const ids: string[] = [];
  LEADS.forEach((l, i) => {
    const n = String(i + 1).padStart(2, "0");
    const email = `${l.first}.${l.last}@example.com`.toLowerCase();
    const phone = `+1602555${String(100 + i).padStart(4, "0")}`;
    const created = ago(l.createdDaysAgo, i);
    const consentRecord =
      l.consent === "none"
        ? undefined
        : {
            status: l.consent,
            method: l.source === "bfcm-landing" ? "web_form" : "rep_attested",
            source: l.source === "bfcm-landing" ? "https://app2.leaddaddy.ai/bfcm" : "console:add-lead",
            wording_version: l.source === "bfcm-landing" ? "bfcm-form-2026-11" : "console-add-lead-2026-11",
            wording_text: CONSENT_WORDING[l.source === "bfcm-landing" ? "bfcm-form-2026-11" : "console-add-lead-2026-11"],
            at: created,
            captured_by: l.source === "bfcm-landing" ? null : "demo@leaddaddy.example",
            ...(l.consent === "revoked" ? { revoked_at: ago(l.createdDaysAgo - 3) } : {}),
          };
    const history: Array<Record<string, unknown>> = [
      { type: "created", at: created, by: l.source === "bfcm-landing" ? "Lead capture form" : "demo@leaddaddy.example", detail: l.source === "bfcm-landing" ? "Submitted the lead form (/bfcm)." : "Lead added" },
    ];
    if (l.emailStatus) history.push({ type: "verified", at: ago(Math.max(l.createdDaysAgo - 1, 0)), by: "demo@leaddaddy.example", detail: `Email ${email} checked: ${l.emailStatus === "invalid" ? "not valid" : l.emailStatus}` });
    if (l.stage !== "new") history.push({ type: "stage_changed", at: ago(Math.max(l.createdDaysAgo - 2, 0)), by: "demo@leaddaddy.example", detail: `Stage changed from New to ${l.stage.charAt(0).toUpperCase()}${l.stage.slice(1)}` });
    if (i % 3 === 1) history.push({ type: "note", at: ago(Math.max(l.createdDaysAgo - 2, 0), 2), by: "demo@leaddaddy.example", detail: "Left a voicemail. Wants numbers on a 30 year fixed." });

    const row = db.seed("crm_contact", {
      id: `00000000-0000-4000-8000-0000000000${n}`,
      organization_id: org,
      first_name: l.first,
      last_name: l.last,
      email,
      phone,
      company: l.company,
      job_title: l.title,
      stage: l.stage.charAt(0).toUpperCase() + l.stage.slice(1),
      lead_score: l.score,
      estimated_value: l.value,
      tags: l.tags,
      lead_source: l.source,
      assigned_to: l.owner ?? null,
      next_follow_up: l.followUpDays === undefined ? null : new Date(Date.now() + l.followUpDays * DAY).toISOString().slice(0, 10),
      notes: null,
      custom_fields: {
        tcpa_consent: l.consent,
        ...(consentRecord ? { consent_record: consentRecord } : {}),
        crm_fields: l.finance ? { financing_need: l.finance } : {},
        crm_field_labels: l.finance ? { financing_need: "What are you looking to finance?" } : {},
      },
      engagement_history: history,
      created_date: created,
    });
    ids.push(row.id as string);
    if (l.emailStatus) db.seed("email_verification", { organization_id: org, email, verification_status: l.emailStatus, verification_source: "demo", verification_date: ago(l.createdDaysAgo) });
    if (l.phoneStatus) db.seed("phone_verification", { organization_id: org, phone_number: phone, verification_status: l.phoneStatus, verification_source: "demo", verification_date: ago(l.createdDaysAgo) });
  });

  db.seed("marketing_campaign", {
    organization_id: org,
    name: "Spring DSCR Refi Check In",
    status: "draft",
    target_audience: {
      leadIds: ids.slice(0, 6),
      channelSeq: ["email", "sms"],
      sequence: {
        launchedAt: null,
        runs: [],
        steps: [
          { channel: "email", offsetMinutes: 0, subject: "Quick question about your rental", body: "Hi {first_name}, rates moved this month. Want me to run the numbers on your property? Reply to opt out." },
          { channel: "sms", offsetMinutes: 1440, body: "Following up on the rate numbers for your rental. Want them? Reply STOP to opt out." },
        ],
      },
    },
    created_date: ago(2),
  });
  db.seed("marketing_campaign", {
    organization_id: org,
    name: "New Leads Welcome",
    status: "draft",
    target_audience: { leadIds: [ids[0], ids[7], ids[10]], channelSeq: ["email"], sequence: { launchedAt: null, runs: [], steps: [{ channel: "email", offsetMinutes: 0, subject: "Thanks for reaching out", body: "Thanks for your interest. Here's what happens next. Reply to opt out." }] } },
    created_date: ago(1),
  });
}
