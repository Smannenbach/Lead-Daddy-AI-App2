# LeadDaddy.ai — Production Readiness Ledger

Single source of truth for the 7-day push (Day 1 = Mon 2026-11-09, freeze Sun 2026-11-15,
BFCM launch Nov 27–30 with PPC ads + AppSumo). **Done needs evidence.** No evidence = not done.

- **Track A** = `Smannenbach/LeadDaddy.ai` (Next.js, app2.leaddaddy.ai)
- **Track B** = `Smannenbach/leaddaddy` (Vite SPA, leaddaddy.ai + app.leaddaddy.ai)
- Status values: `Open` · `Verifying` · `In progress` · `Blocked (Steve)` · `Done` · `Waived (Steve)` · `Cut`
- Sources: GP = goal prompt v3 item #; LD-xxx = Myke's 2026-11-08 bug CSV / bug-fix plan PDF; NEW-x = PDF's new findings; L-x = launch items added on Day 1.

## Definition of Done tracker

| # | Criterion | Status | Evidence |
|---|---|---|---|
| D1 | Zero open P0, zero open P1 (or written waiver) | Open | — |
| D2 | Cross-tenant attack tests pass against prod with two test orgs | Open | — |
| D3 | Both gates green on `main`; CI enforces them on every PR | Open | A main: lint/tsc/70 tests pass, build unverified locally (OOM). B main: tests RED (L-15) |
| D4 | E2E journeys pass on preview and prod smoke | Open | — |
| D5 | gitleaks clean (history); every exposed credential rotated | Open | — |
| D6 | Error tracking + uptime alerts live and tested | Open | — |
| D7 | Backups confirmed + one restore tested | Open | — |
| D8 | TCPA/STOP/consent verified on prod; A2P submitted or SMS capped in code | Open | — |
| D9 | No hardcoded/fake metrics; every dashboard number traces to a query | Open | — |
| D10 | RUNBOOK.md + this ledger current; rollback tested once on preview | Open | — |

## P0 — tenant security and secrets (Track B + shared DB)

