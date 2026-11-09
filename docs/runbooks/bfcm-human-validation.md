# BFCM Human Validation Runbook — Track A (app2.leaddaddy.ai)

**Date of run:** 2026-11-__ · **Window:** one sitting, ~60–90 min · **Target:** https://app2.leaddaddy.ai
**Executors:** Steve Mannenbach (steve@loandaddy.ai) + Mykoal DeShazo (mykoal@loandaddy.ai)
**Logins:** see the TEAM LOGINS table in `docs/GOAL_PROMPT.md` (email + password, magic link as fallback).
**Repo for bug filing:** https://github.com/Smannenbach/LeadDaddy.ai/issues

Every code path below was already proven live by an agent (see `docs/PROGRESS.md`,
"Production pipeline proof", "Voice agent PROVEN LIVE"). This runbook is the human
click-through that closes the BFCM gates: one real browser, one real phone, end to end.

Conventions:
- `[ ]` = unchecked gate. Do the steps in order; several gates depend on earlier ones.
- **Expected:** what you must see for the gate to pass. Anything else = bug (Gate 9).
- **Capture:** what to screenshot / write down. Save screenshots to a shared evidence
  folder, e.g. `docs/runbooks/bfcm-evidence/` (create on the day; do not commit secrets
  or lead PII in screenshots if avoidable — crop inboxes/phone numbers of third parties).
- All times UTC. The Vercel cron fires at :00/:15/:30/:45.
- House rules apply: business-purpose positioning only, never print full API keys/secrets,
  no commits/deploys except the two Vercel env changes in Gate 8 (both are pre-approved
  parts of this runbook — restore the original value immediately after).

---

## Pre-flight (both teammates, ~5 min)

- [ ] Open `https://app2.leaddaddy.ai/api/health` in a browser (no login needed).
  **Expected:** JSON with `"ok":true`, `"db":"up"`, `providers` lists at least anthropic/openai/qwen.
  **Capture:** screenshot. If `ok:false` or HTTP 503, stop — check Vercel logs first (`vercel logs`,
  project `leaddaddy-ai`), then Supabase status, per `docs/OPS.md`.
- [ ] Confirm you both have open, side by side: Supabase dashboard (project `zdnlouluogpdfhygdnjn`),
  Vercel dashboard (project `leaddaddy-ai`), SendGrid dashboard (Activity feed), Twilio Console.
- [ ] Agree who drives (recommended: Steve drives, Myke reads expected results and captures).

---

## Gate 1 — Both users sign in with email + password

1. [ ] In an incognito/private window, go to `https://app2.leaddaddy.ai` → you are
   redirected to `/login`.
2. [ ] Make sure the **Password** tab is selected (it is the default; Magic link is the fallback).
3. [ ] Steve signs in with `steve@loandaddy.ai` + password (TEAM LOGINS table in `docs/GOAL_PROMPT.md`).
   **Expected:** redirect to `/` (the console) with the Leads/Campaigns UI, and your email
   shown top-right. A wrong password shows a red error and stays on `/login`.
4. [ ] Myke signs in the same way in his own browser with `mykoal@loandaddy.ai`.
   **Expected:** same console; the same lead data (this is the shared org CRM — both of you
   see the same `crm_contact` rows).
5. [ ] Sign out and back in once for each of you (catches stale-cookie weirdness).
   **Expected:** clean round trip each time.

**Capture:** one screenshot per signed-in console (top bar showing the signed-in email).
**Note:** Myke signed in earlier today (07:24 UTC per PROGRESS.md); Steve's first click was
still pending — if Steve's password fails, that's a launch-blocking bug, file it first.

---

## Gate 2 — Scrape a public page → lead/contact row created

1. [ ] On the console `/`, in **"Scrape a page into lead intel"**, paste a public page that
   lists people with names (a team/about/agents page). Do **not** use `example.com` — it has
   no people, so nothing gets created.
2. [ ] Tick **"Create leads from result"**. Leave "Auto-verify created leads" **unticked**
   (we verify manually in Gate 3 so each gate is isolated).
3. [ ] Click **Scrape + AI digest**.
   **Expected:** notice banner like `Scraped <N> chars, digest via <model> — created <X> lead(s)
   in CRM: <digest excerpt>`, and the Leads table refreshes.
