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

---

# Round 2: outside and inside review (2026-11-13)

Scope: app2 only (leaddaddy.ai is out of scope by owner decision). All on branch `qa-backend-fixes`.

## Security (urgent)

| Item | Status |
|---|---|
| Sign ups open on the shared Supabase project, auto confirmed | **Steve.** Dashboard setting. A test login `qa.test.magic@example.com` exists. |
| A new login can set its own `organization_id` (defaults to Go Buy Leads) and get full access to every tenant table through the public API | Migration `20261113000300_user_cannot_choose_organization.sql` written and tested. **Not applied.** `tests/db/user-org-security.test.ts` shows the hole on a copy of the live rules (2 tests fail without the migration) and that it's closed with it, while admins can still add teammates. |
| app2 magic link created accounts | Fixed: `shouldCreateUser: false`. Magic link and reset show one neutral message, so the page doesn't reveal which emails have accounts. |
| app2 sent no safety headers | Fixed: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP (`src/lib/security-headers.ts`). Checked on a local build. |
| auth/callback redirect | Only same-site paths are allowed (`src/lib/auth-helpers/redirect.ts`). |

## Built

| Area | What changed |
|---|---|
| Login | LD mark, labels, Forgot password (new `/reset-password`), Show password, correct busy text, policy links, neutral placeholder |
| 404 | Branded page, real 404 status code, way back |
| Favicon and titles | LD icon; "Page · Lead Daddy" titles |
| Privacy and Terms | `/privacy` and `/terms` with marked `[LEGAL TEXT]` placeholders for Steve |
| /bfcm | Email and phone required (server and page). Consent optional and separate. Thank you text matches the consent box. "Call us" and "We never share your information" removed. Lender name, NMLS ID and disclosure placeholders. Length caps. An unchecked repeat never removes earlier consent. |
| Whole app | Light slate and indigo, one sidebar (Home, Leads, Pipeline, Campaigns, Import, Scraper, Settings), phone menu. Built from the written descriptions; adjust when the Figma mockups are connected. |
| Home | Add a lead, Import a CSV and Scrape a page cards, each with its own result. Credits left. |
| Leads and Pipeline | Consent column, long text cut short, bigger rows, bulk Add tag and Delete, in-app dialogs, server export in your time zone, Esc closes Columns, filters reset on field change, failed edits close and restore |
| Campaigns | Review and launch shows the copy, the recipients and who's skipped before anything sends. Email only by default. Run next step asks first. Delete. |
| Lead record | Contact permission card, the form answer, stage progress bar, Verify shows the cost first, Delete, deletable notes, exact times |

## Verified

- 225 unit and route tests, plus 19 database tests on a throwaway local Postgres. All pass.
- Production build, then every signed-in page clicked through with a fake login at 390px and 1440px: no sideways scroll, no console errors, Review and launch dialog opens and closes with Esc.

## Not done or blocked

- **`/datasets` is on leaddaddy.ai, not app2** (app2 returns 404 for it), so it can't be put behind login from this repo. It needs the leaddaddy.ai repo.
- Mockups: not used (Figma not connected). The look comes from the written descriptions.
- Saved views still live in the browser (waiting on the table design decision).
- Final legal text for Privacy, Terms, /bfcm lender name, NMLS ID and consent wording: Steve.
- Cleanup: `scripts/qa-cleanup.sql` now covers 10 leads, 1 campaign, 3 form copies and the test login. Not run.

---

# Round 3: Lead Daddy design system applied (2026-11-14)

Applied from the design system notes (not the Figma file):

- Tokens in `src/app/globals.css`: system sans stack, caption 12px and body 14px, label, h1, h2, page title, display, eyebrow and hero sizes, 2px `indigo-400` focus ring. **The notes name page-title, h1, h2, display, label, eyebrow and hero but don't give their sizes; the values are our pick.**
- Shared classes in `src/components/ui/styles.ts`: Button h-9 px-4 rounded-md (indigo passed explicitly), Input h-9 px-3, Card rounded-xl with shadow, Badge px-2.5 caption semibold, status colors that pass 4.5:1.
- Shell: collapsible white sidebar with uppercase group labels and 20px Lucide icons, solid `indigo-600` active item with white text and shadow, sticky white header with the page title and Sign Out (red hover), skip link, phone overlay on a `slate-900` 40% scrim. Collapse choice is remembered per browser.
- LD mark and avatars use the `indigo-600` to `violet-600` gradient; nowhere else.
- Status is always color plus a word or icon (`src/components/ui/Status.tsx`), with 64px empty and error states and an indigo spinner.
- Leads table turns into stacked cards under 600px of container width.
- Title Case for short labels and buttons, sentence case for helper text and placeholders.
- `/bfcm` uses the marketing dark surface: `slate-950`, `slate-800` borders, `indigo-400` and `emerald-400` accents, eyebrow kicker, hero headline in Title Case.

Checked with a production build and a browser walkthrough at 390px and 1440px: no sideways scroll, no console errors, and an automated contrast audit passes 4.5:1 on every signed-in page.

Not done:
- shadcn/ui itself isn't installed in app2. The components follow the shadcn specs with plain Tailwind. Moving to real shadcn components is a separate step.
- No marketing claims from the notes ("<10s", "12+ tools", "$97/mo") were added to app2. The pricing on leaddaddy.ai still conflicts and those claims are still unconfirmed.

---

# Round 4: shadcn/ui installed (2026-11-14)

- `components.json`: new-york style, slate base, Lucide icons, Radix. Added with the shadcn CLI 4.22.2: button, input, label, textarea, card, badge, dialog, alert-dialog, alert, checkbox, select, table, tabs, sheet, sidebar, separator, tooltip, skeleton, dropdown-menu, sonner, avatar, breadcrumb (`src/components/ui/`).
- Tokens in `src/app/globals.css`: the standard shadcn slate set (primary stays near-black), sidebar tokens set to the brand (white panel, `indigo-600` active), radius 8px, `.dark` tokens kept, app shell light only.
- App2 now uses the real components: shadcn Sidebar (collapses to icons, a sheet on phones, state in the `sidebar_state` cookie read by the server), Card panels, Button with indigo passed explicitly, Input/Label/Checkbox/Textarea, Select, Tabs, DropdownMenu (Columns), Table, Badge, Alert, Dialog and AlertDialog (replace the browser pop-ups), Breadcrumb, Sonner toasts.
- Thin wrappers keep the brand in one place: `src/components/app/Panel.tsx` (Panel, Field, CheckField) and `src/components/ui/styles.ts` (brand CTA, status badge tones).
- Edits to generated files: the `cn` import path (the CLI wrote `from "cn"` and installed an unrelated npm package named `cn`, which was removed), `sonner.tsx` fixed to light (no `next-themes`), `use-mobile.ts` and the sidebar skeleton fixed for the lint rules, overlay scrims set to `slate-900` 40%.
- `/bfcm` keeps its own marketing styling (dark surface); it doesn't use the app components.
- Checked: production build, browser walkthrough at 390px and 1440px with no console errors and no sideways scroll, contrast audit passes 4.5:1, sidebar collapse persists across reloads, phone sheet opens and closes on navigation, skip link is the first Tab stop, dialogs close on Esc.
- Note: these are current shadcn (v4) components. Their focus ring is 3px at 50% opacity, not the 1px ring in the design notes, and the app-level 2px `indigo-400` outline also applies. If the main app uses the older new-york components, the two will differ slightly.
