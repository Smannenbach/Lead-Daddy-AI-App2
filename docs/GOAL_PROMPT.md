# GOAL PROMPT — LeadDaddy.ai Dual-Track Production (paste into Claude Code / Claude Cowork)

## MISSION

Ship and operate **two versions of LeadDaddy.ai**, working repo-first, with teammates
**Steve Mannenbach (steve@loandaddy.ai)** and **Mykoal DeShazo (mykoal@loandaddy.ai)**.

- **TRACK A (URGENT, 14 days):** `Smannenbach/LeadDaddy.ai` — the LEAN rebuild. Core CRM +
  web scraping + contact verification + AI-powered outreach (call/SMS/email), **LIVE in
  production before Black Friday–Cyber Monday 2026 (Nov 27–30)**. Speed over features.
- **TRACK B (parallel, no hard date):** `Smannenbach/leaddaddy` — the MAIN repo (All-in-One
  AI CRM, funnel builder, unified inbox, agency SaaS OS). Continue feature development;
  keep production stable; fold proven pieces from Track A back in.

Re-run this goal until every gate below is **honestly** complete. Do not restart from
scratch; resume from the state described here. When the user says `go`, continue
autonomously through all completable work; stop only for: missing credentials, browser
admin steps only Steve can do, purchases, or explicit production deploys — for those,
prepare exact copy-paste runbooks and keep building everything that is not blocked.

---

## NON-NEGOLIABLE HOUSE RULES

1. **Compliance (mortgage):** business-purpose loans only — never owner-occupied, never
   second homes. No legal/tax/investment advice from any AI agent. TCPA consent before
   any SMS/voice outreach; honor STOP instantly. Kill switch stays intact.
2. **Entity separation:** Barrett Financial vs Loan Daddy LLC vs MIB Agency — never mix
   branding, sender identity, or credentials. Never reference American Pacific Mortgage.
3. **Gated actions — always ask Steve first:** git commits/pushes, production deploys,
   Cloudflare resource creation, GHL bulk SMS/email, bulk DND clears, domain/DNS changes,
   paid purchases. Everything local and reversible: just do it.
4. **Secrets:** never print, commit, or echo secret values. House copies live in
   `C:\Users\steve\OneDrive\Desktop\04_Software, Apps & AI\All Project API Keys and Secrets MAIN.docx`
   and in the Windows user environment (`HKCU\Environment`). Report presence/absence only.
   `.env*` files are gitignored; gitleaks must stay clean.
5. **Verification before claiming done:** typecheck + lint + build green is required but
   not sufficient — prove the user-visible flow end-to-end (real calls, real verifications)
   or say exactly what is unproven. Never paper over failures.

---

## TEAM & COLLABORATION

| Who | Email | Role |
|---|---|---|
| Steve Mannenbach | steve@loandaddy.ai | Admin, final approver on gated actions |
| Mykoal DeShazo | mykoal@loandaddy.ai | Teammate/collaborator — same access, shared rooms |

- **Slack:** workspace **LoanDaddy.ai** (team `T0B9HG11ULU`), channel **#lead-daddy-ai**
  (Steve + Myke are members). Steve's Slack user ID: `U0B9BR85WKG`.
- **Shared AI workspace:** `C:\Users\steve\Projects\lead-daddy-ai-studio` — Next.js 16 +
  Supabase app "Lead Daddy AI Studio" (magic-link auth; both emails auto-admin; shared
  chat rooms with model router Claude/GPT/Qwen; agent personas; BYOK; $50/user/month
  budget caps; usage dashboard). Code-complete, NOT yet provisioned/deployed.
- **Slack AI bridge:** `C:\Users\steve\Projects\lead-daddy-ai-bridge` — Cloudflare Worker
  (`!claude/!gpt/!qwen`, `!agent loan-officer|dev-pair|code-reviewer`, thread memory in KV).
  Code-complete + tested; needs Slack app creation (manifest in repo) + `wrangler deploy`.
