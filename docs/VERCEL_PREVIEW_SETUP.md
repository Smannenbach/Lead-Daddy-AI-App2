# Run app2 on your own Vercel (preview links)

This repo (`mdeshazo/app2.leaddaddy.ai`) is the working copy of Lead Daddy app2. It deploys
to its own Vercel project, so you get private preview links while you build. The live site,
app2.leaddaddy.ai, stays on Steve's Vercel project and is not touched by anything here.

## What's different from the live app

| | Live app2 (Steve's Vercel) | This copy |
|---|---|---|
| Web address | app2.leaddaddy.ai | your own `*.vercel.app` links |
| Campaign runner (every 15 min) | on | **off**: removed from `vercel.json` |
| Texts, calls, emails on preview links | n/a | **off** (preview safe mode) |
| Paid verifications on preview links | n/a | **off** (preview safe mode) |

**Preview safe mode** (`src/lib/channels/send-guard.ts`): on any Vercel preview deployment,
sending texts, starting calls, sending email and running paid verifications are refused with
a plain message, even when real keys are set. Nothing goes out and no credits are spent.
Production deployments behave normally.

- To allow sends on a preview on purpose: set `LEAD_DADDY_ALLOW_PREVIEW_SENDS=true`.
- To turn them off everywhere, production too: set `LEAD_DADDY_DISABLE_SENDS=true`.

## Set it up (about 10 minutes)

1. **Plan.** Vercel's free Hobby plan is for personal, non-commercial projects. Lead Daddy
   is a business, so use a Pro account, or ask Steve to add you to his Vercel team.
2. Sign in at vercel.com with GitHub. Click **Add New**, then **Project**, then import
   `mdeshazo/app2.leaddaddy.ai`. Vercel detects Next.js; keep the default settings.
3. **Before the first deploy**, open **Environment Variables** and add the keys listed in
   `.env.example`. Add them to the **Preview** environment (and Development if you use it).
   Leave them off **Production** for now, so this project only ever runs as a preview.
   - Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`.
   - At least one AI key for AI features.
   - Leave `CRON_SECRET` and `LEAD_DADDY_ALLOW_PREVIEW_SENDS` empty.
4. Deploy. Then turn on **Settings > Deployment Protection > Vercel Authentication** for
   previews (on by default), so only people signed in to your Vercel team can open links.
5. Work on a branch, push, and Vercel posts a preview link on the pull request. Each push
   gets a fresh link.

## Demo mode (no Supabase needed)

Set `NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE=true` on the Vercel project and redeploy. The app then:

- runs on 12 built-in sample leads (fictional people, example.com emails, 555 numbers),
  two draft campaigns, consent records and Activity history (`src/lib/demo/seed.ts`);
- signs anyone in as `demo@leaddaddy.example` (keep Vercel Authentication on so only
  your team can open the link);
- never sends or verifies, whatever other keys are set;
- shows a "Demo Mode" banner on every page;
- writes AI-free sample copy when you create a campaign without AI keys.

Changes are kept in server memory, so they reset when Vercel starts a new server
(after a deploy, or after a while idle). To switch to a real database, add the Supabase
keys and remove `NEXT_PUBLIC_LEAD_DADDY_DEMO_MODE`, then redeploy.

**Never set it on the live app.** Only the exact value `true` turns it on.

## Which database?

- **Live data (Steve's Supabase keys):** the preview reads and changes the real leads.
  Sends and paid checks are still blocked on previews, but edits, deletes and imports are
  real. Get Steve's OK first, and make sure migration `20261113000300` is applied (it closes
  the open sign-up hole).
- **Safe sandbox (recommended for building):** a free, separate Supabase project with sample
  data. Nothing you do can touch real customers. Ask Claude to set it up.

## Moving work to the live app

When a change is ready: open a pull request from this repo into
`Smannenbach/LeadDaddy.ai`, Steve reviews and merges it, then promotes the build to
production on his Vercel project. Both repos share the same history, so changes carry over
cleanly. Don't copy the `vercel.json` change back: the live app needs its campaign runner.
