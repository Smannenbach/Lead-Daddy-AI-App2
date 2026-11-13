# QA backend fixes: report

Branch `qa-backend-fixes`, 21 commits on top of `main` (2455bcb). Nothing was pushed, deployed or applied to the live database.

## How it was tested

| | Before | After |
|---|---|---|
| Unit and route tests (`npm test`) | 70 of 70 pass | 206 of 206 pass |
| Database tests (`bash scripts/test-db.sh`, throwaway local Postgres) | none | 10 of 10 pass |
| Type check, lint, `next build` | pass | pass |

- Route tests run the real route code against an in-memory fake database (`tests/fakes/db.ts`). The fake copies the live triggers that matter: microsecond `updated_date`, and stage normalization and checks.
- Database tests build `supabase/tests/replica_schema.sql`, apply every migration in order, then run `tests/db`. The replica schema is a read-only capture of the live shape.
- No real text, call or email was sent. No campaign was launched. No Reoon, RealValidito or Firecrawl credit was spent: all providers are mocked.

## Migrations (both NOT applied: review, then apply by hand)

| File | What it does | Safe for existing rows |
|---|---|---|
| `20261113000100_crm_contact_app2_stages.sql` | Adds Qualified, Proposal, Negotiation and Won to `chk_crm_contact_stage` and the normalize trigger | Yes. It only adds values, so no row changes. |
| `20261113000200_crm_contact_length_limits.sql` | Adds max length CHECKs on `crm_contact` text fields and the campaign name | Yes. The checks are `NOT VALID`, so existing rows aren't checked. |

The code is safe to deploy before or after these. Until the stage migration is applied, Qualified, Proposal, Negotiation and Won keep failing exactly as they do today.

## Fixes