- Shared memory for all agents: `C:\Users\steve\.ai-memory\` (INDEX.md first; HIVE.md is
  the live status board; topics/learnings.md for durable lessons). Update after every
  non-trivial task. There is a compiled asset inventory at
  `~/.ai-memory/topics/leaddaddy-inventory.md` — read it, keep it current.

---

## TRACK A — LEAN REBUILD (the 14-day clock)

**Repo:** `Smannenbach/LeadDaddy.ai` → local at `C:\Users\steve\Projects\lead-daddy-rebuild`
(already cloned; build green as of kickoff).
**Stack:** Next.js 16 App Router + TypeScript + Tailwind v4 + Supabase (RLS) + Vercel.

### Already built (do not rebuild — extend)

- **AI layer** (`src/lib/ai/`): provider router (Claude/GPT/Qwen live; Gemini/Kimi slots
  dead-keyed until rotated), **auto-select** (`router.ts`: intent rules → cheapest capable
  provider + right agent, reason logged per run), agents: `sales-caller`, `lead-verifier`,
  `campaign-writer`, `scraper-analyst`; `ai_runs` budget guard (`AI_MONTHLY_BUDGET_USD`).
- **Real integrations:** Reoon email verification, RealValidito phone validation,
  Firecrawl scrape + AI digest, Twilio SMS + AI voice webhook (`/api/channels/voice`),
  Resend email, Composio LinkedIn/social bridge (`/api/social`).
- **APIs:** `/api/ai`, `/api/leads`, `/api/leads/[id]/verify`, `/api/scrape`,
  `/api/campaigns` (launch hard-gated on verified contacts), `/api/social`, `/api/channels/voice`.
- **Console UI** (`/`): pipeline stats, scrape box, lead table with verify buttons, auth.
- **Schema:** `supabase/migrations/0001_init.sql` exists (leads, contact_points, verifications,
  campaigns, activities, ai_runs, profiles + RLS + auth trigger) but is **NOT applied** —
  Day 1 decision: the app adapts to the live Base44 schema instead (see the resolved
  CRITICAL DECISION below and `docs/ARCHITECTURE.md`).
- **`.env.local` is already written** on this machine with the Supabase project
  `zdnlouluogpdfhygdnjn` URL/keys + all provider keys pulled from the Windows environment.

### CRITICAL DECISION — database (RESOLVED 2026-11-08, Day 1)

**Chosen: Option A — the app adapts its queries to the existing live Base44 tables.**
Details (mapping, service-role data access, email-allowlist authz, frozen API contract)
are binding in `docs/ARCHITECTURE.md`; recorded in README + `docs/PROGRESS.md`.

Supabase project **`zdnlouluogpdfhygdnjn` ("LeadDaddy.ai", us-east-1) is the LIVE Base44
app database** — historical context only (decision above is final): 91 existing public
tables ALREADY covering the lean feature set:
`leads` (24 cols: name/company/title/email/phone/website/linkedin_url/raw_data…),
`email_verification` (15 cols incl. deliverability/smtp_check/risk), `phone_verification`
(17 cols incl. carrier/dnc_status/reachability), `linked_in_prospect` (23 cols),
`dialer_campaign`, `social_media_account`, `scrape_jobs`, plus AI tables
(`ai_provider`, `ai_model`, `ai_routing_preference`, `prompt_registry`).
**Do NOT run `0001_init.sql` against it (it collides).** Option A — adapt the app's
queries to the existing tables — was chosen on Day 1 (recorded in README +
`docs/ARCHITECTURE.md` + `docs/PROGRESS.md`; HIVE.md update queued for orchestrator).

### Track A — 14-day plan

**Days 1–3 (foundation):** DB decision applied; auth live (email magic link; set Supabase
Auth redirect allowlist for the app URL + localhost — current `site_url` is
`https://leaddaddy.ai`); deploy to a NEW Vercel project (suggest `leaddaddy-ai` on team
`steve-projects`) — do NOT disturb the live `steve-projects/leaddaddy` project that serves
the main app; leads CRUD proven against the chosen schema.
**Days 4–7 (pipeline):** scrape → `lead-verifier` AI extraction → lead + contact_points
created automatically; one-click verify (Reoon + RealValidito) with results persisted;
CSV import of lead lists.
**Days 8–10 (outreach):** campaign sequence runner (email → wait → SMS → call) with
AI-written copy per campaign; consent gate enforced in code; SMS/email sending live via
Resend + Twilio; Twilio number wired for the voice webhook (needs `APP_BASE_URL`).
**Days 11–12 (BFCM surfaces):** BFCM landing page + offer on the lean app; LinkedIn/social
posting via Composio for the promo; UTM tracking into `activities`.
**Days 13–14 (harden + launch):** RLS audit, budget caps on, error monitoring
(Vercel logs + a health endpoint), runbook (`docs/OPS.md`), production deploy, smoke
test with Steve + Myke on the live URL. BFCM ready = leads scrape/verify and receive
email+SMS, AI voice answers, dashboard shows it all.

### Track A definition of done (BFCM gate)

- [ ] Live production URL on a LeadDaddy domain/subdomain (e.g. `app2.leaddaddy.ai` or
      `leaddaddy.ai` apex — Steve decides; DNS is on Cloudflare, fast to switch)
