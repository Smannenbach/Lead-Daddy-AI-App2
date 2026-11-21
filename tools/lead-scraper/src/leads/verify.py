"""Phase 4: verify emails with MillionVerifier.

Statuses stored: valid, invalid, catch_all, unknown. An email checked in the last 90 days
(on any contact) is reused instead of paying again.
"""
from __future__ import annotations

import logging
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from leads.config import Config, secret
from leads.costs import CapReached, Run
from leads.db import now

log = logging.getLogger(__name__)

MV_URL = "https://api.millionverifier.com/api/v3/"
_STATUS = {"ok": "valid", "catch_all": "catch_all", "unknown": "unknown", "invalid": "invalid", "disposable": "invalid"}


class MillionVerifier:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self.client = client or httpx.Client(timeout=30)

    def check(self, email: str) -> str:
        # MillionVerifier takes the key as a query parameter; it has no header option.
        resp = self.client.get(MV_URL, params={"api": secret("MILLIONVERIFIER_API_KEY"), "email": email, "timeout": 10})
        resp.raise_for_status()
        data = resp.json()
        if data.get("error"):
            raise RuntimeError(f"MillionVerifier: {data['error']}")
        return _STATUS.get(str(data.get("result", "")).lower(), "unknown")


@dataclass
class VerifyResult:
    checked: int = 0
    reused: int = 0
    valid: int = 0
    catch_all: int = 0
    invalid: int = 0
    unknown: int = 0
    errors: int = 0
    stopped_by_cap: bool = False


def recent_status(conn: sqlite3.Connection, email: str, days: int) -> str | None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    row = conn.execute(
        """SELECT verification_status FROM contacts
           WHERE email = ? AND verification_status IS NOT NULL AND verified_at >= ?
           ORDER BY verified_at DESC LIMIT 1""",
        (email, cutoff),
    ).fetchone()
    return row[0] if row else None


def run_verify(conn: sqlite3.Connection, cfg: Config, verifier: MillionVerifier | None = None,
               limit: int | None = None) -> VerifyResult:
    v = cfg.section("verify")
    days = int(v.get("reverify_after_days", 90))
    price = cfg.price("millionverifier_per_email")
    verifier = verifier or MillionVerifier()
    out = VerifyResult()
    sql = "SELECT id, email FROM contacts WHERE verification_status IS NULL ORDER BY id"
    if limit:
        sql += f" LIMIT {int(limit)}"
    rows = conn.execute(sql).fetchall()

    def store(cid: int, status: str) -> None:
        conn.execute("UPDATE contacts SET verification_status = ?, verified_at = ? WHERE id = ?", (status, now(), cid))
        setattr(out, status, getattr(out, status) + 1)

    with Run(conn, "verify", cfg.cap("verify")) as run:
        run.records_in = len(rows)
        to_check = []
        for r in rows:
            cached = recent_status(conn, r["email"], days)
            if cached:
                store(r["id"], cached)
                out.reused += 1
            else:
                to_check.append(r)
        conn.commit()
        workers = max(1, int(v.get("concurrency", 5)))
        # Check in small chunks so the cap is enforced as we go.
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for i in range(0, len(to_check), workers):
                chunk = to_check[i : i + workers]
                try:
                    run.ensure_budget(len(chunk) * price)
                except CapReached as exc:
                    log.warning(str(exc))
                    out.stopped_by_cap = True
                    break
                results = list(pool.map(lambda r: _safe_check(verifier, r["email"]), chunk))
                for r, status in zip(chunk, results):
                    if status is None:
                        out.errors += 1
                        run.errors += 1
                        continue
                    run.charge(price)
                    store(r["id"], status)
                    out.checked += 1
                conn.commit()
        run.records_out = out.valid + (out.catch_all if v.get("allow_catch_all") else 0)
    return out


def _safe_check(verifier: MillionVerifier, email: str) -> str | None:
    try:
        return verifier.check(email)
    except Exception as exc:
        log.warning("Verify failed for %s: %s", email, exc)
        return None


def passing_statuses(cfg: Config) -> tuple[str, ...]:
    return ("valid", "catch_all") if cfg.section("verify").get("allow_catch_all") else ("valid",)