| # | Fix | Root cause | What changed | Files | Migration | Test | Result |
|---|---|---|---|---|---|---|---|
| C1 | Lead stages | The DB check only allowed Base44 mortgage stages plus New, Contacted and Lost | Migration widens the check and the trigger. Base44 stages now show in the nearest app2 column instead of New. | `src/lib/crm/model.ts` | 000100 | `tests/db/stages-migration.test.ts`, `tests/crm-model.test.ts` | Pass. The test fails with the exact QA error when the migration is skipped. |
| H1 | Scrape 502 | The request used the v1 `extract` key | v2 body `formats: ["markdown", {type:"json", prompt}]`, reads `data.json`. The URL is checked first ("Enter a valid URL…"). Provider errors are logged on the server only. | `src/lib/scrape/firecrawl.ts`, `src/app/api/scrape/route.ts`, `src/lib/api/errors.ts` | none | `tests/scrape.test.ts`, `tests/scrape-route.test.ts` | Pass (mocked) |
| H2 | False "record changed" | The `set_updated_date` trigger stores microseconds, but the API returned its own millisecond time, so the next save looked stale | Returns the version the DB stored and compares to the microsecond. Real conflicts are still rejected. | `src/lib/crm/server.ts` | none | `tests/concurrency.test.ts` (6 edits in a row, plus a stale edit rejected) | Pass. Fails on the old code. |
| H3 | CSV duplicates in one file | Dedupe only ran against the DB | Dedupes inside the file too (trimmed, lowercased). Returns `skippedRows: [{row, reason}]`. | `src/lib/leads/import.ts`, `src/app/api/leads/import/route.ts` | none | `tests/import.test.ts`, `tests/import-route.test.ts` | Pass |
| H4 | /bfcm form | (a) No consent flag in the response (b) already enforced on the server (c) the finance answer stayed on `unified_lead` only (d) no Activity | (a) `consent: {given}` (b) now tested (c) stored as custom field `financing_need`, shown on the record (d) form submission is logged in Activity | `src/app/api/capture/route.ts`, `src/lib/capture/validate.ts` | none | `tests/capture-route.test.ts` | Pass |
| H5 | Campaign consent | Default was email plus sms. Consent was only checked per step. | Default is email only. Launch returns 409 until skips are confirmed (`acknowledgeSkips`). Each step still skips leads without consent. New `GET /api/campaigns/:id/preview`. Ready to contact now requires consent. | `src/app/api/campaigns/route.ts`, `src/lib/campaigns/*`, `src/app/api/campaigns/[id]/preview/route.ts`, `src/lib/crm/model.ts` | none | `tests/campaign-consent.test.ts` | Pass |
| H6 | Consent record | Only a status was stored | `custom_fields.consent_record`: method, source, wording version, exact wording, time, who captured it. A STOP reply keeps the original details and adds `revoked_at`. No back fill. **Counsel review.** | `src/lib/consent.ts`, leads, import, capture and sms routes | none (jsonb) | `tests/consent-record.test.ts` | Pass |
| M1 | Phone validation | No validation | Every write path rejects "abc" and stores E.164 | `src/lib/phone.ts` plus 4 paths | none | `tests/phone.test.ts` | Pass |
| M2 | Length limits | No limits, or silent cutting | The API rejects with a plain message. DB checks as a backstop. | `src/lib/leads/limits.ts` plus paths | 000200 | `tests/limits.test.ts`, `tests/db/length-limits-migration.test.ts` | Pass |
| M3 | Non CSV uploads | The browser parsed any text | The server parses `{csv, filename}` and rejects non .csv, binary and one column prose. Rows with no email and no phone are skipped and listed. | `src/lib/leads/csv.ts`, import route | none | `tests/csv.test.ts`, `tests/import-route.test.ts` | Pass |
| M4 | Custom field names | The browser quietly turned names into keys | Bad raw keys are rejected on the server. `add_field {label, value}` makes the key and keeps the label. | `src/lib/crm/model.ts`, `src/lib/crm/server.ts` | none | `tests/custom-fields.test.ts` | Pass |
| M5 | Delete | No delete paths | Soft delete for leads, bulk delete, merge, privacy purge (`?purge=true` plus `confirm: "PURGE"`), note delete and campaign delete. All audited in `lead_event`. Deleted leads leave lists, counts, exports and campaign recipient lists. | `src/lib/crm/delete.ts`, 5 routes | none (existing `deleted_at`) | `tests/delete.test.ts` | Pass |
| M6 | Activity | Verify wasn't logged and raw keys were shown | Verify runs are logged. "First name set to Mike", "Phone cleared", "Stage changed from New to Qualified". | `src/lib/verify/activity.ts`, `src/lib/crm/model.ts` | none | `tests/activity.test.ts` | Pass |
| M7 | Plain errors | Column, provider and driver text reached users | `{code, error}` everywhere. Validation messages are plain. Raw errors are logged only. A test scans every route. | `src/lib/api/errors.ts`, all routes | none | `tests/errors.test.ts` | Pass |
| L1 | Launch guard | Live returned success | Only draft or paused can launch. Live or active gets 409. Zero recipients gets 400. | campaigns route | none | `tests/launch-guard.test.ts` | Pass |
| L2 | API auth | The proxy redirected /api calls to the login page (200 HTML) | Logged out /api calls get 401 JSON. Pages still redirect. | `src/proxy.ts`, `src/lib/auth.ts` | none | `tests/proxy.test.ts` | Pass |
| L3 | Export | The browser exported in UTC with visible columns only | `GET /api/crm/export?tz=&columns=` returns all fields, custom labels, and local dates and file name | `src/lib/crm/export.ts`, export route | none | `tests/export.test.ts` | Pass |
| L4 | Verify credits | No balance, no warning | `emailCreditsRemaining` and `?dryRun=true` | `src/lib/verify/reoon.ts`, verify route | none | `tests/verify-credits.test.ts` | Pass (mocked) |
| L5 | Wording | `you@loandaddy.ai` placeholder | `you@company.com`. Email sender name and subject say Lead Daddy. | login page, `src/lib/channels/email.ts`, advance route | none | `tests/wording.test.ts` | Pass |
| Cleanup | QA test data | n/a | `scripts/qa-cleanup.sql` previews, then soft deletes by ID. **Not run.** | `scripts/qa-cleanup.sql` | none | `tests/db/qa-cleanup.test.ts` | Pass on the replica |

## Frontend changes each backend fix needs

