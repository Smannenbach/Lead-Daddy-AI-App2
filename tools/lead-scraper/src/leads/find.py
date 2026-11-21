"""Phase 2: find businesses on Google Maps and save the ones with websites."""
from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass

from leads.config import Config
from leads.costs import Run
from leads.db import now
from leads.domains import normalize_url, site_domain
from leads.maps import MapsProvider, Place

log = logging.getLogger(__name__)


@dataclass
class FindResult:
    searches_run: int = 0
    searches_skipped: int = 0
    places_seen: int = 0
    saved: int = 0
    no_website: int = 0
    duplicates: int = 0


def save_place(conn: sqlite3.Connection, place: Place, niche: str, source: str) -> str:
    """Insert one place. Returns 'saved', 'no_website' or 'duplicate'.

    Dedupe order: google_place_id first, then normalized website domain.
    """
    if not place.website or not site_domain(place.website):
        return "no_website"
    domain = site_domain(place.website)
    if place.place_id and conn.execute(
        "SELECT 1 FROM businesses WHERE google_place_id = ?", (place.place_id,)
    ).fetchone():
        return "duplicate"
    if conn.execute("SELECT 1 FROM businesses WHERE domain = ?", (domain,)).fetchone():
        return "duplicate"
    conn.execute(
        """INSERT INTO businesses (name, niche, address, city, state, zip, phone, website, domain,
               google_place_id, rating, review_count, source, scraped_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            place.name, niche, place.address, place.city, place.state, place.zip, place.phone,
            normalize_url(place.website), domain, place.place_id, place.rating, place.review_count,
            source, now(),
        ),
    )
    return "saved"


def run_find(
    conn: sqlite3.Connection,
    cfg: Config,
    provider: MapsProvider,
    niches: list[str] | None = None,
    max_results: int | None = None,
) -> FindResult:
    """Run every niche x location search that hasn't finished before."""
    limit = max_results or cfg.max_results
    result = FindResult()
    with Run(conn, "find", cfg.cap("find")) as run:
        for niche in niches or cfg.niches:
            for loc in cfg.locations:
                done = conn.execute(
                    "SELECT 1 FROM searches WHERE provider=? AND query=? AND city=? AND state=? AND max_results=?",
                    (provider.name, niche, loc.city, loc.state, limit),
                ).fetchone()
                if done:
                    result.searches_skipped += 1
                    continue
                # Worst case the provider bills for `limit` places.
                run.ensure_budget(limit * provider.price_per_place())
                try:
                    places = provider.search(niche, loc.city, loc.state, limit)
                except Exception as exc:  # one failed search shouldn't stop the rest
                    log.warning("Search failed for %s in %s, %s: %s", niche, loc.city, loc.state, exc)
                    run.errors += 1
                    continue
                cost = len(places) * provider.price_per_place()
                run.charge(cost)
                run.records_in += len(places)
                result.searches_run += 1
                result.places_seen += len(places)
                for place in places:
                    outcome = save_place(conn, place, niche, provider.name)
                    if outcome == "saved":
                        result.saved += 1
                        run.records_out += 1
                    elif outcome == "no_website":
                        result.no_website += 1
                    else:
                        result.duplicates += 1
                # Mark the search done in the same commit as its places, so a crash never
                # leaves a paid search unrecorded or a recorded search half saved.
                conn.execute(
                    "INSERT INTO searches VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (provider.name, niche, loc.city, loc.state, limit, len(places), cost, now()),
                )
                conn.commit()
    return result
