"""Run logging and daily spend caps.

Every paid call goes through `Run.charge`. Before a call, `Run.ensure_budget` checks that
today's spend for the phase plus the expected cost stays under the cap from config.yaml.
If it wouldn't, it raises `CapReached` and the phase stops cleanly.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from leads.db import now


class CapReached(RuntimeError):
    def __init__(self, phase: str, spent: float, cap: float) -> None:
        super().__init__(
            f"Daily cap reached for {phase}: ${spent:.4f} spent of ${cap:.2f}. "
            "Raise daily_caps_usd in config.yaml or run again tomorrow."
        )
        self.phase = phase


def spent_today(conn: sqlite3.Connection, phase: str) -> float:
    """Total logged spend for a phase since midnight UTC."""
    day = datetime.now(timezone.utc).date().isoformat()
    row = conn.execute(
        "SELECT COALESCE(SUM(cost_usd), 0) FROM runs WHERE phase = ? AND substr(started_at, 1, 10) = ?",
        (phase, day),
    ).fetchone()
    return float(row[0])


class Run:
    """One row in `runs`. Use as a context manager so it always gets a finish time."""

    def __init__(self, conn: sqlite3.Connection, phase: str, cap_usd: float | None = None) -> None:
        self.conn = conn
        self.phase = phase
        self.cap = cap_usd
        self.records_in = 0
        self.records_out = 0
        self.errors = 0
        self.cost = 0.0
        cur = conn.execute("INSERT INTO runs (phase, started_at) VALUES (?, ?)", (phase, now()))
        self.id = int(cur.lastrowid or 0)
        conn.commit()

    def ensure_budget(self, expected_usd: float) -> None:
        if self.cap is None:
            return
        spent = spent_today(self.conn, self.phase)
        if spent + expected_usd > self.cap + 1e-9:
            raise CapReached(self.phase, spent, self.cap)

    def charge(self, usd: float) -> None:
        """Log money spent. Saved right away so a crash still counts it."""
        self.cost += usd
        self.conn.execute("UPDATE runs SET cost_usd = ? WHERE id = ?", (self.cost, self.id))
        self.conn.commit()

    def finish(self) -> None:
        self.conn.execute(
            "UPDATE runs SET finished_at = ?, records_in = ?, records_out = ?, cost_usd = ?, errors = ? WHERE id = ?",
            (now(), self.records_in, self.records_out, self.cost, self.errors, self.id),
        )
        self.conn.commit()

    def __enter__(self) -> "Run":
        return self

    def __exit__(self, *exc: object) -> None:
        self.finish()
