# Lead pipeline

Finds professionals who see equity questions before a lender does (family law, probate, estate and elder law attorneys, CPAs, remodelers, roofers, pool builders), starting in Arizona. It pulls each business from Google Maps, finds and verifies email addresses on their own website, writes a personalized first line with Claude, and exports CSVs ready for Instantly or Smartlead.

It builds lists only. It never sends email.

## Setup

Needs Python 3.11 or newer.

```bash
cd tools/lead-scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

Then open `.env` and add your keys.

## API keys

| Key | Where to get it | Used for |
|---|---|---|
| `APIFY_API_TOKEN` | console.apify.com, Settings, API and Integrations | Google Maps search (default provider) |
| `OUTSCRAPER_API_KEY` | app.outscraper.com, Profile, API Token | Google Maps search, if you set `maps_provider: outscraper` |
| `MILLIONVERIFIER_API_KEY` | app.millionverifier.com, API | Email verification |
| `ANTHROPIC_API_KEY` | platform.claude.com, API Keys | Personalized first lines |

You only need one Maps key. Keys stay in `.env`, which git ignores.

## Settings

Everything else is in `config.yaml`: niches, cities, results per search, which Maps provider, daily spend caps per phase, prices, crawl politeness and personalization options. See `DECISIONS.md` for why each default is what it is.

## Commands

```bash
leads find                         # Phase 2: Google Maps search for every niche and city
leads emails                       # Phase 3: crawl sites for emails and names
leads verify                       # Phase 4: verify new emails
leads personalize                  # Phase 5: write first lines
leads export --niche "family law"  # Phase 6: CSV for Instantly (add --format smartlead)
leads run-all                      # everything in order
leads stats                        # counts and spend
leads estimate                     # the most the next run could cost; spends nothing
leads suppress jane@firm.com --reason "unsubscribed"
leads suppress-import unsubscribes.csv --reason "unsubscribed"
leads import-businesses firms.csv --niche "family law attorney"
```

**No Maps key yet?** Load businesses from any CSV with `leads import-businesses`. It needs a name column and a website column (common header names like Firm Name, Company, URL or Site all work), plus a niche column or `--niche`. City, state, zip and phone are picked up when present. Imports go through the same duplicate check as Maps results. Then run `leads emails` and the rest as usual.

**Unsubscribes and bounces:** export them from Instantly or Smartlead and run `leads suppress-import <file>`. It pulls every email address in the file, whatever the column is called.

Useful options:
- `leads find --niche "CPA" --city Phoenix --max-results 5` for a small test.
- `leads run-all --niche "family law attorney" --city Phoenix --max-results 5` for a full dry run.
- `leads emails --limit 20`, `leads verify --limit 50`, `leads personalize --limit 50` to go in small steps.
- `leads personalize --batch` forces the Batches API (half price, can take up to an hour).

Every command is safe to rerun. Finished Maps searches, crawled sites, verified emails and written lines are skipped.

Exports land in `data/exports/` as `<niche>_<format>_<date>.csv`. Anything in the suppression list is left out.

## Expected costs

Using the prices in `config.yaml` (check them against your plans):

| Step | Unit cost | Per finished lead |
|---|---|---|
| Maps search | about $0.003 per place | the biggest cost, since only some places have a site with a usable email |
| Crawl | free | free |
| Verification | about $0.0006 per email | under $0.001 |
| Claude Haiku 5.5 first line | about $0.0002 per line, half that in a batch | about $0.0002 |

Cost per finished lead depends mostly on how many places turn into a verified email. `leads stats` prints the real number after each run. The daily caps in `config.yaml` stop a phase before it overspends.

## Before you send

- **CAN-SPAM:** every email needs your real physical mailing address, a working opt-out, an honest From name and a subject line that isn't misleading. Instantly and Smartlead handle the opt-out link; you supply the address.
- **Unsubscribes:** add every opt-out back with `leads suppress` before your next export, so nobody gets re-added.
- **Referral rules:** these lists target attorneys, CPAs and contractors as referral sources. RESPA Section 8 bars paying or giving anything of value for mortgage referrals. Keep the outreach about relationships, not referral fees.
- **Robots and logins:** the crawler honors robots.txt and never touches LinkedIn or any site that needs a login.

## Tests

```bash
pytest
```

Every paid API is mocked in tests. Nothing is charged.
