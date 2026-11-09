# Track B Fold-Back Plan — proven Track A pieces into `Smannenbach/leaddaddy`

Status: PLAN ONLY. The main repo stays untouched until after BFCM (stability rule).
Each item lists why it's proven in Track A and the expected porting cost.

## Tier 1 — port first (pure logic, zero UI coupling)

| Piece | Location (Track A) | Why proven | Porting cost |
|---|---|---|---|
| Auto-select AI router | `src/lib/ai/router.ts` + `providers.ts` | Day-1–14 core; picks cheapest capable model per intent; reason logged | S — swap env access for the main app's config; keep rule table |
| Sequence planner | `src/lib/campaigns/sequences.ts` | 9 unit tests; due-step + eligibility logic | S — pure functions, drop-in |
| Capture validation | `src/lib/capture/validate.ts` | Honeypot + shape rules proven live | S |
| Rate limiter | `src/lib/ratelimit.ts` | Public-endpoint hardening | S |

## Tier 2 — port with adaptation

| Piece | Adaptation needed |
|---|---|
| Verification pipeline (Reoon/RealValidito + latest-status lookups) | Main app has its own `email_verification`/`phone_verification` tables (same names, same DB org conventions) — port `src/lib/verify/*` nearly verbatim; align org scoping with Base44 tenant helper |
| Sequence runner (advance + cron) | Main app campaigns live in its own automation tables; wrap the same `nextDueStep`/`skipReason` over its models; reuse consent gate semantics |
| Public capture endpoint | Point at main app's lead ingest (`unified_lead` exists there too) |

## Tier 3 — evaluate, don't port blindly

- Console UI panels (main app has its own design system on Base44 components)
- Twilio/Resend channel wrappers (main app already has Twilio UI components — reconcile first)
- The whole `crm_contact` mapping (main app has richer CRM entities; avoid double-mapping)

## Process

1. After BFCM: pick Tier 1 items, port behind feature flags in the main repo.
2. Gate: main repo's own test suite + staging E2E must stay green (3,653 tests today).
3. Update this plan with what actually landed; delete what was rejected and why.
