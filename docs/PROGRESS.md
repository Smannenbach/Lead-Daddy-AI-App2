# LeadDaddy.ai Lean Rebuild — Progress Log

**Goal:** Track A live in production before BFCM 2026 (Nov 27–30). 14-day clock starts
2026-11-08. Repo: `Smannenbach/LeadDaddy.ai` → `C:\Users\steve\Projects\lead-daddy-rebuild`.
BFCM definition-of-done checklist: `docs/GOAL_PROMPT.md` (Track A section).

---

## Day 1 — 2026-11-08

### Decision (binding)

**Database: Option A — adapt to the live Base44 schema** in Supabase project
`zdnlouluogpdfhygdnjn` (org `e5eef388-09e1-4fd4-9e93-19121d60125b`, "Go Buy Leads LLC",
us-east-1). No new tables, no `rebuild` schema, `supabase/migrations/0001_init.sql`
**not applied** (collides with live tables; reference only).

Consequences, all captured in `docs/ARCHITECTURE.md` (binding reference):

| Area | Day 1 state |
|---|---|
| Leads | `crm_contact` (first_name/last_name/email/phone/company/job_title/stage/tags, org-scoped) |
| Email verification results | `email_verification` (status keyed by email address) |
| Phone verification results | `phone_verification` (status keyed by phone number) |
| Campaigns header | `marketing_campaign` |
| Data access | cookie client = auth only; **service-role client** for all data queries inside API routes (Base44 RLS blocks anon → zero rows) |
| Authorization | **no `profiles` table** → email allowlist `ALLOWED_EMAILS` (default `steve@loandaddy.ai,mykoal@loandaddy.ai`) on /api/ai, /api/scrape, /api/social, /api/campaigns |
| API contract | frozen verbatim in `docs/ARCHITECTURE.md` — GET/POST /api/leads, POST /api/leads/[id]/verify response shapes |

### Work log

- **Docs agent (this file, README, SETUP, ARCHITECTURE, spec/GOAL_PROMPT amendments):**
  recorded the decision everywhere the superseded "run `0001_init.sql`" instruction
  lived; setup runbook no longer creates a Supabase project or runs the migration;
  smoke steps updated to the frozen API contract.
- **Code agents (parallel, in flight at time of writing):** rewrite `/api/leads` +
  `/api/leads/[id]/verify` against `crm_contact` + verification tables; replace
  `profiles` role checks with the allowlist; swap data access to service-role-after-auth;
  align console UI with the frozen response shapes.

### Gates (BFCM definition of done)

All still open — Day 1 is foundation. First expected to close: leads CRUD proven against
the live schema (orchestrator validation at end of day), then deploy gate later in the
14-day plan. RLS gate note: "user A cannot read user B's private data" is satisfied
differently than originally specced — there is no per-user RLS because the app uses the
service role after an auth + allowlist check; the gate should be re-verified as
"unauthenticated request gets 401, non-allowlisted signed-in user gets 403, no service
key ever reaches the browser."

### Blocked / needs Steve

- Nothing new on Day 1. Standing gates unchanged: production deploy, commits/pushes need
  Steve's explicit go.

### Next 3 moves

1. Orchestrator end-of-day validation: `tsc --noEmit` + `npm run build` green, frozen
   contract responses verified (leads list shows live `crm_contact` rows with
   email/phone statuses; create → verify persists to verification tables).
2. Days 4–7 pipeline work per plan (scrape → lead-verifier → auto lead creation; CSV import).
3. Vercel project setup (new `leaddaddy-ai`, do not disturb live `steve-projects/leaddaddy`)
   when Steve gives the go.

### Housekeeping

- Repo root has untracked temp scripts from pre-goal inspection: `.inspect-tmp.cjs`,
  `.inspect2-tmp.cjs`, `.provision-tmp.cjs`. Not part of the app; candidates for deletion
  before any commit.
- `~/.ai-memory/HIVE.md` + `topics/learnings.md` update for this decision is queued for
  the orchestrator (shared memory files, concurrent agents — single writer avoids conflicts).

## Days 4-7 slice (2026-11-08) — scrape→CRM + CSV import: DONE
- POST /api/scrape {autoCreate, autoVerify} -> digest people become crm_contact rows (lead_source=page host, stage=new); autoVerify runs Reoon/RealValidito per created contact. Digest-JSON extraction tolerant of prose/fences; parse failure never 500s.
- POST /api/leads/import {rows[]} (<=500) -> {created, skipped}; email dedupe vs live crm_contact; 100-row batches; lead_source=csv-import.
- Shared verifyContactPoints helper (verify route refactored onto it). Console UI: scrape toggles + CSV importer (header detection). vitest 28/28 (3 files), tsc/eslint/build green (12 routes).
- ⚠ Turbopack build worker intermittently aborts on this machine (0xC0000409); retry passes. Investigate if it persists on CI.

## Days 8-10 slice (2026-11-08) — sequence runner + consent gates: DONE
- src/lib/campaigns/sequences.ts (pure): buildSteps, nextDueStep, skipReason eligibility (email: valid email; sms/call: TCPA consent + valid phone). 36/36 tests (9 sequence tests).
- POST /api/campaigns/[id]/advance: runs next due step for all recipients (Resend email / Twilio SMS / Twilio call), per-lead runs persisted in marketing_campaign.target_audience.sequence, lead_event audit rows, service-role + org scoped.
- POST /api/campaigns/cron + vercel.json (*/15): advances all live campaigns; advance accepts allowlisted user OR x-cron-secret (CRON_SECRET).
- Launch stamps launchedAt; create accepts steps[]. TCPA consent captured: add-lead checkbox + import tcpaConsent -> crm_contact.custom_fields.tcpa_consent. tsc/eslint/build green.

