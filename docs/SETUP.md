# LeadDaddy.ai Rebuild — Setup & Deploy Runbook

Code-complete and locally verified (`tsc` clean, `npm run build` green). Remaining steps
need your accounts; everything else is copy-paste.

## Step 1 — Supabase project (~2 min)

**No migration, no new project.** The app uses the existing live Base44 database:
project `zdnlouluogpdfhygdnjn` (org "Go Buy Leads LLC", us-east-1). Do **not** run
`supabase/migrations/0001_init.sql` — it collides with live tables.

1. Supabase Dashboard → project `zdnlouluogpdfhygdnjn` → Settings → API → copy
   **Project URL**, **anon public key**, **service_role key** (the app needs the service
   role because Base44 RLS blocks the anon key on business tables; routes verify the
   user first, see `docs/ARCHITECTURE.md`).
2. Authentication → URL Configuration → Site URL `http://localhost:3000` (add the Vercel
   URL after deploy).

## Step 2 — Local env

```powershell
cd C:\Users\steve\Projects\lead-daddy-rebuild
Copy-Item .env.local.example .env.local
# Fill Supabase values. For the service keys, pull from your Windows user env:
#   [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY','User')  etc.
# Keys already present in your environment: ANTHROPIC/OPENAI/QWEN (+QWEN_BASE_URL intl),
# REOON, REALVALIDITO, FIRECRAWL, TWILIO x3, RESEND, COMPOSIO.
# Optional: ALLOWED_EMAILS (comma-separated) gates /api/ai, /api/scrape, /api/social,
# /api/campaigns. Defaults to steve@loandaddy.ai,mykoal@loandaddy.ai when unset.
# Set APP_BASE_URL=http://localhost:3000 for local voice-webhook testing (needs a tunnel).
```

## Step 3 — Local smoke

```powershell
npm run dev
# /login -> magic link -> console (steve@ or mykoal@ — both on the default allowlist)
# Console: scrape https://example.com -> AI digest appears (service-role data path)
# POST /api/leads {"first_name":"Test","email":"you@example.com"} -> {id} -> appears in list
# POST /api/leads/<id>/verify -> Reoon/RealValidito run -> email_status/phone_status update
```

Leads list should show live `crm_contact` rows (the shared Base44 org's data) with
`email_status` / `phone_status` from the latest verification rows, or `unverified`.

## Step 4 — Vercel deploy (needs your go)

```powershell
npx vercel link    # steve-projects team, new project (suggest: leaddaddy-ai)
# add env vars (same as .env.local) - npx vercel env add <NAME> production
npx vercel --prod
```

## Step 5 — Twilio voice webhook

1. Twilio Console → Phone Numbers → your number → Voice: webhook `https://<app>/api/channels/voice` (POST); Messaging: "A message comes in" → webhook `https://<app>/api/channels/sms` (POST) so inbound replies reach the AI agent and STOP is honored instantly.
2. Set `APP_BASE_URL=https://<app>` in Vercel env.
3. Test: `PATCH /api/campaigns` launch gate or call your Twilio number.

## Step 6 — Email + social

1. Resend: verify sending domain, set `EMAIL_FROM`.
2. Composio: `/api/social` GET shows connection status per network; connect LinkedIn/Twitter/etc.
   in your Composio dashboard, then POST with the `connectedAccountId`.

## House rules reminder

Production deploy and any commit/push wait for your explicit go per workspace rules.

## Email throughput note (before inviting Myke / launching campaigns)

Supabase's built-in email service caps magic-link sends at ~4/hour. For two teammates
plus BFCM traffic, configure a custom SMTP provider (Resend SMTP works with the existing
RESEND credentials): Supabase Dashboard → Authentication → Sign In / Providers → Email →
SMTP Settings. Until then, expect magic-link delays.

## Launch-readiness findings (verified 2026-11-09)

1. **Twilio number +1 480-690-2666 is SHARED with production** — its voice_url currently
   serves the main LoanDaddy Supabase edge function and sms_url serves Arive LOS. Do NOT
   repoint it for the lean app. Either buy a new number (~$1.15/mo, Twilio Console) or make
   a conscious cutover decision with Steve.
2. **A2P 10DLC: no brand registered** (0 brands on the account). For BFCM SMS volume,
   register an A2P brand + campaign in Twilio Console first, or carrier filtering will
   throttle/block messages. There is a "Low Volume Mixed" messaging service usable for
   tiny volume only.
3. **Email: use SendGrid, not Resend** — all three known Resend keys are dead (401).
   SendGrid key in the Windows environment is live with loandaddy.ai domain-authenticated
   (valid) and verified sender steve@loandaddy.ai. The app auto-selects SendGrid when
   SENDGRID_API_KEY is set; EMAIL_FROM defaults to "LeadDaddy.ai <steve@loandaddy.ai>".
