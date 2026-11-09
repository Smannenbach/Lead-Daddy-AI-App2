# LeadDaddy.ai — Lean AI-First Rebuild

The fast path to production. Fewer features than the main repo (`Smannenbach/leaddaddy`),
every feature AI-powered, with a scrape → verify → engage pipeline for outbound lead
campaigns by call, SMS, and email.

## What's inside (all working code, not stubs)

| Capability | Implementation |
|---|---|
| **All AI models, one router** | Claude / GPT / Qwen (validated keys); Gemini/Kimi slots ready when keys rotate |
| **Auto-select model + agent** | `src/lib/ai/router.ts` — transparent intent rules pick the cheapest capable provider + the right agent; every pick logged with its reason in `ai_runs` |
| **Agents** | `sales-caller`, `lead-verifier`, `campaign-writer`, `scraper-analyst` |
| **Calling** | Twilio voice + `/api/channels/voice` AI answer webhook (per-turn auto-select) |
| **Texting** | Twilio SMS (send + console) |
| **Emailing** | Resend |
| **Email verification** | Reoon (real) — `/api/leads/[id]/verify` |
| **Phone validation** | RealValidito (real) — same endpoint |
| **LinkedIn + social post** | Composio bridge — `/api/social` lists per-user connections, posts via connected accounts |
| **Web scraping** | Firecrawl extract + AI digest — `/api/scrape` |
| **Campaigns** | Create + launch; launch is **blocked until every recipient has a verified contact point** for the first channel |
| **Cost control** | `ai_runs` logs tokens + estimated USD per call; `AI_MONTHLY_BUDGET_USD` enforced pre-call |

## Hard guardrails (in code)

- No outreach to unverified contact points (launch gate + channel checks).
- SMS/voice require `consent_status = 'granted'` on the lead (TCPA).
- Business-purpose positioning only; agents never give legal/tax advice.

## Stack

Next.js 16 (App Router) · Supabase (Auth + Postgres + Base44 RLS) · Vercel.
Design doc: `docs/superpowers/specs/2026-02-11-leaddaddy-rebuild-design.md`.
Data model + frozen API contract: `docs/ARCHITECTURE.md` (binding).

## Database (Day 1 decision, 2026-11-08)

The app **adapts to the live Base44 schema** in Supabase project `zdnlouluogpdfhygdnjn`
(org "Go Buy Leads LLC") instead of creating new tables:

- CRM contacts → `crm_contact` · email verification → `email_verification` ·
  phone verification → `phone_verification` · campaigns → `marketing_campaign`.
- `supabase/migrations/0001_init.sql` is **not applied** (collides with live tables);
  reference only.
- Base44 RLS blocks the anon key, so API routes verify the user with the cookie client,
  then use the **service-role client** for all data access. There is **no `profiles`
  table** — admin routes gate on an email allowlist (`ALLOWED_EMAILS`, default
  `steve@loandaddy.ai,mykoal@loandaddy.ai`).

## Verify

```bash
npm ci && npx tsc --noEmit && npm run build
```

## Setup

See `docs/SETUP.md` — no migration needed (live tables), `.env.local` (all keys already
exist in your Windows user environment), Vercel deploy, Twilio voice webhook config.

## Phase 2 (designed, not built)

1. Sequence runner: timed multi-step campaigns (email → wait → SMS → call) with AI-written copy.
2. Scrape → lead auto-creation (pipe `lead-verifier` JSON into `POST /api/leads`).
3. Inbound handling (SMS reply webhooks → AI continuing conversation).
4. Usage dashboard UI (ai_runs aggregates).
