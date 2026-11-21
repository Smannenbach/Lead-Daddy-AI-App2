"""Phase 3: crawl each business site for emails and people.

Polite by design: honors robots.txt, uses one browser user agent, waits 1 to 3 seconds
between requests to the same site, times out after 10 seconds, and crawls at most 10
sites at once. A failed site is logged and skipped; it never stops the run.
"""
from __future__ import annotations

import asyncio
import logging
import random
import sqlite3
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from leads.config import Config
from leads.costs import Run
from leads.db import now
from leads.domains import site_domain
from leads.extract import FoundEmail, Person, parse_page, rank_emails

log = logging.getLogger(__name__)

LIKELY_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/attorneys", "/our-team", "/staff"]
_LINK_HINTS = ("contact", "about", "team", "attorney", "staff", "people", "lawyer", "our-firm", "meet")


def page_kind(path: str) -> str:
    p = path.lower()
    if p in ("", "/"):
        return "home"
    if "contact" in p:
        return "contact"
    if "about" in p or "firm" in p:
        return "about"
    return "team"


@dataclass
class SiteResult:
    business_id: int
    emails: list[FoundEmail] = field(default_factory=list)
    people: list[Person] = field(default_factory=list)
    pages: list[tuple[str, str, str]] = field(default_factory=list)  # (url, kind, text)
    error: str | None = None


class SiteCrawler:
    def __init__(self, cfg: Config, client: httpx.AsyncClient | None = None, sleep=asyncio.sleep) -> None:
        c = cfg.section("crawl")
        self.timeout = float(c.get("timeout_seconds", 10))
        self.min_delay = float(c.get("min_delay_seconds", 1.0))
        self.max_delay = float(c.get("max_delay_seconds", 3.0))
        self.max_pages = int(c.get("max_pages_per_site", 9))
        self.user_agent = str(c.get("user_agent"))
        self.sem = asyncio.Semaphore(int(c.get("concurrency", 10)))
        self.client = client
        self.sleep = sleep

    async def _get(self, client: httpx.AsyncClient, url: str) -> httpx.Response | None:
        try:
            resp = await client.get(url, timeout=self.timeout)
        except httpx.HTTPError as exc:
            log.debug("fetch failed %s: %s", url, exc)
            return None
        ctype = resp.headers.get("content-type", "")
        if resp.status_code != 200 or ("html" not in ctype and "text" not in ctype):
            return None
        return resp

    async def _robots(self, client: httpx.AsyncClient, base: str) -> RobotFileParser:
        rp = RobotFileParser()
        resp = None
        try:
            resp = await client.get(urljoin(base, "/robots.txt"), timeout=self.timeout)
        except httpx.HTTPError:
            pass
        if resp is not None and resp.status_code == 200:
            rp.parse(resp.text.splitlines())
        elif resp is not None and resp.status_code in (401, 403):
            rp.disallow_all = True  # standard meaning: the site doesn't want crawlers
        else:
            rp.allow_all = True  # no robots.txt means no restrictions
        return rp

    async def crawl(self, business_id: int, website: str) -> SiteResult:
        result = SiteResult(business_id)
        async with self.sem:
            own_client = self.client is None
            client = self.client or httpx.AsyncClient(
                headers={"User-Agent": self.user_agent, "Accept": "text/html,application/xhtml+xml"},
                follow_redirects=True,
            )
            try:
                home = await self._get(client, website)
                if home is None:
                    result.error = "homepage did not load"
                    return result
                base = str(home.url)
                rp = await self._robots(client, base)
                if not rp.can_fetch(self.user_agent, base):
                    result.error = "robots.txt disallows crawling"
                    return result
                home_data = parse_page(home.text)
                self._collect(result, base, "home", home_data)

                host = urlparse(base).hostname or ""
                targets = [urljoin(base, p) for p in LIKELY_PATHS]
                # Add the site's own contact/about/team links (often /contact.html and the like).
                for href in home_data.links:
                    full = urljoin(base, href)
                    parsed = urlparse(full)
                    if parsed.hostname == host and any(h in parsed.path.lower() for h in _LINK_HINTS):
                        targets.append(full.split("#", 1)[0])
                seen = {base.rstrip("/")}
                fetched = 1
                for url in targets:
                    key = url.rstrip("/")
                    if key in seen or fetched >= self.max_pages:
                        continue
                    seen.add(key)
                    if not rp.can_fetch(self.user_agent, url):
                        continue
                    await self.sleep(random.uniform(self.min_delay, self.max_delay))
                    resp = await self._get(client, url)
                    fetched += 1
                    if resp is None or str(resp.url).rstrip("/") in seen - {key}:
                        continue  # 404s, and pages that redirect back home
                    self._collect(result, str(resp.url), page_kind(urlparse(url).path), parse_page(resp.text))
            except Exception as exc:  # anything unexpected: log it, skip the site
                result.error = f"{type(exc).__name__}: {exc}"[:300]
            finally:
                if own_client:
                    await client.aclose()
        return result

    @staticmethod
    def _collect(result: SiteResult, url: str, kind: str, data) -> None:
        known = {e.email for e in result.emails}
        result.emails.extend(e for e in data.emails if e.email not in known)
        names = {(p.first_name, p.last_name) for p in result.people}
        result.people.extend(p for p in data.people if (p.first_name, p.last_name) not in names)
        if data.text:
            result.pages.append((url, kind, data.text[:20000]))


