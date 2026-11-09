# Runbook: A2P 10DLC Registration for +1 928-370-3051 (Track A / app2.leaddaddy.ai)

**Owner:** Steve (human-only — no API for direct-customer brand registration; every step below is in the Twilio Console)
**Created:** 2026-11-09 · **Deadline:** Black Friday 2026-11-27
**Scope:** ONE Twilio US number: **+1 928-370-3051** (SID `PNec27c07a8ba980a41eb0a3c224bbf02`). Do **not** touch +1 480-690-2666 (shared with main app/Arive) or +1 762-438-3727 (voice pool).
**Why:** The account currently has **0 brands**. Carriers treat all Twilio SMS as A2P; unregistered traffic gets heavier filtering plus extra carrier per-message fees, and T-Mobile blocks it outright. At BFCM volume the number would be throttled or burned.

Sources (verified 2026-11-09): [A2P 10DLC overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) · [Direct Standard onboarding](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-standard-onboarding) · [Required business info](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info) · [Sole Proprietor guide](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview)

---

## Part 1 — Gather everything BEFORE you log in (60–90 min)

Have all of this in a scratch doc first. Most failures/rejections come from rushing this part.

### Business identity (must match IRS records exactly)

- [ ] **Legal business name** — exactly as printed on the EIN confirmation letter (CP-575, or IRS 147c letter if lost). NOT the name from a W-2/W-9 if those differ. Steve to confirm: likely `Loan Daddy LLC` — enter whatever the CP-575 says.
- [ ] **EIN** — format `XX-XXXXXXX`.
- [ ] **DBA** — `LeadDaddy.ai` (how the brand shows publicly). If the CP-575 name is `Loan Daddy LLC`, keep `Loan Daddy LLC` as business_name and use LeadDaddy.ai as the brand/DBA and website identity. Consistency matters: TCR cross-checks name ↔ EIN ↔ website.
- [ ] **Business type** — `Limited Liability Corporation` (LLC).
- [ ] **Industry** — `REAL_ESTATE` (or `FINANCIAL`/`FINTECH`; pick one and use it consistently).
- [ ] **Company type** — `private`; **Stock exchange** — `NONE`.
- [ ] **Physical/mailing address** of the business (street, city, state, ZIP). Caveat: an address can be used max ~10 times across ALL TCR registrations account-wide — use the real business address.
- [ ] **Website URL** — must be live, load without login, not parked/for-sale, and clearly relate to the business name. Decide now: `https://leandaddy.ai` does not exist — use `https://leaddaddy.ai` and/or `https://loandaddy.ai`. Pick the one whose branding matches the SMS sender identity (**LeadDaddy.ai**).
- [ ] **Social media profile URLs** (LinkedIn/Facebook/X for the business) — collect 1–3; the form asks for them.
- [ ] **Authorized representative** — Steve Mannenbach; exact job title (e.g., `Owner`); job position category `CEO` (or `Other`); E.164 phone; business email.
- [ ] **Brand contact email for 2FA** — REQUIRED since Oct 2024 for public for-profit brands. MUST be on a business domain you control (e.g., `steve@loandaddy.ai`). **A Gmail/Yahoo/free email here fails the brand.** You will receive a verification code at this address during registration.
- [ ] **Credit card** on the Twilio account (fees in Part 2). Expect roughly: $4 one-time brand registration + $15 one-time campaign vetting + ~$1.50/month campaign fee (verify exact amounts on the fee screen shown in Console during submission — TCR adjusts these occasionally).

### Website compliance pre-flight (do this BEFORE submitting — top rejection cause)

- [ ] Open `https://<chosen-domain>/privacy` — confirm it exists publicly (no login) and contains ALL of: (a) "we do not share mobile numbers with third parties", (b) message frequency ("up to X messages/month"), (c) "Message and data rates may apply".
- [ ] Open `https://<chosen-domain>/terms` — public, same domain, not a PDF behind a login.
- [ ] If either page is missing content, fix the site first. A missing/privacy-policy failure costs a re-submission and days of delay.
- [ ] Optional but smart: screenshot the consent checkbox + privacy/terms pages. If the reviewer can't find the consent language, Twilio support can use screenshots hosted at a public URL.

### Campaign content (write it once, paste it in Part 3)