| Where | Change |
|---|---|
| `src/app/page.tsx` importCsv | Send `{ csv: await file.text(), filename: file.name, tcpaConsent }` instead of parsing in the browser. Show `skippedRows` as "Row 4: Same email as row 2". |
| `src/app/page.tsx:114` | `sms: true` becomes `sms: false` (the form sends channels, so the server default doesn't apply). |
| `src/app/page.tsx` launchCampaign | On 409 `recipients_will_be_skipped`, show `preview.skipped`, then resend with `acknowledgeSkips: true`. On success show `data.message` instead of the ID. |
| `src/app/page.tsx`, `RecordView.tsx` verify | Show `results[].message` and `emailCreditsRemaining`. Call `?dryRun=true` first and confirm. |
| `src/app/bfcm/page.tsx` | Error: `setError(d.error ?? "Something went wrong. Try again.")` (it checked `d.error === "missing_contact"`, which is now `d.code`). Done state: branch on `data.consent.given`. That wording is a TODO for you. |
| `RecordView.tsx` addCustom | Send `{ add_field: { label: newKey, value: newVal } }`. Use `customFieldDefLabeled(key, record.custom_labels)`. |
| `Workspace.tsx` export | `window.location = "/api/crm/export?tz=" + Intl.DateTimeFormat().resolvedOptions().timeZone + "&columns=" + visible.join(",")` |
| Workspace and RecordView | Delete, bulk delete, merge, note delete (use timeline `id`) and campaign delete buttons for the new endpoints. Show `consent_record` on the record. |

## TODOs

1. `TODO(counsel)`: `src/lib/consent.ts`. Consent wording adequacy, rep attested consent, retention.
2. `TODO(legal, owner)`: `src/app/bfcm/page.tsx`. Privacy and Terms links, lender name, NMLS ID, consent text, and the confirmation when consent isn't given.
3. `TODO(owner)`: `src/lib/verify/reoon.ts`. Confirm credits per check with Reoon and RealValidito, then set `VERIFY_EMAIL_CREDITS` and `VERIFY_PHONE_CREDITS`.
4. Set `LEAD_DADDY_TIME_ZONE` in Vercel. It defaults to `America/Phoenix`.
5. Apply the two migrations by hand after review.
6. Base44 stage display mapping (Prospect shows as Qualified, Underwriting as Negotiation, Closed as Won, and so on) is my call. Confirm or change `BASE44_STAGE_MAP`.

## Decisions needed (proposals only, nothing built)

### Automatic lead scoring
- **A. Rules (recommended first).** Points from data already stored: valid email, valid phone, consent granted, stage, an estimated value set, Activity in the last 7 days, form lead versus import. Instant, free and easy to explain. Weights need your call.
- **B. Engagement.** Points from replies and calls in Activity and `lead_event`, such as an inbound SMS or an answered call. Better signal, but thin until campaigns run. There's no email open tracking today.
- **C. AI.** The lead-verifier agent scores 0 to 100 with a reason, from the record plus the finance answer. Most nuanced, but it costs AI tokens per lead and needs a budget cap.

### Saved views on the account
New table `crm_saved_view` (checked: no live table with that name):
`id uuid pk, organization_id text, owner_email text, name text (≤60), mode text check (table|kanban), search text, filters jsonb, sort jsonb, hidden jsonb, shared boolean default false, is_default boolean default false, created_date, updated_date, deleted_at`.
Unique `(organization_id, owner_email, lower(name)) where deleted_at is null`. You see your own views plus shared ones. Only the owner edits. API `GET/POST/PATCH/DELETE /api/crm/views`. One additive migration. The browser views get imported once on first load.

### /bfcm legal wording
Not written. See TODO 2.

## Legal flags for counsel

1. Consent record design, rep attested consent (one checkbox for a whole CSV import), and retention.
2. The /bfcm checkbox bundles phone, SMS and email "about this offer". The app also has an AI voice agent that places calls. Counsel should confirm the consent covers that.
3. /bfcm marketing claims ("$1,995 processing fee is on us", "answers in minutes"), and no lender name or NMLS ID on the page.
4. Privacy purge scope: it removes the lead, verification rows, form submissions and campaign references. It does NOT reach provider copies (Twilio, Resend, Reoon), AI logs, backups, older `lead_event` rows that mention the lead, or the Base44 app.
5. The STOP reply still says "LeadDaddy.ai" on purpose, to match the A2P 10DLC brand registration.

## Found beyond the QA report

1. Phone-only form submissions never reached the CRM. Fixed.
2. `PUT /api/campaigns` let any signed-in user text any phone number with no consent check. Fixed: it now sends only to an existing lead's own address, and texts need consent.
3. Base44 stage rows all showed as New. Fixed (display mapping).
4. Scrape returned the raw AI provider error in the digest text. Fixed.
5. All 8 leads in the live account are QA test data, so cleanup leaves the lead list empty.
6. Older rows keep their phone format (QA Alpha2 has "555 0100"). They weren't rewritten, so verification lookups for them may not match.
7. AI agent prompts still say "LeadDaddy.ai", which is the brand a lead hears on calls. Tab titles and headers say "LeadDaddy.ai" (frontend). Not changed. Your call.
8. Vercel preview deploys use production settings, so a preview of this branch would point at the live database.
9. The repo rule "no migrations" conflicted with this work. `supabase/migrations/README.md` now says migrations are proposed, tested locally, and applied by hand.

## Not verified

- No live Firecrawl call. The v2 body follows the docs. The docs don't list `data.json` in the response schema, so the code also accepts `data.extract`. One live scrape of example.com will confirm.
- No live Reoon balance call. The field names come from Reoon's docs.
- Migrations ran only on the local replica. Their effect on the Base44 app wasn't tested.
- Route tests use a fake database, not PostgREST.
- Commit 74938fe has a test file type error, fixed two commits later in 413ed1f. The branch tip is clean.