## Days 11-14 partial (2026-11-09) — BFCM surfaces + monitoring: DONE (deploy still gated)
- GET /api/campaigns (list w/ sequence summary) + console Campaigns panel (Launch / Run-next-step, channels, sent/skipped, pending).
- Public /bfcm landing page (BFCM DSCR offer, UTM passthrough, TCPA consent checkbox, honeypot).
- POST /api/capture: honeypot + shape validation + idempotent unified_lead insert + crm_contact mirror (email dedupe). 6 new tests (42/42).
- /api/health (db + provider presence). LIVE-TESTED on localhost: health 200 db=up, capture created real rows + dedupe proven, smoke rows cleaned, /bfcm 200, / redirects to /login.
- Dead GEMINI/MOONSHOT keys removed from .env.local; NOTE: Kimi harness shell exports HKCU keys into process env, which overrides .env.local in `next dev` — harmless locally (router never prefers dead providers); Vercel prod unaffected.

## Hardening + ops docs (2026-11-09)
- IP rate limiter on /api/capture (10/10min, 429 + Retry-After) — live-tested (10 pass, then 429). 2 tests (44/44).
- docs/OPS.md (health/cron/spend monitoring, daily campaign ops, teammate onboarding, fast stop, rollback, pre-send compliance checklist).
- docs/track-b-foldback.md (tiered plan for porting Track A pieces into main repo post-BFCM; main repo untouched per stability rule).
- Smoke rows cleaned after each live test.

## Inbound SMS loop (2026-11-09)
- POST /api/channels/sms: Twilio inbound webhook -> contact match -> AI sales-caller SMS reply (<=450 chars) + lead_event audit; STOP/unsusbscribe matched by isOptOut (over-matches intentionally) -> instant opt-out confirmation + tcpa_consent=revoked persisted. 3 tests. Full rebuild suite 47/47.

## AI campaign copy + create UI (2026-11-09)
- POST /api/campaigns {name, brief, channelSeq, generateCopy:true} -> campaign-writer agent writes per-channel copy (email_subject/email/sms/call, opt-out language enforced by persona), parsed via shared extractJsonValue, steps built with daily offsets; ai_run_log records the run. Parse/AI failure -> 502 with clear message, no half-created campaign.
- Console "Create with AI copy" form: name + brief + channel checkboxes + include-all-leads. 47/47 tests, tsc/eslint/build green.
- Not live-tested (create requires an allowlisted user session — covered by the pending magic-link E2E step).

## Webhook security (2026-11-09)
- X-Twilio-Signature validation on /api/channels/sms + /api/channels/voice (HMAC-SHA1 of URL+sorted params, timing-safe compare). Unsigned/forged posts now rejected: SMS -> 403; voice -> benign hold-TwiML 200 (callers not dropped, AI not invoked). 5 new tests (49/49). Live-verified unsigned -> 403/200-hold.
- NOTE for tunnel/dev testing: signature covers the exact public URL; Twilio must hit the same URL used for validation (no path/query mismatch).

## Consent visibility + endpoint lockdown (2026-11-09)
- GET /api/leads now returns consent (custom_fields.tcpa_consent: none|granted|revoked); console leads table has a Consent badge (green/red/dim). Live-surface who can legally be texted during BFCM.
- GET /api/ai now requires an allowlisted session (was public). Verified: unauthenticated -> 307 to /login; /api/health + /api/capture remain public by design (200s). 49/49 tests, tsc/eslint/build green.

## PRODUCTION LAUNCH (2026-11-09) — APPROVED AND EXECUTED
- Twilio: NEW number +1 928-370-3051 (AZ, SMS+voice, sid PNec27c07a8ba980a41eb0a3c224bbf02d) — old +14806902666 untouched (still serves main app/Arive).
- Vercel: project leaddaddy-ai (prj_82jyDqnNcm1Y1TngXFougzrvugo7), 22 env vars (targets patched production+preview+development via REST API — CLI had resolved the wrong project), preview green, `vercel --prod` deployed + aliased leaddaddy-ai.vercel.app.
- DNS: Cloudflare CNAME app2.leaddaddy.ai -> cname.vercel-dns.com (record 4cb4fdc53f8a17194e1af430619e3fa0, zone leaddaddy.ai). Domain attached in Vercel. SSL live.
- Twilio webhooks on new number: voice+sms -> https://app2.leaddaddy.ai/api/channels/{voice,sms} (POST).
- Production smoke: /api/health 200 (db up, anthropic+openai+qwen), / -> 307 login, /bfcm 200. All smoke rows cleaned.
- Repo: gitleaks clean, committed + pushed to Smannenbach/LeadDaddy.ai main (3670cf9..1d19865).
- Remaining BFCM-gate items (need human sessions): Steve+Myke magic-link sign-in; one live scrape->verify->campaign run; one live AI voice call test. A2P 10DLC registration still recommended before high SMS volume (console step, needs business details).

## Production pipeline proof + hotfixes (2026-11-09)
- FULL LOOP PROVEN LIVE: Reoon verify (real API, "safe"->valid) -> contact+verification rows -> live campaign -> advance via cron credential -> SendGrid email sent ({"advanced":true,"sent":1}) -> cleanup. One PIPELINE TEST email delivered to steve@loandaddy.ai.
- Hotfixes found BY the proof: (1) Reoon "safe" status unmapped -> launch gate would reject good emails; (2) proxy matcher 307'd cron calls (edge runtime can't read non-NEXT_PUBLIC env; campaigns routes self-protect so removed from matcher); (3) CLI-pushed CRON_SECRET was corrupted/empty and shadowed the fallback — deleted; cron/advance now auth via SUPABASE_SERVICE_ROLE_KEY (server-to-server), documented in OPS.md.
