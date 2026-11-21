"""Find, cost caps, verify, personalize, export. Every paid API is mocked."""
from __future__ import annotations

import asyncio
import csv
import json
from types import SimpleNamespace

import httpx
import pytest

from leads.costs import CapReached, Run, spent_today
from leads.crawl import SiteCrawler, run_emails
from leads.export import add_suppression, run_export, stats
from leads.find import run_find
from leads.maps import Apify, Outscraper, Place
from leads.personalize import clean_line, fallback_line, run_personalize
from leads.verify import MillionVerifier, run_verify


class FakeProvider:
    name = "fake"

    def __init__(self, places):
        self.places = places
        self.calls = 0

    def price_per_place(self):
        return 0.01

    def search(self, query, city, state, limit):
        self.calls += 1
        return self.places[:limit]


def place(pid, site, name="Smith Law"):
    return Place(name, "1 Main St", "Phoenix", "AZ", "85001", "(602) 555-0100", site, pid, 4.8, 20)


# ---------- Phase 2 ----------

def test_find_dedupes_and_skips_no_website(conn, cfg):
    prov = FakeProvider([
        place("p1", "https://www.smithlaw.com/"),
        place("p1", "https://smithlaw.com"),           # same place id
        place("p2", "http://SmithLaw.com/contact"),    # same domain, new place id
        place("p3", None, "No Site LLC"),               # no website
        place("p4", "desertcpa.com", "Desert CPA"),
    ])
    r = run_find(conn, cfg, prov)
    assert (r.saved, r.duplicates, r.no_website) == (2, 2, 1)
    domains = [row[0] for row in conn.execute("SELECT domain FROM businesses ORDER BY id")]
    assert domains == ["smithlaw.com", "desertcpa.com"]


def test_find_is_resumable_and_never_pays_twice(conn, cfg):
    prov = FakeProvider([place("p1", "smithlaw.com")])
    run_find(conn, cfg, prov)
    r = run_find(conn, cfg, prov)
    assert prov.calls == 1 and r.searches_skipped == 1
    assert spent_today(conn, "find") == pytest.approx(0.01)


def test_find_stops_at_daily_cap(conn, cfg):
    cfg.raw["daily_caps_usd"]["find"] = 0.15
    cfg.raw["niches"] = ["a", "b", "c"]
    prov = FakeProvider([place(f"p{i}", f"site{i}.com") for i in range(10)])
    with pytest.raises(CapReached):
        run_find(conn, cfg, prov, max_results=10)  # each search may cost $0.10
    assert prov.calls == 1
    assert spent_today(conn, "find") <= 0.15


def test_cost_cap_counts_all_runs_today(conn):
    with Run(conn, "verify", cap_usd=1.0) as r1:
        r1.charge(0.6)
    with Run(conn, "verify", cap_usd=1.0) as r2:
        r2.ensure_budget(0.4)
        with pytest.raises(CapReached):
            r2.ensure_budget(0.41)


def test_outscraper_and_apify_parsing(cfg):
    def outscraper(req):
        assert req.headers["X-API-KEY"] == "test-not-a-real-key"
        return httpx.Response(200, json={"data": [[{"name": "Smith Law", "site": "smithlaw.com", "place_id": "x1",
                                                      "city": "Phoenix", "state_code": "AZ", "rating": "4.9", "reviews": 31}]]})

    def apify(req):
        assert req.headers["Authorization"] == "Bearer test-not-a-real-key"
        assert json.loads(req.content)["maxCrawledPlacesPerSearch"] == 5
        return httpx.Response(200, json=[{"title": "Desert CPA", "website": "desertcpa.com", "placeId": "y1", "totalScore": 4.5}])

    o = Outscraper(cfg, httpx.Client(transport=httpx.MockTransport(outscraper))).search("cpa", "Phoenix", "AZ", 5)
    a = Apify(cfg, httpx.Client(transport=httpx.MockTransport(apify))).search("cpa", "Phoenix", "AZ", 5)
    assert (o[0].website, o[0].place_id, o[0].rating, o[0].review_count) == ("smithlaw.com", "x1", 4.9, 31)
    assert (a[0].name, a[0].place_id) == ("Desert CPA", "y1")


# ---------- Phase 3 ----------