4. [ ] Confirm the new row appears in the **Leads** table on `/` (name, company/title from the page).
5. [ ] Click **Open CRM workspace** (`/crm`) and find the same contact there (grouped by stage,
   `lead_source` = the scraped page's host).
   **Expected:** same person in both views; data matches what was on the scraped page.

**Capture:** screenshot of the scrape notice banner; screenshot of the new lead row in both
`/` and `/crm`; write down the new contact's **id** (click the record in `/crm` — the URL is
`/crm/<id>`) and its email + phone.

**If `created 0 lead(s)`:** the AI digest found no people (page choice). Retry with a
different people-page. Only file a bug if a people-rich page reliably yields 0.

---

## Gate 3 — Verify email (Reoon) and phone (Twilio Lookup carrier data)

1. [ ] Back on `/`, in the Leads table, click **Verify** on the Gate-2 contact (or on a test
   contact you added with both email and phone).
2. [ ] Watch the notice banner.
   **Expected:** two lines, e.g.
   `email <addr> → valid (reoon)` and `phone <number> → valid (realvalidito)`.
   - Email verdict comes from **Reoon** (status `valid` or `safe` maps to `valid`; Reoon
     `safe` → badge `valid` — that mapping was a launch-day hotfix, verify it here).
   - The phone provider label in the UI always reads `realvalidito`, but the
     **RealValidito key is currently dead**, so the code automatically falls back to
     **Twilio Lookup v2** (carrier + line-type intelligence) — this gate confirms that fallback.
3. [ ] Confirm the **email_status** and **phone_status** badges in the Leads table update to
   the verdicts (valid / invalid / risky — any real verdict proves the path; use a number
   you own so a `valid` result is expected).
