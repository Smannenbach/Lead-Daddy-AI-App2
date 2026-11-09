# LeadDaddy.ai (lean) — Operations Runbook

For the on-call human (Steve or Myke). Everything here assumes the app is deployed on
Vercel (`steve-projects` team) with env vars from `docs/SETUP.md`.

## Health & monitoring

- `GET /api/health` → `{ok, db, providers}` — `ok:false` or HTTP 503 = something is down.
  Check Vercel logs first (`vercel logs <deployment-url>`), then Supabase status.
- Cron: `/api/campaigns/cron` runs every 15 min (vercel.json). Verify in
  Vercel → project → Settings → Crons that invocations are succeeding.
- Spend: AI budget guard reads `ai_run_log.cost_estimate` monthly sums vs `AI_MONTHLY_BUDGET_USD`.
  Query: `select sum(cost_estimate) from ai_run_log where created_date > date_trunc('month', now())`.

## Daily during a campaign

1. Console → Campaigns: confirm `sent` grows and `skipped` is explainable
   (skipped = no consent or unverified contact — fix by verifying or collecting consent).
2. Supabase SQL if needed: latest step runs live in
   `marketing_campaign.target_audience->'sequence'->'runs'`.
3. Twilio Console for delivery/errors on SMS/voice; Resend dashboard for emails.

## Common operations

- **Add a teammate:** they sign in with their @loandaddy.ai email; add the email to the
  `ALLOWED_EMAILS` Vercel env var (comma-separated) and redeploy.
- **Stop everything fast:** set campaigns `status='paused'` (SQL update) — the cron/advance
  only processes `live` campaigns. Twilio number can be suspended in Twilio Console.
- **Kill switch (GHL):** unchanged — `ghl_kill_switch.py` in `~/.ai-orchestrator/mcp-servers/`.
- **Rotate a dead provider key:** `vercel env add <NAME> production`, redeploy. No code change.
- **Duplicate leads:** dedupe is by normalized email (csv/import/capture). Manual cleanup:
  `delete from crm_contact where email = '...'` then re-add.

## Rollback

- Vercel → Deployments → Promote the previous production deployment. Env changes roll back
  separately (re-add old values). Database writes are forward-only — no destructive migrations
  exist in this app by design (adapted schema, no DDL).

## Compliance checklist before any send

- [ ] Recipient email/phone `verification_status = 'valid'` (Reoon/RealValidito)
- [ ] SMS/call: `custom_fields->>'tcpa_consent' = 'granted'`
- [ ] Copy has opt-out language (campaign-writer agent includes it)
- [ ] Business-purpose positioning only