def save_site(conn: sqlite3.Connection, site: SiteResult, website: str, keep: int) -> int:
    """Store pages and the best emails for one business. Returns contacts added."""
    for url, kind, text in site.pages:
        conn.execute(
            "INSERT OR REPLACE INTO pages (business_id, url, kind, text, fetched_at) VALUES (?, ?, ?, ?, ?)",
            (site.business_id, url, kind, text, now()),
        )
    added = 0
    for r in rank_emails(site.emails, site_domain(website), site.people, keep=keep):
        p = r.person
        cur = conn.execute(
            """INSERT OR IGNORE INTO contacts (business_id, first_name, last_name, title, email, email_source)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                site.business_id, p.first_name if p else None, p.last_name if p else None,
                p.title if p else None, r.email, r.source + (":webmail" if r.webmail else ""),
            ),
        )
        added += cur.rowcount
    conn.execute(
        "UPDATE businesses SET crawled_at = ?, crawl_error = ? WHERE id = ?",
        (now(), site.error, site.business_id),
    )
    conn.commit()
    return added


@dataclass
class EmailsResult:
    sites: int = 0
    sites_failed: int = 0
    contacts_added: int = 0


async def _run(conn: sqlite3.Connection, cfg: Config, rows: list[sqlite3.Row], crawler: SiteCrawler) -> EmailsResult:
    keep = int(cfg.section("crawl").get("emails_per_business", 2))
    out = EmailsResult()
    with Run(conn, "emails") as run:
        tasks = [asyncio.create_task(crawler.crawl(r["id"], r["website"])) for r in rows]
        websites = {r["id"]: r["website"] for r in rows}
        for done in asyncio.as_completed(tasks):
            site = await done
            out.sites += 1
            run.records_in += 1
            if site.error:
                out.sites_failed += 1
                run.errors += 1
                log.info("Skipped %s: %s", websites[site.business_id], site.error)
            added = save_site(conn, site, websites[site.business_id], keep)
            out.contacts_added += added
            run.records_out += added
    return out


def run_emails(conn: sqlite3.Connection, cfg: Config, limit: int | None = None, recrawl: bool = False,
               crawler: SiteCrawler | None = None) -> EmailsResult:
    """Crawl every business not crawled yet (or all of them with recrawl)."""
    sql = "SELECT id, website FROM businesses" + ("" if recrawl else " WHERE crawled_at IS NULL") + " ORDER BY id"
    if limit:
        sql += f" LIMIT {int(limit)}"
    rows = conn.execute(sql).fetchall()
    return asyncio.run(_run(conn, cfg, rows, crawler or SiteCrawler(cfg)))
