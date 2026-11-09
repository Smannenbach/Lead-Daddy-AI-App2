# LeadDaddy.ai Rebuild — Design

> **Day 1 amendment (2026-11-08):** this spec predates the database decision. The app
> adapts to the **live Base44 schema** (tables `crm_contact`, `email_verification`,
> `phone_verification`, `marketing_campaign`) with service-role data access after auth,
> and uses an **email allowlist** instead of the `profiles` table. `0001_init.sql` is
> not applied. The sections below about `leads` / `contact_points` / `verifications` /
> `profiles` describe the superseded original schema. The binding reference is
> `docs/ARCHITECTURE.md`; the frozen API contract there overrides this document.

**Date:** 2026-02-11
**Repo:** `Smannenbach/LeadDaddy.ai` (cloned at `Projects/lead-daddy-rebuild`)
**Sibling:** main repo `Smannenbach/leaddaddy` (feature-rich, longer path to production)

## Intent

A lean, AI-first LeadDaddy.ai that reaches live production fast. Fewer features, every
feature AI-powered, with an AI layer that auto-selects the best model/agent per request,
and a scrape → verify → campaign pipeline for outbound lead engagement.

## Feature set (MVP)

| Feature | Implementation | Status |
|---|---|---|
| AI model integrations (all) | Unified provider router: Claude / GPT / Qwen live; Gemini/Kimi slots ready | built |
| Auto-select best model/agent | Transparent rule-based router (intent signals → provider + agent + reason, logged per run) | built |
| AI agents | Persona registry: sales-caller, lead-verifier, campaign-writer, scraper-analyst, dev-pair | built |
| Calling | Twilio voice: outbound call init + `/api/voice` TwiML webhook (AI answers via agent loop) | built (interface + wiring) |
| Texting | Twilio SMS send + status webhook | built |
| Emailing | Resend transactional send | built |
| Email verification | Reoon API | built (real) |
| Phone validation | RealValidito API | built (real) |
| LinkedIn + social connect/post | Composio REST bridge (connections per user; LINKEDIN/SOCIAL toolkits) | interface + bridge |
| Web scraping + verification | Firecrawl extract → normalization → Reoon/RealValidito verification → lead record | built (real) |
| Campaigns | Lead list + channel sequence (call/SMS/email steps), launch gate: all contacts verified | schema + API stub |

## Non-goals for this rebuild

Funnel builder, agency multi-tenancy, unified inbox, mortgage pricing engines (those live
in the main `leaddaddy` repo). This app is the outbound AI SDR machine.

## Architecture

```
Next.js 16 (Vercel) + Supabase (RLS)
  /api/ai           auto-select chat + agent loop endpoint (logs ai_runs: pick + reason)
  /api/leads        lead CRUD (name, company, source)
  /api/leads/[id]/verify   email (Reoon) + phone (RealValidito) -> contact_points + verifications
  /api/scrape       Firecrawl URL -> structured lead + auto-verify
  /api/campaigns    create + launch (blocked until every recipient verified)
  /api/channels/*   Twilio voice webhook + SMS/email send
  /api/social/*     Composio connect + post
  /                 console: pipeline counts + quick actions
```

## Compliance guardrails (hard rules in code)

- No outreach step fires for an unverified contact point.
- SMS/voice only with TCPA consent recorded on the lead (`consent_status` + `consent_at`).
- Business-purpose positioning only; no legal/tax advice in agent prompts.
- Every AI decision logged (ai_runs: model, agent, reason, tokens, cost).

## Cost discipline

- Auto-select prefers the cheapest model that fits the task (gpt-4o-mini for extraction/
  verification triage, claude-sonnet for conversation/creative, qwen for long-context scrape digests).
- ai_runs logs estimated USD per run; monthly cap via env `AI_MONTHLY_BUDGET_USD`.
