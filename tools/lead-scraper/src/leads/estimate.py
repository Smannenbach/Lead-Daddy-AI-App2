"""What the next run would cost, before anything is spent."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from leads.config import Config
from leads.costs import spent_today
from leads.verify import passing_statuses


@dataclass
class PhaseEstimate:
    phase: str
    units: int
    unit: str
    max_usd: float
    spent_today: float
    cap: float | None

    @property
    def over_cap(self) -> bool:
        return self.cap is not None and self.spent_today + self.max_usd > self.cap


def pending_searches(conn: sqlite3.Connection, cfg: Config, provider: str, limit: int) -> int:
    n = 0
    for niche in cfg.niches:
        for loc in cfg.locations:
            done = conn.execute(
                "SELECT 1 FROM searches WHERE provider=? AND query=? AND city=? AND state=? AND max_results=?",
                (provider, niche, loc.city, loc.state, limit),
            ).fetchone()
            n += 0 if done else 1
    return n


def estimate(conn: sqlite3.Connection, cfg: Config) -> list[PhaseEstimate]:
    """Upper bounds: every search returns a full page, every line goes to Claude."""
    provider = cfg.maps_provider
    limit = cfg.max_results
    per_place = cfg.price(f"{provider}_per_place")
    searches = pending_searches(conn, cfg, provider, limit)

    to_verify = conn.execute("SELECT COUNT(DISTINCT email) FROM contacts WHERE verification_status IS NULL").fetchone()[0]
    statuses = passing_statuses(cfg)
    to_write = conn.execute(
        f"""SELECT COUNT(*) FROM contacts c LEFT JOIN personalization p ON p.contact_id = c.id
            WHERE p.id IS NULL AND c.verification_status IN ({",".join("?" * len(statuses))})""",
        statuses,
    ).fetchone()[0]
    p = cfg.section("personalize")
    batch = to_write >= int(p.get("batch_threshold", 50))
    # About 1,000 tokens of instructions (cached after the first call), 400 of site text, 40 out.
    per_line = (
        400 * cfg.price("claude_input_per_mtok")
        + 1000 * cfg.price("claude_cache_read_per_mtok")
        + 40 * cfg.price("claude_output_per_mtok")
    ) / 1_000_000 * (cfg.price("claude_batch_discount") if batch else 1.0)

    return [
        PhaseEstimate("find", searches * limit, "places", searches * limit * per_place, spent_today(conn, "find"), cfg.cap("find")),
        PhaseEstimate("emails", conn.execute("SELECT COUNT(*) FROM businesses WHERE crawled_at IS NULL").fetchone()[0],
                      "sites", 0.0, 0.0, None),
        PhaseEstimate("verify", to_verify, "emails", to_verify * cfg.price("millionverifier_per_email"),
                      spent_today(conn, "verify"), cfg.cap("verify")),
        PhaseEstimate("personalize", to_write, "lines", to_write * per_line, spent_today(conn, "personalize"), cfg.cap("personalize")),
    ]