| ID | App | Sev | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|---|
| GP-1 / NEW-1 | B+DB | P0 | Cross-tenant takeover: user can change own `organization_id` | Claude | Verifying | — |
| GP-2 / NEW-2 / LD-013 | B+DB | P0 | Super-admin bypass in every policy + 5/5 seats super admin (incl. QA + duplicate Steve accounts) | Claude (fix) / Steve (who stays admin) | Verifying | — |
| GP-3 | B | P0 | Hardcoded org-id fallbacks (`e5eef388…`) in write paths | Claude | Verifying | — |
| GP-4 / LD-003 | B | P0 | Unscoped reads (`telemetry_event`, `automated_workflow`, `ai_agent`, `organization?select=*`, others) | Claude | Verifying | CRM read fixed in Track B PR #1 (unmerged) |
| GP-5 | A+B | P0 | No service-role key/secret in browser bundle or git history | Claude | Verifying | gitleaks 8.30.1 full history: A 18 commits 0 leaks; B 65 commits 2 `jwt` hits, both `role=anon` (public), not on main. B bundle grep pending |
| L-13 | A | P0 | TCPA (Track A PR #2): `PUT /api/campaigns` texted any number with no consent or opt-out check; inbound STOP used `.maybeSingle()` (duplicate rows -> error -> STOP dropped) and was not recorded at all for unknown numbers; no SMS volume cap | Claude | Done (pending deploy) | New chokepoint `src/lib/channels/sms-guard.ts`, now also reads/writes the shared `sms_opt_outs` table so a STOP to either app blocks both; 15 tests in `tests/sms-guard.test.ts`; 85/85 tests, tsc + eslint clean; CI `gate` (incl. build) + `secrets` PASS, Vercel preview built — https://github.com/Smannenbach/LeadDaddy.ai/pull/2 |
| L-14 | DB | P0 | DB-level hardcoded org fallback on **all 82 of 82** tables with `organization_id` (incl. `user`, `organization_member`): default `COALESCE(current_user_org_id(), 'e5eef388…')`. Any insert without an org claim (e.g. a new PPC/AppSumo self-serve signup) lands in Go Buy Leads' tenant. Replace with NOT NULL + no default (or fail-closed trigger) via reviewed migration on a branch | Claude (migration) / Steve (apply to prod) | Open | `information_schema.columns` count query on zdnlouluogpdfhygdnjn, 2026-11-09 |
| NEW-3 | B+DB | P0 | No automated cross-tenant RLS test (two orgs, two users) running in CI | Claude | Open | — |
| L-1 | A+B | P0 | Steve's and Myke's passwords appeared in plain text in GOAL_PROMPT v2 / shared Project; QA account (`qa@leaddaddy.ai`) password is in B git history (`scripts/smokeTest.mjs` 4a38c15..9667edf). Rotate all three, scrub docs | Steve | Open | gitleaks run 2026-11-09 (QA password found by manual history grep; gitleaks missed it) |

## P1 — reliability, trust, launch blockers

| ID | App | Sev | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|---|
| GP-6 | A+B | P1 | Hosting truth (Cloudflare vs Vercel per domain); fix docs/config to match | Claude | In progress | Verified 2026-11-09 via DNS + headers: leaddaddy.ai/www/app = Cloudflare proxy -> Vercel (`server: cloudflare` + `x-vercel-id`), Track B bundle; app2 = CNAME cname.vercel-dns.com, Vercel direct, Track A. Bug plan's "Cloudflare Workers/Pages" guess is wrong — it's Vercel behind CF proxy. Docs fix pending |
| LD-001 | B | P1 | funnels.leaddaddy.ai shows Live but NXDOMAIN | Steve (DNS) / Claude (status check) | Open | Re-confirmed NXDOMAIN 2026-11-09 |
| LD-002 | B | P1 | agency.leaddaddy.ai (white-label portal) NXDOMAIN | Steve (DNS) / Claude | Open | Re-confirmed NXDOMAIN 2026-11-09 |
| LD-004 | B | P1 | Agency branding has no Save | Claude | Open | — |
| LD-032 | B | P1 | Upload Logo / Favicon unresponsive (needs verification) | Claude | Open | — |
| LD-005 / GP-7 | B | P1 | Hardcoded/simulated KPI cards (1,446 traffic on dead site, "15 sub-accounts", 23K/mo) | Claude (fix) / Steve (label vs remove) | Open | — |
| LD-006 | B | P1 | Dashboard vs CRM pipeline mismatch (limit=200 vs 500) | Claude | Open | — |
| LD-018 | B | P1 | Hard-capped contact fetches, no pagination | Claude | Open | — |
| LD-010 | B | P1 | No real sub-account management (switch/edit/suspend/bill) | Claude | Open | — |
| LD-012 | B | P1 | Role enums differ across 3 screens; invites use non-existent "Originator" | Claude | Open | — |
| LD-015 / L-2 | B | P1 | No public /pricing or /signup — PPC traffic and AppSumo buyers have nowhere to land | Claude (build) / Steve (prices, Stripe) | Open | — |
| L-3 | B (or A) | P1 | AppSumo license-code redemption flow (redeem code → provision org + plan tier, stackable codes, refund/deactivate webhook) | Claude (build) / Steve (AppSumo listing, tiers) | Open | — |
| L-4 | A+B | P1 | PPC conversion tracking on signup/purchase (Google Ads + Meta pixel/CAPI), consent-aware | Claude / Steve (pixel IDs) | Open | — |
| L-5 | A+B | P1 | Load + capacity at BFCM volume (signup, capture, CRM list) | Claude | Open | — |
| LD-024 | B | P1 | Competitor trademarks in UI headings (GHL, Gong, Mutiny, …) — must be gone before paid ads / AppSumo listing | Claude (rename) / Steve (counsel) | Open | — |
| LD-022 | B | P1 | Demo/seed data mixed with real data; new tenants must start clean | Claude | Open | — |
| LD-025 | B | P1 | Phone numbers free-typed, no carrier ownership / A2P status | Claude | Open | — |
| GP-8 | A+B | P1 | Dead keys (Qwen/RealValidito/Composio) fail over gracefully, UI says unavailable | Claude | Open | Track A: failover + Twilio Lookup fallback shipped (PROGRESS.md "Key-churn resilience") — needs Track B check |
| GP-9 | A+B | P1 | A2P 10DLC not registered: submission text ready; SMS volume capped in code until approved | Claude (text + cap) / Steve (submit) | Open | Runbook: docs/runbooks/a2p-10dlc.md |
| GP-10 | A | P1 | Capture → verify → campaign → send on prod with a real lead (Steve/Myke, with consent) | Claude / Steve | Open | Partial: pipeline proof in PROGRESS.md (email path); human UI run pending |
| L-15 | B | P1 | Track B CI red on every `main` push since >= Nov 8: (a) `deno check` — 11 type errors in ai-engine + lead-engine; (b) local Windows gate fails 2 test files from CRLF checkout (pass 95/95 on LF; CI offline gate passes) | Claude (fix) / Steve (merge) | In progress | (a) https://github.com/Smannenbach/leaddaddy/pull/2 — deno check passes all 8 functions; (b) https://github.com/Smannenbach/leaddaddy/pull/3 `.gitattributes` |
| L-16 | A | P2 | Cron routes accept `SUPABASE_SERVICE_ROLE_KEY` as a bearer credential when `CRON_SECRET` is unset; capped SMS recipients are not retried within a step | Claude | Open | `src/app/api/campaigns/cron/route.ts:11`, `.../[id]/advance/route.ts:20` |
| L-17 | A | P1 | A2P reality check: US carriers block unregistered 10DLC traffic outright, so Track A campaign SMS may not deliver at all until the brand + campaign are approved | Steve (submit) | Open | — |
| L-6 | A+B | P1 | Error tracking + uptime alerts (D6). Track B has NO health endpoint (`/api/health` 404; `/health` returns the SPA shell) | Claude | Open | app2 `/api/health` 200 `{ok,db,providers,time}` — reports key presence, not liveness |
| L-7 | DB | P1 | Backups/PITR confirmed + one restore tested (D7) | Claude / Steve (if PITR is a paid add-on) | Open | — |
| L-8 | A+B | P1 | CI running each gate on every PR (D3) | Claude | In progress | A: `.github/workflows/gate.yml` added (lint, tsc, test, build + gitleaks). B: `ci.yml` exists (offline gate, deno check, live RLS contract) |
| L-9 | A+B | P1 | Compliance pass: TCPA gates, instant STOP, business-purpose copy, entity separation, privacy + terms live, no APM references | Claude | Open | — |

## P2 — quality and consistency

| ID | App | Sev | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|---|
| LD-007 | B | P2 | Sites "Total Leads 12" vs CRM 101 (label or source) | Claude | Open | — |
| LD-008 | B | P2 | Agent counts hardcoded in labels (6 vs 4 vs 5) | Claude | Open | — |
| LD-009 | B | P2 | Two domain tables (`domain` vs `white_label_domain`) | Claude | Open | — |
| LD-011 | B | P2 | Agency Team tab read-only, 1 vs 5 members | Claude | Open | — |
| LD-014 | B | P2 | Subdomain suffix shows `.ai` not `.leaddaddy.ai` | Claude | Open | — |
| LD-016 | B | P2 | User/Team Management intermittent freeze | Claude | Open | — |
| LD-017 | B | P2 | Diagnostics/SLO numbers contradict each other | Claude | Open | — |
| LD-019 | B | P2 | user ×3 / org ×2 fetch + audit_log write on every page view | Claude | Open | — |
| LD-020 | B | P2 | Soft 404 (HTTP 200) + favicon returns HTML | Claude | Open | Re-confirmed: `/does-not-exist` and `/favicon.ico` -> 200 text/html 12,075 B on leaddaddy.ai; app2 returns real 404s |
| LD-021 | B | P2 | Duplicate/overlapping nav entries | Claude | Open | — |
| LD-031 | B | P2 | Mortgage route names leak to all verticals | Claude | Open | — |
| L-10 | A+B | P2 | Lighthouse ≥ 90 perf + a11y on key pages; bundle size | Claude | Open | — |
| L-11 | A+B | P2 | White-label: per-org domain/logo/colors, no LeadDaddy leak into client orgs | Claude | Open | — |

## P3 — polish

| ID | App | Sev | Item | Owner | Status | Evidence |
|---|---|---|---|---|---|---|
| LD-023 | B | P3 | Apex card "Draft" vs Live filter count | Claude | Open | — |
| LD-026 | B | P3 | /Domains empty filter shows blank grid | Claude | Open | — |
| LD-027 | B | P3 | AIWebsiteWizard preset/stepper bugs | Claude | Open | — |
| LD-028 | B | P3 | Softphone slow open, Call button clipped at 812px | Claude | Open | — |
| LD-029 | B | P3 | /crm vs /CRM duplicates, two H1s | Claude | Open | — |
| LD-030 | B | P3 | 404 page shows AEO marketing block inside the app | Claude | Open | — |
| L-12 | B | P3 | Fold Track A libraries into Track B per track-b-foldback.md (only if time) | Claude | Open | — |

## Work log

### Day 1 — 2026-11-09
- Ledger created from goal prompt v3, `LeadDaddy_Bug_List_2026-11-08.csv` (32 rows) and the bug-fix plan PDF (rasterized; adds NEW-1..3). Launch items L-1..L-12 added for PPC + AppSumo.
- Track A PR #1 (CRM workspace) was already merged and deployed before today (PROGRESS.md, deploy `0dc2995`).
- Track B working tree on the PC has uncommitted WIP; all Track B work runs in separate git worktrees so it is untouched.
- Gates (2026-11-09): A @ f07e575 lint PASS, tsc PASS, 70/70 tests; B main lint + typecheck + build PASS, tests 338/1 FAIL; B PR #1 tests 350/1 FAIL (same two pre-existing failures).
- This machine is out of commit memory (~1.4 GB free of 80 GB virtual); local `next build` dies allocating 5 MB. Builds are proven on CI / Vercel preview instead.
- Fixed L-13 (TCPA SMS chokepoint): Track A PR #2, CI green incl. build.
- Track B PRs opened (merge needs Steve): #2 edge-function types (CI deno check), #3 `.gitattributes` LF.
- L-14 raised to P0: all 82 tenant tables default `organization_id` to Go Buy Leads' org.
