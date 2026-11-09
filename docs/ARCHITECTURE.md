# LeadDaddy.ai — Architecture & Data Model (Day 1 decisions)

**Status:** binding for all agents. The API contract below is **frozen** — other routes,
the console UI, and future features depend on it exactly. Changes require orchestrator
approval.

## Database decision (2026-11-08, Day 1)

The app **adapts to the existing live Base44 schema** in Supabase project
`zdnlouluogpdfhygdnjn` (org `e5eef388-09e1-4fd4-9e93-19121d60125b`, "Go Buy Leads LLC",
us-east-1). This is the LIVE database backing the Base44 LeadDaddy.ai app — do not create
new tables for entities that already exist.

- `supabase/migrations/0001_init.sql` is **NOT applied** and must never be run against
  this project (table-name collisions with live data). It is kept in the repo as
  reference for the AI-layer tables (`ai_runs`) only. If `ai_runs` is ever materialized,
  it gets its own non-colliding migration.
- All existing tables carry **Base44 RLS** policies scoped to Base44's auth model. The
  anon key therefore returns **zero rows** on these tables. See "Data access pattern".

## Schema mapping

| App concept | Live table | Key columns |
|---|---|---|
| CRM contact / lead | `crm_contact` | `id`, `organization_id`, `first_name`, `last_name`, `email`, `phone`, `company`, `job_title`, `lead_source`, `lead_score`, `stage`, `tags`, `custom_fields`, `social_profiles`, `created_date`, `updated_date` |
| Email verification result | `email_verification` | `email`, `verification_status`, `deliverability`, `risk_assessment`, `verification_source`, `confidence_score`, `organization_id`, … |
| Phone verification result | `phone_verification` | `phone_number`, `verification_status`, `carrier_info`, `dnc_status`, `reachability`, … |
| Campaign header | `marketing_campaign` | `name`, `status`, `start_date`, `end_date`, `target_audience` (jsonb), … |

Conventions:

- Multi-tenant: rows are scoped by `organization_id`. All queries and inserts must
  include the org id (single-org app today — use one fixed org id constant; do not
  enumerate other orgs' rows).
- Timestamps on `crm_contact` are `created_date` / `updated_date` (not `created_at`).
- Verification tables are keyed by **contact point value** (`email` / `phone_number`),
  not by contact id. "Latest status" for a contact = most recent row matching its
  email/phone; absent row ⇒ status `"unverified"`.
- `email_status` values come from `email_verification.verification_status`;
  `phone_status` from `phone_verification.verification_status`.

## AuthN / AuthZ — no `profiles` table

There is **no `profiles` table** in this database (that was part of the un-applied
`0001_init.sql`). Authorization is an **email allowlist** instead:

1. Every API route first verifies the caller with the cookie-based Supabase client
   (`createClient()` → `supabase.auth.getUser()`). No session ⇒ `401`.
2. Admin-gated routes (`/api/ai`, `/api/scrape`, `/api/social`, `/api/campaigns`)
   additionally require `user.email` ∈ `ALLOWED_EMAILS` (comma-separated, case-insensitive
   match after trimming). Default when the env var is unset:
   `steve@loandaddy.ai,mykoal@loandaddy.ai`. Failure ⇒ `403`.
3. Any previous `profiles.role` check is replaced by this allowlist check. Do not
   reintroduce a profiles lookup.

## Data access pattern (important — RLS reality)

Because Base44 RLS denies the anon key on every business table, the pattern for **all**
data reads/writes inside API routes is:

```
const userClient = await createClient();          // cookie client (anon key) — AUTH ONLY
const { data: { user } } = await userClient.auth.getUser();
if (!user) → 401
// admin routes: if (!isAllowedEmail(user.email)) → 403

const db = createServiceClient();                 // service-role client — DATA ONLY
// all .from("crm_contact") / etc. go through `db`, never through the cookie client
```

Rules:

- The cookie/anon client is used **only** to establish who the caller is. Never query
  business tables with it (you'd get zero rows or RLS errors).
- The service-role client bypasses RLS, so authorization must happen in code first
  (steps 1–2 above) before any service-role query. Never expose the service client to
  the browser; it is used server-side in route handlers only.
- `createClient` and `createServiceClient` already live in `src/lib/supabase/server.ts`.

## Frozen API contract

### `GET /api/leads`

Response `200`:

```json
{
  "leads": [
    {
      "id": "…",
      "first_name": "Ada",
      "last_name": "Lovelace",
      "company": "Acme",
      "job_title": "CTO",
      "email": "ada@acme.com",
      "phone": "+1…",
      "stage": "new",
      "email_status": "valid",
      "phone_status": "unverified"
    }
  ]
}
```

- `email_status` / `phone_status` = latest `verification_status` from
  `email_verification` / `phone_verification` for the contact's email/phone, or
  `"unverified"` when no row exists.

### `POST /api/leads`

Body (JSON):

```json
{ "first_name": "Ada", "last_name": "?", "email": "?", "phone": "?", "company": "?", "job_title": "?" }
```

Only `first_name` is required. Response `201`: `{ "id": "…" }`.
(Insert into `crm_contact` with `organization_id` set; unset optional fields → null.)

### `POST /api/leads/[id]/verify`

Runs Reoon (email) and RealValidito (phone) for the contact's stored contact points and
persists results to the verification tables. Response `200`:

```json
{
  "contactId": "…",
  "results": [
    { "kind": "email", "value": "ada@acme.com", "provider": "reoon", "result": "valid" },
    { "kind": "phone", "value": "+1…", "provider": "realvalidito", "result": "unknown" }
  ]
}
```

`result` ∈ `valid | invalid | risky | unknown`.

### Admin routes: `/api/ai`, `/api/scrape`, `/api/social`, `/api/campaigns`

Auth: session + `ALLOWED_EMAILS` check (see above). Internal behavior unchanged from the
original design except for the authorization mechanism.

## Unchanged from the original design

AI provider router (`src/lib/ai/`), agents, Twilio voice/SMS, Resend, Reoon,
RealValidito, Firecrawl, Composio bridge, cost guard via `ai_runs` logging — all as
described in `docs/superpowers/specs/2026-02-11-leaddaddy-rebuild-design.md` and the
README. The Day 1 amendment touches **data access and authorization only**.

## Environment variables (names only)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAILS` (optional; default above), plus the
provider keys documented in `docs/SETUP.md`. Secrets are never committed; `.env*` is
gitignored.
