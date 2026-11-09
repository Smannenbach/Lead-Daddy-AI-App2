# Migrations are INTENTIONALLY ABSENT — never run DDL here.

The app adapts to the **live Base44 schema** in Supabase project
`zdnlouluogpdfhygdnjn` (org "Go Buy Leads LLC"). That project hosts the running
Base44 app with 91+ public tables; any `create table` migration collides with them.

- The previous `0001_init.sql` (profiles/leads/contact_points/...) was removed on
  2026-02-11 under the adapt-to-live-schema decision (Day 1 of the lean rebuild).
- App tables: `crm_contact`, `email_verification`, `phone_verification`,
  `marketing_campaign`. Column types live in `src/lib/supabase/database.types.ts`
  (hand-maintained from a read-only `information_schema` capture).
- Data access pattern: API routes verify the Supabase Auth user, check the email
  allowlist (`src/lib/auth.ts`), then read/write via the service-role client.
- If a column is ever missing, inspect the live table and extend
  `database.types.ts` — do NOT add migrations to this folder.