4. [ ] See the carrier data behind the phone verdict (not shown in the UI by design):
   Twilio Console → **Monitor → Logs → Lookup** for the request, or run a manual lookup
   (keys read from your Windows env, nothing printed):

   ```powershell
   $sid = [Environment]::GetEnvironmentVariable('TWILIO_ACCOUNT_SID','User')
   $tok = [Environment]::GetEnvironmentVariable('TWILIO_AUTH_TOKEN','User')
   $pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$sid`:$tok"))
   Invoke-RestMethod -Uri "https://lookups.twilio.com/v2/PhoneNumbers/<E164_NUMBER>?Fields=carrier,line_type_intelligence" -Headers @{ Authorization = "Basic $pair" }
   ```

   **Expected:** JSON with `carrier.name` and `line_type_intelligence.type`; a named carrier
   that isn't `nonFixedVoicemail` is what the app scores `valid`.

**Capture:** screenshot of the verify notice lines + the updated status badges; paste the
carrier `name`/`type` into the notes. **Known cosmetic issue (file as low-severity bug if it
bothers you):** the UI provider label says `realvalidito` even when Twilio Lookup did the work —
the actual provider isn't persisted to `phone_verification`.

---

## Gate 4 — Create a campaign targeting the new contact, one email step

> ⚠ **Do NOT tick "Include all current leads as recipients".** That targets the entire
> shared CRM: the launch gate would 409 (not all leads are verified) and, worse, a successful
> run would email real leads. We target exactly one contact: ours.

1. [ ] With the Gate-2 contact verified in Gate 3, open the browser dev console (F12) on `/`
   and create a one-recipient campaign (same-origin fetch uses your signed-in session):

   ```js
   fetch("/api/campaigns", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       name: "BFCM-validation-" + new Date().toISOString().slice(0, 10),
       brief: "BFCM offer: waived $1,995 processing fee on business-purpose DSCR loans for investment properties, Nov 27–30.",
       channelSeq: ["email"],           // exactly one step, email only
       leadIds: ["<CONTACT_ID>"],       // from Gate 2
       generateCopy: true               // campaign-writer agent writes subject+body
     })
   }).then(r => r.json()).then(console.log)
   ```

   **Expected:** `{ id: "<campaign-id>", status: "draft" }` (HTTP 201). A 502 with a parse/AI
   message is a bug (no campaign should be half-created).
2. [ ] Refresh the **Campaigns** table.
   **Expected:** the new campaign row: status `draft`, **Recipients = 1**, Sequence shows
   `email`, 0 pending note, Sent/Skipped 0/0.
3. [ ] Click **Launch** on that row.
   **Expected:** notice `Campaign '<id>' launched.`; status flips to `live`.
   (Behind the scenes the launch gate re-checks that all recipients have a **valid** email
   verification — it passes because Gate 3 verified this contact. If it 409s, Gate 3 didn't
   stick — re-verify and retry; only file a bug if verification says `valid` and launch still 409s.)

**Capture:** screenshot of the fetch response (campaign id), the campaign row (draft), and
the row after launch (live). Write down the campaign id. Note the AI-written subject line
(it should include opt-out language) — you'll see it in SendGrid in Gate 5.

---

## Gate 5 — Cron advance fires and the email actually sends (SendGrid)

Step offsets default to one-per-day with step 0 due **immediately** at launch, so the email
is due now. Two ways through — do both:

1. [ ] **Manual advance (immediate):** click **Run next step** on the live campaign row.
   **Expected:** notice `Step 0 (email): 1 sent, 0 skipped.` and the row shows Sent 1.
2. [ ] **Cron path (the production path):** note the next quarter-hour (:00/:15/:30/:45 UTC),
   wait for it, then refresh. **Expected:** the step is already sent, so the cron is a no-op
   for this campaign — the point is to confirm the cron itself is healthy: Vercel dashboard →
   project `leaddaddy-ai` → **Settings → Crons** → `/api/campaigns/cron` shows recent
   successful invocations.
   - If invocations show **401/failing, file a blocker bug**. Suspected cause
     (from `docs/PROGRESS.md`): the corrupted `CRON_SECRET` env var was deleted, so the
     route now authenticates cron calls as `Bearer <service-role-key>` — but Vercel Cron
     only auto-sends `Authorization: Bearer $CRON_SECRET` when that env var exists. The
     agent proof exercised the advance endpoint with that credential directly; the
     Vercel-scheduled invocation itself is exactly what this gate must confirm.
3. [ ] **SendGrid:** SendGrid dashboard → **Activity** (or the recipient's inbox at
   steve@loandaddy.ai). **Expected:** one delivered send to the Gate-2 contact's email,
   From `LeadDaddy.ai <steve@loandaddy.ai>`, subject = the AI-written one, body mentions the
   BFCM waived-processing-fee offer and includes opt-out language.
4. [ ] Optional cross-check in Supabase: `marketing_campaign.target_audience->'sequence'->'runs'`
   for this campaign shows a run with `status:"sent"` for the contact.

**Capture:** screenshot of the advance notice, the campaign row (Sent 1), the Vercel Crons
page, and the SendGrid activity entry. If the email never lands: check SendGrid Activity for
bounces/suppressions before filing a bug (a suppressed steve@ address is an account issue,
not an app bug).

---

## Gate 6 — Live PSTN call to +1 928-370-3051 → AI voice agent answers compliantly

1. [ ] From a personal cell, call **+1 928-370-3051** (the dedicated Track A number; the old
   +1 480-690-2666 belongs to production — never test against it).
2. [ ] Listen to the answer.
   **Expected:** an AI assistant answers (Polly.Joanna voice) with the line
   "Hi, this is the LeadDaddy dot AI assistant calling about investment property financing…",
   then listens (a `<Gather>` beep/silence) and responds to what you say.
3. [ ] Ask a real question, e.g. "What loan programs do you offer?" and one follow-up.
   **Expected:** coherent, on-topic answers from the sales-caller persona, ≤2 sentences per
   turn, investment-property/business-purpose framing only.
4. [ ] **Compliance checklist during the call** (say out loud, note answers):
   - [ ] Identifies itself as an AI assistant (not a human).
   - [ ] Stays on business-purpose investment-property financing — no owner-occupied, no
     second-home, no legal/tax/investment advice.
   - [ ] If asked something off-scope, declines politely and redirects.
5. [ ] Cross-check after hanging up: Supabase `ai_run_log` has a row with
   `feature_key='voice_turn'`; Twilio Console → **Monitor → Logs → Calls** shows the call
   answered with TwiML from `https://app2.leaddaddy.ai/api/channels/voice`.

