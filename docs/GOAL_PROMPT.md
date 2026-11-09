# GOAL PROMPT v2 — LeadDaddy.ai Dual-Track: Operate, Fix Bugs, Develop (paste into Claude Code / Claude Cowork)

## MISSION

Operate and continue developing **two versions of LeadDaddy.ai** for teammates
**Steve Mannenbach (steve@loandaddy.ai)** and **Mykoal DeShazo (mykoal@loandaddy.ai)**:
fix bugs as they're found, keep both production apps stable, and keep shipping toward
Black Friday–Cyber Monday 2026 (Nov 27–30). When the user says `go`, work autonomously
through everything completable; stop only for browser-only admin steps, purchases, or
explicit production deploy approvals. Re-run this prompt until every gate below is
**honestly** complete — resume from this state, never restart.

## TEAM LOGINS (both platforms, email + password, magic link as fallback)

| Who | Email | Password |
|---|---|---|
| Steve Mannenbach | steve@loandaddy.ai | Daddy8484$ |
| Mykoal DeShazo | mykoal@loandaddy.ai | LeadDaddy2027$ |

Myke has signed in. Steve's first sign-in may still be pending — that click closes the
last BFCM checkbox.

## THE TWO PLATFORMS

### TRACK A — LEAN rebuild: `Smannenbach/LeadDaddy.ai` → LIVE
- **Prod URL:** https://app2.leaddaddy.ai (Vercel project `leaddaddy-ai`, team steve-projects)
- **Local:** `C:\Users\steve\Projects\lead-daddy-rebuild` · Next.js 16 + Supabase + Tailwind v4
- **DB:** Supabase `zdnlouluogpdfhygdnjn` ("LeadDaddy.ai", us-east-1) — LIVE shared schema:
  app ADAPTS to existing Base44-era tables (`crm_contact`, `email_verification`,
  `phone_verification`, `marketing_campaign`, `unified_lead`, `lead_event`, `ai_run_log`).
  **Never run DDL migrations against it.** Binding doc: `docs/ARCHITECTURE.md`.
- **What's proven live:** scrape→verify→campaign→real SendGrid email; AI voice agent
  (signed-webhook verified); cron auto-advance; inbound SMS w/ instant STOP; capture
  endpoint (honeypot + rate limit); budget guard. 53/53 unit tests.
- **Docs:** `docs/SETUP.md` (incl. launch-readiness findings), `docs/OPS.md` (runbook),
  `docs/PROGRESS.md` (full history), `docs/track-b-foldback.md`.

### TRACK B — MAIN app: `Smannenbach/leaddaddy` (NOT Base44 anymore)
- **Prod URL:** https://leaddaddy.ai + app.leaddaddy.ai (Vercel `steve-projects/leaddaddy`)
- **Local:** `C:\Users\steve\leaddaddy` · Vite SPA, also on Supabase `zdnlouluogpdfhygdnjn`
  (same project as Track A). Test suite: **346/346 green** (was 345/346; fixed by
  rewording an uncommitted Home.jsx footer that tripped the mortgage-term compliance scan).
- **⚠ Working tree has uncommitted changes** (index.html, Home.jsx,
  MarketingROICalculator.jsx, public/.well-known/agent-card.json) — someone's in-flight
  work; commit/push only with Steve's OK. Audit before touching.

## ENVIRONMENT / CREDENTIALS (probe before use — keys churn fast)

- Secrets master doc: `OneDrive\Desktop\04_Software, Apps & AI\All Project API Keys and Secrets MAIN.docx`
- Also in HKCU env: TWILIO (live), SENDGRID (live, loandaddy.ai domain-authenticated),
  FIRECRAWL/REOON (live), SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, COMPOSIO_API_KEY (DEAD).
- **Track A Vercel env:** 20+ vars on project `leaddaddy-ai` (targets: production+preview+development).
  Vercel PAT **cannot decrypt** env values; to change a value: DELETE + POST (PATCH won't).
- **Health check:** `GET https://app2.leaddaddy.ai/api/health` (public; reports presence not liveness).

## CURRENT BUGS / DEGRADED (fix or work around)

1. **Qwen + RealValidito + Composio keys DEAD**, no docx replacements. Mitigations shipped:
   AI auto-fails-over to next provider on 401/403 (`callModelWithFallback`); phone
   verification falls back to Twilio Lookup. Composio social = degraded until a new key
   is generated at dashboard.composio.dev (browser step for Steve).
2. **A2P 10DLC not registered** on the Twilio account (0 brands) — SMS at BFCM volume will
   be carrier-filtered. Register brand+campaign in Twilio Console (needs Steve's business
   details). Twilio number for Track A: **+1 928-370-3051** (new, dedicated; voice/sms
   webhooks → app2.leaddaddy.ai). The old +1 480-690-2666 still serves the main app/Arive
   — do NOT repoint it.
3. GitHub Dependabot: 1 moderate left (dev-only eslint chain on Track A) — upstream-pinned, document, don't force.
4. Turbopack build worker on this Windows box intermittently aborts (~1 in 3 runs,
   0xC0000409) — retry passes. Investigate only if it follows to CI.
5. Supabase magic-link rate: custom SendGrid SMTP configured (no 4/hr cap). Invite links
   ignore non-site_url redirect_to at generation but validate at redirect time.

## DEVELOPMENT PRIORITIES (in order)

1. **Bug-fix mode:** anything Steve/Myke hit while using either app — reproduce, fix,
   test, deploy (Track A: `vercel --prod --scope steve-projects` after `npm run check`;
   Track B: keep its 346-test gate green, never deploy without Steve's OK).
2. **Track A BFCM readiness:** first real scrape→verify→campaign run by Steve/Myke;
   BFCM landing page live at /bfcm (capture proven); monitor cron + spend daily per OPS.md.
3. **Track B fold-back** (post-BFCM or when Steve says go): port Tier-1 pure libs from
   Track A per `docs/track-b-foldback.md` — auto-select AI router, sequence planner,
   capture validation, rate limiter. Feature-flagged, main suite must stay green.
4. Nice-to-haves: usage dashboard UI (ai_run_log aggregates), prompt caching, LinkedIn
   social posting once Composio is regenerated.

## HOUSE RULES (non-negotiable)

1. **Compliance:** business-purpose loans only; no legal/tax/investment advice from AI;
   TCPA consent before SMS/voice (enforced in code — keep it that way); honor STOP instantly.
2. **Entity separation:** Barrett Financial vs Loan Daddy LLC vs MIB Agency — never mix
   branding/sender identity. No American Pacific Mortgage references.
3. **Gated (ask Steve first):** commits/pushes to Track B, any production deploy of Track B,
   Cloudflare/DNS changes, purchases, GHL bulk sends, A2P submissions.
4. **Secrets:** never print/commit/echo values; gitleaks before every push; `.env*` gitignored.
5. **Verify before claiming done:** typecheck + lint + tests + build, then prove the
   user-visible path. Evidence over assertions. No papering over failures.
6. **Memory:** after non-trivial work update `~/.ai-memory/HIVE.md` + `topics/learnings.md`;
   read `~/.ai-memory/topics/leaddaddy-inventory.md` for the full asset map.

## STATE SNAPSHOT (2026-11-09)

Track A: feature-complete, hardened, every claim proven on production, 53/53 tests.
Track B: stable, 346/346 tests, uncommitted WIP in tree (not ours — hands off until cleared).
Keys: Anthropic/OpenAI rotated to live keys today; churn is aggressive — probe on any
launch day. Myke signed in; Steve's first click pending. Both platforms share password
logins (see table) + magic-link fallback.