SITE = {
    "/": '<html><body><nav><a href="/meet-the-team.html">Team</a></nav><h1>Smith Law</h1>'
         "<p>Family law for Phoenix families since 2004. We focus on divorce mediation.</p></body></html>",
    "/robots.txt": "User-agent: *\nDisallow: /attorneys\n",
    "/contact": '<a href="mailto:info@smithlaw.com">Email us</a>',
    "/meet-the-team.html": "<p>Jane Smith</p><p>Managing Partner</p><p>jsmith [at] smithlaw [dot] com</p>",
    "/attorneys": "<p>secret@smithlaw.com</p>",
}


def mock_site(req: httpx.Request) -> httpx.Response:
    body = SITE.get(req.url.path)
    if body is None:
        return httpx.Response(404, text="nope", headers={"content-type": "text/html"})
    ctype = "text/plain" if req.url.path.endswith(".txt") else "text/html"
    return httpx.Response(200, text=body, headers={"content-type": ctype})


async def no_sleep(_):
    return None


def test_crawl_finds_emails_people_and_respects_robots(conn, cfg):
    conn.execute("INSERT INTO businesses (name, niche, website, domain, source, scraped_at) VALUES "
                 "('Smith Law', 'family law attorney', 'https://smithlaw.com', 'smithlaw.com', 'fake', 'now')")
    seen = []

    def handler(req):
        seen.append(req.url.path)
        return mock_site(req)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True)
    r = run_emails(conn, cfg, crawler=SiteCrawler(cfg, client=client, sleep=no_sleep))
    assert r.contacts_added == 2 and r.sites_failed == 0
    assert "/attorneys" not in seen  # robots.txt disallows it
    rows = conn.execute("SELECT email, first_name, title FROM contacts ORDER BY id").fetchall()
    assert [tuple(x) for x in rows] == [("jsmith@smithlaw.com", "Jane", "Managing Partner"), ("info@smithlaw.com", None, None)]
    assert conn.execute("SELECT COUNT(*) FROM pages WHERE kind='home'").fetchone()[0] == 1
    # Already crawled: a second run does nothing.
    assert run_emails(conn, cfg, crawler=SiteCrawler(cfg, client=client, sleep=no_sleep)).sites == 0


def test_crawl_failure_is_logged_not_raised(conn, cfg):
    conn.execute("INSERT INTO businesses (name, niche, website, domain, source, scraped_at) VALUES "
                 "('Down Co', 'cpa', 'https://down.example', 'down.example', 'fake', 'now')")

    def boom(req):
        raise httpx.ConnectError("refused")

    client = httpx.AsyncClient(transport=httpx.MockTransport(boom))
    r = run_emails(conn, cfg, crawler=SiteCrawler(cfg, client=client, sleep=no_sleep))
    assert r.sites_failed == 1
    assert conn.execute("SELECT crawl_error FROM businesses").fetchone()[0] == "homepage did not load"


# ---------- Phase 4 ----------

def seed_contact(conn, email="jsmith@smithlaw.com", status=None, verified_at=None, niche="family law attorney", text=None):
    cur = conn.execute("INSERT INTO businesses (name, niche, city, state, website, domain, source, scraped_at) "
                       "VALUES (?, ?, 'Phoenix', 'AZ', ?, ?, 'fake', 'now')",
                       (f"Biz {email}", niche, f"https://{email.split('@')[1]}", f"{email}.{conn.execute('SELECT COUNT(*) FROM businesses').fetchone()[0]}"))
    bid = cur.lastrowid
    cur = conn.execute("INSERT INTO contacts (business_id, first_name, last_name, email, verification_status, verified_at) "
                       "VALUES (?, 'Jane', 'Smith', ?, ?, ?)", (bid, email, status, verified_at))
    if text is not None:
        conn.execute("INSERT INTO pages VALUES (?, ?, 'home', ?, 'now')", (bid, f"https://{bid}", text))
    conn.commit()
    return cur.lastrowid


def test_verify_maps_statuses_and_reuses_recent_checks(conn, cfg):
    from leads.db import now
    seed_contact(conn, "a@one.com")
    seed_contact(conn, "b@two.com")
    seed_contact(conn, "c@three.com")
    seed_contact(conn, "a@one.com", status="valid", verified_at=now())  # checked recently elsewhere
    calls = []

    def handler(req):
        calls.append(req.url.params["email"])
        return httpx.Response(200, json={"result": {"b@two.com": "catch_all", "c@three.com": "disposable"}[req.url.params["email"]]})

    r = run_verify(conn, cfg, MillionVerifier(httpx.Client(transport=httpx.MockTransport(handler))))
    assert sorted(calls) == ["b@two.com", "c@three.com"]
    assert (r.reused, r.valid, r.catch_all, r.invalid) == (1, 1, 1, 1)
    assert spent_today(conn, "verify") == pytest.approx(2 * cfg.price("millionverifier_per_email"))