**Capture:** Twilio call-log screenshot + the `voice_turn` row. Audio can't be screenshotted —
write down: call time (UTC), calling number, the exact opening line, and your two Q&As
verbatim. **Known rough edge (file as polish bug, not a blocker):** the greeting is written
for outbound calls, so an inbound caller hears "…assistant calling about…" — fine for
validation; we may want an inbound-aware opener later.

---

## Gate 7 — Reply to a campaign SMS from the lead side → AI auto-reply

Prerequisite — the contact needs TCPA consent and a valid phone before a campaign can text it
(the launch/step gates enforce this in code; that's a feature, verify it rather than bypass it):

1. [ ] In Supabase SQL editor, grant consent to the test contact (a test contact you own —
   granting your own consent is legitimate):

   ```sql
   update crm_contact
   set custom_fields = jsonb_set(coalesce(custom_fields,'{}'::jsonb), '{tcpa_consent}', '"granted"'),
       updated_date = now()
   where id = '<CONTACT_ID>';
   ```

2. [ ] Create + launch a one-recipient **SMS** campaign exactly like Gate 4 but with
   `channelSeq: ["sms"]` (copy must contain "reply STOP to opt out"). Run next step.
   **Expected:** `Step 0 (sms): 1 sent, 0 skipped.` and the SMS arrives on the cell phone.
   - **Known risk (GOAL_PROMPT.md):** A2P 10DLC is not registered on this Twilio account, so
     carriers may delay/filter the message. If it doesn't arrive, check Twilio Console →
     Monitor → Logs → Messages for a 30034/30035 error: that is a *known launch risk to note*,
     not a new bug — record it and use the direct-text fallback below to validate the AI loop.
     (Fix path: `docs/runbooks/a2p-10dlc.md` — human-only Twilio Console registration, do before
     Nov 27.)
3. [ ] **From the cell that received it, reply** to the campaign text (e.g. "Tell me more
   about the fee waiver").
   **Expected:** within ~30 s an AI-written reply arrives (≤300 chars, no markdown, on-topic,
   business-purpose). Fallback if the campaign SMS never arrived: text the same question
   **directly to +1 928-370-3051** from a number stored E.164-exact on the contact
   (e.g. `+1480XXXXXXX`) — the inbound webhook matches `crm_contact.phone` to Twilio's
   `From` exactly, so any format mismatch means no reply and *that* would be a bug.
4. [ ] Verify the audit trail: Supabase `lead_event` has `sms_inbound` + `sms_outbound` rows
   for the contact, and `ai_run_log` has `feature_key='sms_reply'`.
5. [ ] **STOP check (compliance gate — must pass):** reply `STOP`.
   **Expected:** instant confirmation text ("You have been opted out…"), and the contact's
   Consent badge on `/` flips to `revoked`.

**Capture:** phone screenshots of the campaign SMS, the AI reply, and the STOP confirmation;
Supabase screenshots of the `lead_event`/`sms_reply` rows; note the contact id.

---

## Gate 8 — Budget guard fires (AI router)

The guard is `assertAiBudget()` (`src/lib/ai/log.ts`): monthly `ai_run_log.cost_estimate`
sum vs `AI_MONTHLY_BUDGET_USD` (default $100); tripped = HTTP **429** with
`AI monthly budget reached: $X of $Y`. It fires on `/api/ai` POST and protects scrape
digests and campaign copy generation too.

1. [ ] Check current spend (Supabase SQL, from `docs/OPS.md`):

   ```sql
   select sum(cost_estimate) from ai_run_log where created_date > date_trunc('month', now());
   ```

2. [ ] Vercel dashboard → project `leaddaddy-ai` → **Settings → Environment Variables** →
   set `AI_MONTHLY_BUDGET_USD` to `0` (remember the previous value!) → **redeploy**
   (Deployments → ⋯ → Redeploy). Env changes only take effect on a new deployment.
3. [ ] On the signed-in console, in the browser dev console:

   ```js
   fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ prompt: "budget guard test" }) }).then(r => r.json().then(j => console.log(r.status, j)))
   ```

   **Expected:** status **429** and `{ error: "AI monthly budget reached: $… of $0. …" }`.
4. [ ] **Restore immediately:** set `AI_MONTHLY_BUDGET_USD` back to the previous value (or
   delete the override to return to the $100 default) → redeploy. Re-run the same fetch and
   **expected:** HTTP 200 with an AI response. Confirm the console header (AI providers/agents
   counts, from `GET /api/ai`) renders again.

**Warnings:** while the guard is tripped, AI features degrade (scrape digest fails, campaign
copy 502s, voice/SMS replies fall back to canned text). Keep the tripped window under ~5 min,
do this gate near the end of the session, and never leave `0` in place — a tripped guard
during BFCM would block all AI outreach.

**Capture:** screenshot of the SQL spend query, the 429 response, the env var page (both
before/after), and the Vercel deployment list showing the two redeploys.

---

## Gate 9 — Record bugs and file GitHub issues

For every unexpected behavior in Gates 1–8:

- [ ] Reproduce once more to confirm it's repeatable (one-off blips get noted, not filed).
- [ ] File an issue at https://github.com/Smannenbach/LeadDaddy.ai/issues with:
  - Title: `[BFCM-validation] <short description>`
  - **Repro steps** (numbered, exact clicks/inputs), **Expected** vs **Actual**
  - Gate number, browser + version, time (UTC), signed-in user
  - Contact id / campaign id / Twilio CallSid or MessageSid when relevant
  - Screenshot pasted into the issue; severity guess (blocker / high / cosmetic)
  - Whether it's Track A-only or suspected shared-DB impact (matters for Track B)
- [ ] Log every finding — including "verified working" notes — in the table below.
- [ ] Known-issue shorthand (don't re-file these, just confirm/annotate):
  UI phone-verification label always says `realvalidito` even on Twilio-Lookup fallback ·
  voice greeting is outbound-worded for inbound callers · A2P 10DLC unregistered (SMS
  deliverability risk, console registration needed) · RealValidito/Qwen/Composio keys dead
  (fallbacks in place; regenerate at dashboards when convenient).

**Capture:** list of issue URLs filed.

---

## Sign-off

All gates executed at https://app2.leaddaddy.ai on 2026-11-__ by both teammates.
A gate is "pass" only if its **Expected** results were observed or deviations are filed as
issues below. Nothing may be left in a broken/tripped state: campaign(s) paused or noted,
test contact disposition decided, `AI_MONTHLY_BUDGET_USD` restored, env redeployed.

| # | Gate | Pass/Fail | Notes / issue # | Steve (S.M.) | Myke (M.D.) |
|---|------|-----------|-----------------|--------------|-------------|
| 1 | Email+password sign-in (both users) | | | ____ | ____ |
| 2 | Scrape → lead/contact row | | | ____ | ____ |
| 3 | Email verify (Reoon) + phone verify (Twilio Lookup) | | | ____ | ____ |
| 4 | Campaign targeting new contact, one email step | | | ____ | ____ |
| 5 | Cron advance → SendGrid delivery | | | ____ | ____ |
| 6 | PSTN call → compliant AI voice agent | | | ____ | ____ |
| 7 | SMS reply → AI auto-reply (+ STOP) | | | ____ | ____ |
| 8 | Budget guard fires (429) and restores | | | ____ | ____ |
| 9 | Bugs filed with repro | | | ____ | ____ |

**Post-run cleanup (check each):**
- [ ] Test campaigns: either `paused` via SQL (`update marketing_campaign set status='paused'
  where id = '<id>';`) or documented as the BFCM seed campaign.
- [ ] Test contact(s): kept (documented) or deleted per `docs/OPS.md` cleanup SQL.
- [ ] `AI_MONTHLY_BUDGET_USD` restored + redeployed (Gate 8 evidence).
- [ ] STOP-tested contact shows consent `revoked` (do **not** re-grant without a real opt-in).
- [ ] Evidence folder `docs/runbooks/bfcm-evidence/` assembled; PII cropped; nothing committed
      that contains secrets or private lead data.

Signed:

- Steve Mannenbach — signature: ____________________  date/time (UTC): __________
- Mykoal DeShazo — signature: _______________________  date/time (UTC): __________
