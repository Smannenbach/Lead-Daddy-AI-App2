# Decisions

Calls made while building the lead pipeline without stopping to ask. Review the ones marked **Review**.

## Where it lives
- Built in `tools/lead-scraper/` inside the app2 repo, as its own Python project. It shares nothing with the Next.js app. `.vercelignore` keeps it out of Vercel deploys.

## Money
- Default Maps provider is Apify (switched from Outscraper, whose key was rejected).
- Apify's price is confirmed: a live 5 place run billed $0.004 per place for the Google Maps Scraper actor. The "skip closed places" filter is off because Apify bills every filter at $0.001 per place, which adds 25%.
- **Review: the other prices are estimates.** `config.yaml` uses Outscraper $0.003 per place and MillionVerifier $0.0006 per email. Your real rate depends on your plan and volume (MillionVerifier's per email price is much higher on small credit packs). Update `pricing:` to match your invoices so caps and cost per lead are accurate.
- Claude prices are Anthropic's published rates for Claude Haiku 5.5 at prompts of 100K tokens or less: $0.10 input, $0.50 output, $0.125 cache write, $0.01 cache read per million tokens. Batches bill at half that.
- The find phase charges for the places a search returns. The cap check assumes the worst case (a full page of results) before each search.
- Caps are per phase, per UTC day, summed across every run that day.
- The crawl phase is free, so it has no cap.

## Models and personalization
- **Review: model is `claude-haiku-5-5`.** The prompt said `claude-haiku-4-5` or the cheapest current Haiku. Haiku 5.5 is the current one and costs a tenth of Haiku 4.5 ($0.10 vs $1.00 per million input tokens).
- Thinking is off and effort is low. The output is one short line, so reasoning tokens would only add cost.
- The instruction block is cached. Haiku 5.5 only caches prefixes of 512 tokens or more, so the instructions are written out in full with examples rather than trimmed.
- Batches API kicks in at 50 or more lines (`batch_threshold`). Below that, lines are written one at a time so small runs finish in seconds. `leads personalize --batch` forces it.
- Every line is checked in code after Claude writes it: under 25 words, no dashes, no flattery words, no question or exclamation marks, no mention of AI. A line that fails, or a THIN reply, gets the niche fallback line instead. The cost of that call is still logged.
- **Review: fallback lines.** They're deliberately plain ("Came across your family law practice while looking at offices in Phoenix and wanted to reach out.") and make no claims about you or the reader. Edit `FALLBACKS` in `src/leads/personalize.py` to your voice.
- The instructions frame the sender as a mortgage professional reaching people who see equity questions first, and forbid pitching in the line itself.

## Finding emails
- Pages crawled: the homepage, the eight paths from the brief, plus any link on the homepage whose path mentions contact, about, team, attorney, staff, people, lawyer, our-firm or meet (catches `/contact.html`, `/meet-the-team`). At most 9 pages per site.
- robots.txt: a missing robots.txt means allowed. A robots.txt that returns 401 or 403 means the whole site is off limits. Each page is checked before it's fetched.
- If a site's https homepage fails (often a broken certificate), the crawler tries plain http once.
- Sites that block crawlers (403) or show a bot challenge are skipped, not worked around.
- Website links are saved without tracking tags (`?utm_source=...`) so exports stay clean.
- The 1 to 3 second delay is between requests to the same site. Ten sites run at once.
- Page text is saved in a `pages` table so Phase 5 reuses it instead of fetching sites twice.
- Emails on another company's domain (web designers, bar associations) are always dropped. Free webmail is used only when the site has no address on its own domain, and is marked `:webmail` in `email_source`.
- Cloudflare "email protection" addresses (`data-cfemail` and `/cdn-cgi/l/email-protection#...` links) are decoded. Many small business sites use it, and without decoding those sites look like they have no email. They're marked `cloudflare` in `email_source`.
- Some role addresses are never kept: noreply, careers, jobs, hr, billing, accounting, privacy, webmaster, postmaster, abuse, press and similar.
- Ranking: an address matching a person found on the site scores 3, any other personal looking address 2, a role address like info@ or office@ 1. Top two per business are kept.
- Names and titles come from simple patterns on the page ("Jane Smith" then "Managing Partner", or "Robert Lee, Associate Attorney"). It misses some layouts. Contacts without a name export with blank first and last names.

## Verification
- MillionVerifier results map like this: ok to valid, catch_all to catch_all, unknown to unknown, invalid and disposable to invalid.
- Only `valid` moves forward unless `verify.allow_catch_all: true`.
- An email checked in the last 90 days, on any contact, is reused without paying again.
- MillionVerifier takes the API key in the URL. The tool turns off request URL logging so the key never lands in a log file.

## Storage
- Schema matches the brief, plus: `businesses.domain` (for dedupe), `businesses.crawled_at` and `crawl_error`, a `searches` table (so a rerun never pays for the same Maps search twice) and a `pages` table (saved site text).
- Dedupe: Google place id first, then normalized website domain (`www.` and paths ignored).
- Business phone and address are the public listing from Google Maps. No personal phones or home addresses are collected.

## Exports
- Instantly: `email, first_name, last_name, company_name, website, city, state, personalization`.
- **Review: Smartlead** columns are `email, first_name, last_name, company_name, website, location, personalization`. Smartlead maps columns during import; map `personalization` to a custom field and use it in your template.
- File names: `<niche>_<format>_<YYYYMMDD>.csv` in `data/exports/`.
- `--niche` matches as a substring, so "family law" matches "family law attorney".

## Extras beyond the brief
- `leads import-businesses` loads businesses from a CSV so the pipeline runs without a Maps key. Source is stored as `csv:<file name>`.
- `leads suppress-import` reads any CSV or text file and suppresses every email in it, so Instantly and Smartlead exports work without mapping columns.
- `leads estimate` shows the most the next run could cost against today's caps. With the default config (8 niches, 9 cities, 20 results) a full Maps pass is up to 1,440 places, about $4.32 at the estimated Outscraper price, under the $5 find cap.

## Not built
- No sending. Lists only.
- No LinkedIn or any logged in site.
- No automatic sync of unsubscribes from Instantly or Smartlead. Export them and run `leads suppress-import`.