- [ ] **Use-case decision:** one campaign covering product updates + BFCM offers + follow-ups to opted-in leads → use case **`LOW_VOLUME` (Low Volume Mixed)** on a Low-Volume Standard brand. (If you later register a Standard brand, the equivalent is `MIXED` or `MARKETING`.)
- [ ] **Opt-in flow description** (40–2048 chars). TCPA consent capture already exists in-app (unchecked checkbox at signup/lead-capture; consent timestamp stored per contact). Describe it truthfully — paste-ready draft in Part 3.
- [ ] **2–5 sample SMS messages** (each 20–1024 chars, brand named in every message, `[brackets]` for variables, opt-out language included). Paste-ready drafts in Part 3.
- [ ] **Opt-out / help handling:** Twilio's default opt-out handles `STOP`/`START`/`HELP`/`UNSTOP` auto-replies on the messaging service, AND the app already suppresses opted-out contacts (`tcpa_consent` enforcement + instant STOP honoring). Leave the campaign's custom opt-out fields empty to use Twilio defaults — less to get wrong. Double-check in Console: Messaging → your service → Opt-in/out handling shows defaults ON.
- [ ] **Numbers the campaign will send to:** US/Canada only; recipients are leads/customers who opted in via web/app forms — no purchased lists, no cold blasts.

---

## Part 2 — Decision: which brand type (5 min)

| | **Sole Proprietor** | **Low-Volume Standard** ⭐ | **Standard** |
|---|---|---|---|
| Who | Individuals with NO EIN/tax ID | Business WITH EIN | Business WITH EIN |
| Daily volume (T-Mobile / all carriers) | ~1,000 / ~3,000 segments | ~2,000 / ~6,000 segments | 2,000 → unlimited (Trust Score) |
| Campaigns per brand | 1 | up to 5 | up to 5 |
| Brand fee / vetting | ~$4 one-time / $0 | ~$4 one-time / **$0 (vetting skipped)** | ~$4 + ~$40 one-time vetting |
| Campaign fee / vetting | ~$2/mo / $15 one-time | ~$1.50/mo / $15 one-time | ~$10/mo / $15 one-time |
| Brand approval | fast (often minutes) | fast (often minutes) | minutes–days (vetting) |

**Recommendation: register `Loan Daddy LLC` as a Low-Volume Standard brand** — cheaper than Standard (no $40 vetting), more trusted and roomier than Sole Proprietor, and ~6k segments/day is far beyond BFCM needs for a < few-thousand-SMS/day shop.

- [ ] ✅ **Choose Low-Volume Standard — UNLESS you have no EIN**, in which case Sole Proprietor is the only path (use your real name + DBA).
- [ ] ⚠️ Do NOT register as Sole Proprietor if the business has an EIN — TCR rejects it and it wastes fees/time.
- [ ] Only pick Standard later if you outgrow 6k segments/day or need MARKETING-specific throughput; you can add it under the same EIN (up to 5 brands per tax ID).

---

## Part 3 — Console click path

Log in at https://console.twilio.com (US region).

### Step A — Create the Primary Customer Profile (one-time per Twilio account)

- [ ] Left nav: **Messaging → Regulatory Compliance → US A2P 10DLC** (new Console may instead show an **A2P 10DLC onboarding** page with three tabs: *Create Customer Profile / Register Brand / Campaign Registration* — same steps, just tabbed).
- [ ] Click **Create Customer Profile** (under "Business Profile" / Trust Hub).
- [ ] Fill: legal business name, type `Limited Liability Corporation`, EIN (`XX-XXXXXXX`), address, website, industry `REAL_ESTATE` (or `FINANCIAL`), representative (Steve), contact email + phone. Exactly match the IRS letter.
- [ ] Submit. **Approval can take up to ~72 hours** — Twilio emails the profile email. You can continue to Step B while it's pending.
- [ ] ⏱️ *Clock check: submit this by Mon Nov 9–10. Worst case it's approved Wed Nov 12.*

### Step B — Register the Brand