# ---------- Phase 5 ----------

class FakeMessages:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def create(self, **params):
        self.calls.append(params)
        usage = SimpleNamespace(input_tokens=300, output_tokens=25, cache_creation_input_tokens=0, cache_read_input_tokens=700)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.reply)], stop_reason="end_turn", usage=usage)


def test_personalize_writes_lines_caches_instructions_and_logs_cost(conn, cfg):
    long_text = "Smith Law focuses on divorce mediation and post decree modifications for Phoenix families. " * 5
    cid = seed_contact(conn, status="valid", text=long_text)
    thin = seed_contact(conn, "x@thin.com", status="valid", text="Home")
    seed_contact(conn, "y@bad.com", status="invalid", text=long_text)  # not verified: skipped
    msgs = FakeMessages("Saw that your firm focuses on divorce mediation for Phoenix families.")
    r = run_personalize(conn, cfg, client=SimpleNamespace(messages=msgs), force_batch=False)
    assert (r.written, r.fallbacks) == (1, 1)
    sent = msgs.calls[0]
    assert sent["model"] == "claude-haiku-5-5"
    assert sent["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert len(sent["messages"][0]["content"]) <= 1600
    lines = dict(conn.execute("SELECT contact_id, first_line FROM personalization").fetchall())
    assert lines[cid].startswith("Saw that your firm")
    assert lines[thin].startswith("Came across your family law practice")
    cost = conn.execute("SELECT cost_usd FROM personalization WHERE contact_id=?", (cid,)).fetchone()[0]
    assert cost == pytest.approx((300 * 0.10 + 25 * 0.50 + 700 * 0.01) / 1e6)


def test_personalize_rejects_rule_breaking_lines(conn, cfg):
    cid = seed_contact(conn, status="valid", text="x" * 500)
    msgs = FakeMessages("Your amazing firm — truly impressive!")
    run_personalize(conn, cfg, client=SimpleNamespace(messages=msgs), force_batch=False)
    row = conn.execute("SELECT first_line, model FROM personalization WHERE contact_id=?", (cid,)).fetchone()
    assert row["first_line"].startswith("Came across") and row["model"].startswith("fallback")


def test_clean_line_rules():
    assert clean_line('"Noticed you design every pool in house."', 25) == "Noticed you design every pool in house."
    assert clean_line("THIN", 25) is None
    assert clean_line("Quick question for you?", 25) is None
    assert clean_line("Saw your page - nice.", 25) is None
    assert clean_line("I used AI to read your site.", 25) is None
    assert clean_line(" ".join(["word"] * 26), 25) is None
    assert "Phoenix" in fallback_line("Roofing Contractor", "Phoenix")


# ---------- Phase 6 ----------

def finished_lead(conn, email, niche="family law attorney"):
    cid = seed_contact(conn, email, status="valid", niche=niche)
    conn.execute("INSERT INTO personalization (contact_id, first_line, model, cost_usd, created_at) "
                 "VALUES (?, 'Saw your page on mediation.', 'claude-haiku-5-5', 0.0001, 'now')", (cid,))
    conn.commit()


def test_export_filters_suppression_and_splits_by_niche(conn, cfg, tmp_path):
    cfg.raw["export"] = {"dir": str(tmp_path)}
    finished_lead(conn, "jane@smithlaw.com")
    finished_lead(conn, "bob@desertcpa.com", niche="CPA")
    finished_lead(conn, "Gone@Unsub.com")
    add_suppression(conn, "gone@unsub.com", "unsubscribed")
    files = run_export(conn, cfg)
    by_name = {f.path.name.split("_instantly")[0]: f for f in files}
    assert set(by_name) == {"family_law_attorney", "cpa"}
    rows = list(csv.DictReader(by_name["family_law_attorney"].path.open()))
    assert [r["email"] for r in rows] == ["jane@smithlaw.com"]
    assert list(rows[0]) == ["email", "first_name", "last_name", "company_name", "website", "city", "state", "personalization"]

    only = run_export(conn, cfg, niche="family law", fmt="smartlead")
    rows = list(csv.DictReader(only[0].path.open()))
    assert [r["email"] for r in rows] == ["jane@smithlaw.com"] and rows[0]["location"] == "Phoenix, AZ"

    s = stats(conn, cfg)
    assert (s.exportable, s.suppressed) == (2, 1)