- [ ] Steve and Myke both signed in via magic link, both can see shared leads
- [ ] Scrape URL → verified leads → campaign launched → real email + SMS delivered
- [ ] AI voice webhook answers a real Twilio call
- [ ] Usage/cost dashboard visible; AI budget guard fires correctly
- [ ] RLS verified (user A cannot read user B's private data; service role only server-side)
- [ ] Zero secrets in git; gitleaks clean

---

## TRACK B — MAIN REPO (parallel, stability-first)

`Smannenbach/leaddaddy` (Base44-synced "All-In-One AI CRM / Funnel Builder / Unified
Inbox / Agency SaaS OS", local `C:\Users\steve\leaddaddy`), live at leaddaddy.ai +
app.leaddaddy.ai via Vercel `steve-projects/leaddaddy`. Only 2 env vars (Supabase anon) —
server secrets live in HKCU/Cloudflare, not Vercel.

- Keep production stable: no breaking changes to live funnels/inbox during BFCM push.
- Fold BACK proven Track A pieces after BFCM (auto-select AI router, verification
  pipeline, sequence runner) — the main DB is `nikdeasddmisxcaxuwbp` ("LoanDaddy.ai",
  us-west-2, 322 tables — distinct from the lean DB; mind the naming).
- Known debt to schedule post-BFCM: `loandaddy` repo is 409 MB (git history bloat);
  duplicate repos (`StephenMannenbach.com`/`SteveMannenbach.com`,
  `Command-Center`/`ai-command-center`, `LoanGenius_1`/`loan-genius`); stale
  `loan-daddy-os` Vercel project points at a nonexistent `nexus` repo.

---

## ASSET MAP (verified 2026-11; full detail in ~/.ai-memory/topics/leaddaddy-inventory.md)

- **AI keys (live, HKCU):** ANTHROPIC, OPENAI, QWEN (+`QWEN_BASE_URL` dashscope-intl),
  PERPLEXITY, FIRECRAWL, REOON, REALVALIDITO, RESEND, COMPOSIO, GEMINI (402 dead),
  MOONSHOT/Kimi (dead — rotate at platform.kimi.ai to enable), TWILIO (sid/token/from).
- **Composio (active connections):** GitHub (Smannenbach), Supabase x2 orgs, Vercel,
  Slack (LoanDaddy.ai). Use as the tool-connection plane; add LinkedIn/social connections
  per user for `/api/social`.
- **Slack workspace LoanDaddy.ai:** apps installed incl. native Claude (org has "Claude
  Tag" OFF — bridge avoids this via API keys), Cursor, Apollo, Vercel, GitHub, Perplexity,
  Google Drive/Calendar, quote_generator_bot (lacks channel scopes — bridge needs its own
  app per `slack-app-manifest.yml`).
- **GoHighLevel:** PIT tokens in HKCU (`GHL_PIT_TOKEN`, `GHL_LOANDADDY_PIT`,
  `GHL_PIT_TOKEN_MIB_AGENCY` — ⚑ 3 tokens, confirm which are live); MCP launchers in
  `~/.ai-orchestrator/mcp-servers/` (leadconnector, ghl-mesh, loandaddy-lo, consent guard,
  kill switch). Composio's `mcp__gohighlevel__*` is also connected.
- **Vercel team `steve-projects`:** live `leaddaddy`, `loandaddy`, `phonedaddy` +
  api.phonedaddy.ai (⚑ project misnamed "staging" but hosts PROD API), `branddaddy`,
  DSCR satellite fleet (dscrcalculator.com, dscrloan.loan, dscrinvesting.com,
  loanbrokerdirectory.com…), 8 placeholder *daddy.ai shells (brokerdaddy, dealdaddy…).
- **Supabase:** MIB Agency org = LeadDaddy.ai (`zdnlouluogpdfhygdnjn`, lean DB),
  LoanDaddy.ai (`nikdeasddmisxcaxuwbp`, main DB, 322 tables), PhoneDaddy.ai, BrandDaddy.ai,
  LoanOfficerBot.com, GoBuyLeads.com, LoanGenius.ai (507 tables ⚑), training sandbox;
  Steve's Projects org = Lead Extractor + 2 paused junk projects (delete candidates).
- **Cloudflare (235 zones):** leaddaddy.ai + loandaddy.ai (⚑ `sites.leaddaddy.ai` still
  points at stale base44.onrender.com), phonedaddy.ai, branddaddy.ai, ~55-zone DSCR
  keyword farm, 6 Workers (loandaddy-lead-engine, loan-daddy-os, ghl-agent-mesh,
  dscr-service, loan-officer-agents⚑stale, kv-get-started⚑junk).
- **Domains (Name.com 67 / Namecheap 47 / Spaceship 124):** core = leaddaddy.ai
  (Spaceship, exp 2027-08-06), loandaddy.ai (Namecheap, exp 2030). ⚑ No .com for either
  brand; ~90-domain Spaceship SEO fleet is thin/parked — consolidation candidates.
- **Desktop assets:** `OneDrive\Desktop\04_Software, Apps & AI\Lead Daddy and LaunchGrid\`
  = 176-file JSX component library (softphone, bulk verifiers, LinkedIn outreach, social
  manager, CRM, workflows, master prompts — shadcn+lucide+Base44 conventions → port by
  swapping `@/api/entities` for Supabase) + 7 roadmap/blueprint docs + superagentx clone.
- **Local builds this session (all code-complete, awaiting provisioning):**
  `Projects\lead-daddy-ai-studio` (team AI workspace), `Projects\lead-daddy-ai-bridge`
  (Slack bot), `Projects\lead-daddy-rebuild` (Track A).

---

## REPORTING

- Keep `~/.ai-memory/HIVE.md` current (replace stale status, don't append history).
- Append durable lessons to `~/.ai-memory/topics/learnings.md`.
- End every work session with: what changed, what gates passed (with evidence), what's
  blocked and the exact unblocking step, and the next 3 moves.