- [ ] Same page → **Create brand** (Register Brand tab) → choose **Low-Volume Standard**.
- [ ] Most fields auto-carry from the customer profile — verify they match the CP-575 exactly.
- [ ] Enter **Brand contact email** (business domain — NOT free email) → Twilio/TCR sends a **2FA code** → enter it in Console.
- [ ] Confirm "skip secondary vetting" is set (automatic for Low-Volume Standard).
- [ ] Submit (~$4 one-time).
- [ ] Statuses to watch on the Brand Overview page: `IN_REVIEW` (manual review can take 7+ business days — no action needed), `APPROVED` (✅ proceed), `FAILED`/`SUSPENDED` (see troubleshooting, Part 6). TCR review is usually **minutes**; an email lands at the customer-profile email on completion.
- [ ] ⏱️ *Usually same-day. If `FAILED` for EIN mismatch: confirm name matches CP-575 exactly; if it's a new EIN (30–90 day propagation lag), open a Twilio support ticket with the CP-575/147c attached (manual appeal ~5–7 business days).*

### Step C — Register the Campaign (+ attach the messaging service/number)

A campaign must be linked to a Messaging Service that has at least one 10DLC number in its sender pool — and **one Messaging Service can carry only one campaign**. A service already exists on this account from app setup (friendly name along the lines of "Low Volume Mixed").

- [ ] First verify the sender pool: **Messaging → Services** → open the service used by the app → **Sender Pool** tab → confirm **+1 928-370-3051** is listed. If it's not, add it there BEFORE submitting the campaign. Do not add any other number.
- [ ] **US A2P 10DLC** page → **Create campaign** (Campaign Registration tab) → select your **APPROVED** brand → use case: **`LOW_VOLUME` (Low Volume Mixed)**.
- [ ] Select the existing messaging service (the one with +1 928-370-3051).
- [ ] **Description** (40–4096 chars) — paste, adjust to truth:

  > `LeadDaddy.ai (dba of Loan Daddy LLC) sends business-purpose text messages to real-estate investors and small-business leads who explicitly opted in via our website or app signup. Messages include product updates, seasonal offers (including our Black Friday/Cyber Monday promotion) for our AI lead-generation CRM, and follow-ups on demos or trials the user requested. Every message identifies LeadDaddy.ai and includes opt-out instructions. STOP requests are honored immediately and the number is suppressed in-app. No consumer lending content is sent via SMS.`

- [ ] **Message flow / opt-in** (40–2048 chars) — paste, adjust to the actual UI:

  > `End users opt in by entering their phone number on https://leaddaddy.ai (or in the LeadDaddy.ai app at https://app2.leaddaddy.ai) and checking an UNCHECKED consent box that states: "I agree to receive SMS messages from LeadDaddy.ai at this number, including product updates and offers. Consent is not a condition of purchase. Reply STOP to unsubscribe; reply HELP for help." Consent (timestamp + source page) is stored on the contact record and enforced before any send. Privacy Policy: https://leaddaddy.ai/privacy · Terms: https://leaddaddy.ai/terms`

- [ ] **Sample messages** (2 required, up to 5; each names the brand, uses `[brackets]` for variables, includes opt-out). Paste-ready:

  1. `Hi [First Name] — Steve here from LeadDaddy.ai. Your Black Friday deal on the AI lead-gen CRM is live: [link]. Reply here with questions, or STOP to opt out.`
  2. `LeadDaddy.ai update: your import of [lead count] leads finished — [verified count] verified. View your pipeline: [link]. Reply STOP to unsubscribe.`
  3. `Thanks for joining LeadDaddy.ai, [First Name]! We'll text you product updates & offers about [frequency] msgs/month. Reply STOP anytime, HELP for help.`

- [ ] **has_embedded_links:** `Yes` (samples above include links). **has_embedded_phone:** `No`.
- [ ] Opt-in/out/help keyword fields: **leave empty** to use Twilio default opt-out handling (STOP/START/HELP/UNSTOP auto-replies) on top of the app's own suppression.
- [ ] Review everything for internal consistency (brand name, website, use case ↔ description ↔ samples — vetters reject mismatches), then **Submit** (~$15 one-time vetting + ~$1.50/mo, shown on the confirmation screen).
- [ ] Campaign enters manual vetting: **typically 1–5 business days**; Twilio emails if more info is needed. If still `pending` after **10 days**, open a Twilio support ticket.
- [ ] ⏱️ *Submit by Fri Nov 13 to be safe; absolute latest Mon Nov 18. Thanksgiving week (Nov 23–27) slows reviewers down — do not count those days.*

---

## Part 4 — After approval: connect, verify, launch

