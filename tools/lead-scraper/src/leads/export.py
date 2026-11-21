"""Phase 6: export send ready CSVs for Instantly or Smartlead, filtered through suppression."""
from __future__ import annotations

import csv
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from leads.config import Config
from leads.db import now
from leads.verify import passing_statuses

INSTANTLY_COLUMNS = ["email", "first_name", "last_name", "company_name", "website", "city", "state", "personalization"]
SMARTLEAD_COLUMNS = ["email", "first_name", "last_name", "company_name", "website", "location", "personalization"]


def add_suppression(conn: sqlite3.Connection, email: str, reason: str | None) -> None:
    conn.execute(
        "INSERT INTO suppression (email, reason, added_at) VALUES (?, ?, ?) "
        "ON CONFLICT(email) DO UPDATE SET reason = excluded.reason",
        (email.strip().lower(), reason, now()),
    )
    conn.commit()


def export_rows(conn: sqlite3.Connection, cfg: Config, niche: str | None = None) -> list[sqlite3.Row]:
    """Verified, personalized contacts not in suppression. Niche matches as a substring."""
    statuses = passing_statuses(cfg)
    sql = f"""SELECT c.email, c.first_name, c.last_name, b.name AS company_name, b.website, b.city, b.state,
                     b.niche, p.first_line AS personalization
              FROM contacts c
              JOIN businesses b ON b.id = c.business_id
              JOIN personalization p ON p.contact_id = c.id
              WHERE c.verification_status IN ({",".join("?" * len(statuses))})
                AND lower(c.email) NOT IN (SELECT email FROM suppression)
                {"AND lower(b.niche) LIKE ?" if niche else ""}
              ORDER BY b.niche, b.city, b.name"""
    params: list[str] = list(statuses) + ([f"%{niche.lower()}%"] if niche else [])
    return conn.execute(sql, params).fetchall()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "all"


@dataclass
class ExportFile:
    path: Path
    rows: int


def write_csv(rows: list[sqlite3.Row], path: Path, fmt: str) -> ExportFile:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = INSTANTLY_COLUMNS if fmt == "instantly" else SMARTLEAD_COLUMNS
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in rows:
            values = {
                "email": r["email"],
                "first_name": r["first_name"] or "",
                "last_name": r["last_name"] or "",
                "company_name": r["company_name"],
                "website": r["website"],
                "city": r["city"] or "",
                "state": r["state"] or "",
                "location": ", ".join(x for x in (r["city"], r["state"]) if x),
                "personalization": r["personalization"],
            }
            w.writerow([values[c] for c in cols])
    return ExportFile(path, len(rows))


def run_export(conn: sqlite3.Connection, cfg: Config, niche: str | None = None, fmt: str = "instantly") -> list[ExportFile]:
    """One CSV per niche (or just the niche asked for)."""
    if fmt not in ("instantly", "smartlead"):
        raise ValueError("Format must be instantly or smartlead.")
    rows = export_rows(conn, cfg, niche)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    groups: dict[str, list[sqlite3.Row]] = {}
    for r in rows:
        groups.setdefault(niche or r["niche"], []).append(r)
    files = []
    for name, group in groups.items():
        files.append(write_csv(group, cfg.export_dir / f"{slug(name)}_{fmt}_{stamp}.csv", fmt))
    return files


@dataclass
class Stats:
    businesses: int
    crawled: int
    emails_found: int
    verified: int
    personalized: int
    suppressed: int
    exportable: int
    spend: dict[str, float]

    @property
    def total_cost(self) -> float:
        return sum(self.spend.values())

    @property
    def cost_per_lead(self) -> float | None:
        return self.total_cost / self.exportable if self.exportable else None


def stats(conn: sqlite3.Connection, cfg: Config) -> Stats:
    statuses = passing_statuses(cfg)
    q = lambda sql, *a: conn.execute(sql, a).fetchone()[0]  # noqa: E731
    spend = {r["phase"]: float(r["usd"]) for r in conn.execute("SELECT phase, SUM(cost_usd) AS usd FROM runs GROUP BY phase")}
    return Stats(
        businesses=q("SELECT COUNT(*) FROM businesses"),
        crawled=q("SELECT COUNT(*) FROM businesses WHERE crawled_at IS NOT NULL"),
        emails_found=q("SELECT COUNT(*) FROM contacts"),
        verified=q(f"SELECT COUNT(*) FROM contacts WHERE verification_status IN ({','.join('?' * len(statuses))})", *statuses),
        personalized=q("SELECT COUNT(*) FROM personalization"),
        suppressed=q("SELECT COUNT(*) FROM suppression"),
        exportable=len(export_rows(conn, cfg)),
        spend=spend,
    )