- [ ] Campaign status shows **Approved/Registered** on the US A2P 10DLC page.
- [ ] Confirm linkage: campaign page shows the messaging service; **Messaging → Services → sender pool** still shows **+1 928-370-3051** and the service shows the A2P campaign attached.
- [ ] Send a live test SMS from the app (or Console → Messaging → try-it/send test) to your own cell and a teammate's. Confirm: instant delivery, no carrier "blocked" error.
- [ ] Reply `STOP` from the test phone → confirm Twilio default opt-out replies and the app suppresses the contact.
- [ ] Send one message with a tracked link → Console **Monitor → Logs → Messaging** shows `delivered`, no 30034/30xxx errors.
- [ ] Ramp gradually over 2–3 days (start tens/day, then hundreds) — even approved brands get filtered if volume jumps 0→thousands instantly.
- [ ] Tick the A2P items in `docs/SETUP.md` + `docs/PROGRESS.md` and note approval date/fees for the books (Loan Daddy LLC entity, not Barrett, not MIB).

---

## Part 5 — Timeline vs Black Friday (Nov 27) & fallback plan

Realistic critical path: **Customer Profile (≤72h) → Brand (minutes–same day; worst-case manual 7+ business days) → Campaign vetting (1–5 business days, sometimes 10).**

| If submitted by | Expected approval | Verdict |
|---|---|---|
| Mon Nov 9 (today) | Nov 10–13 | ✅ comfortable runway + ramp time |
| Fri Nov 13 | Nov 14–20 | ✅ still fine |
| Mon Nov 18 | Nov 19–25 | ⚠️ tight, Thanksgiving week risk |
| After Nov 19 | Nov 24+ | ❌ assume NOT approved for BFCM |

**If the campaign is NOT approved by Tue Nov 24 (fallback mode — decision point):**

- [ ] ❌ **Do NOT run BFCM SMS blasts on the unregistered number.** Unregistered traffic gets extra carrier per-message fees, heavy filtering, and T-Mobile blocking — you'd burn the sender reputation of the only Track A number 3 days before the sale.
- [ ] Keep SMS to **minimal, personalized 1:1-style sends** (tens/day, human-sounding, to opted-in contacts only, TCPA consent verified per `docs/OPS.md`). No link-stuffed blasts.
- [ ] Shift BFCM promotion weight to **email (SendGrid — domain-authenticated, already live)** and **AI voice calls** (outbound pool), which are not affected by 10DLC.
- [ ] Keep the registration moving — approval lands when it lands and immediately improves the January push. Do not cancel/resubmit (re-submissions restart vetting and re-bill the $15).
- [ ] Re-check campaign status each morning Nov 20–26; the moment it's approved, run Part 4 verification and a small warm-up before any larger send.

---

## Part 6 — Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Brand `FAILED` | Legal name ≠ CP-575 name / EIN typo / new EIN not yet propagated | Fix spelling from CP-575; if EIN is new, wait or appeal with CP-575/147c via Twilio support (5–7 business days) |
| Brand `FAILED` | Brand contact email is a free/personal address or distribution list | Use `steve@<business-domain>`, re-verify 2FA |
| Campaign rejected: website | Site down, parked, login-gated, or unrelated to business name | Fix site/URL; it must match the legal name or DBA |
| Campaign rejected: privacy/terms | Missing "no mobile-number sharing", frequency, "rates may apply"; T&C on wrong domain or behind login | Update pages, resubmit (re-bills $15 vetting) |
| Campaign rejected: samples | No brand name, no opt-out, or mismatch with use case/description | Use the Part 3 drafts verbatim |
| Campaign rejected: consent | Opt-in flow vague; checkbox pre-checked; no privacy/terms links | Ensure language names LeadDaddy.ai, states message types, STOP/HELP |
| Stuck `pending` >10 days | Vetters waiting / holiday backlog | Twilio support ticket with campaign SID |
| Sent messages still filtered after approval | Volume ramped too fast, or content flagged | Ramp 2–3 days; check Console error codes (e.g., 30034); keep copy non-deceptive, include opt-out |

## Fees cheat-sheet (verify on the Console confirmation screens — TCR adjusts occasionally)

- Brand registration (one-time, TCR): **~$4** · Standard-brand vetting: **~$40** (Low-Volume Standard skips this)
- Campaign (LOW_VOLUME use case): **~$1.50/month** + **~$15 one-time campaign vetting** (re-charged on resubmission)
- Ongoing: per-segment carrier pass-through fees + number rental (~$1.15/mo) as usual
