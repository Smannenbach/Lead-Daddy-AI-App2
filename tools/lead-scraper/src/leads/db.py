"""SQLite storage. One file, created on first use."""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    niche TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,               -- the business's listed phone from Google Maps
    website TEXT NOT NULL,
    domain TEXT NOT NULL,     -- normalized website domain, used for dedupe
    google_place_id TEXT UNIQUE,
    rating REAL,
    review_count INTEGER,
    source TEXT NOT NULL,
    scraped_at TEXT NOT NULL,
    crawled_at TEXT,          -- when Phase 3 last crawled the site
    crawl_error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_domain ON businesses(domain);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    email TEXT NOT NULL,
    email_source TEXT,        -- mailto, page_text, obfuscated, plus ":webmail" when free webmail
    verification_status TEXT, -- valid, invalid, catch_all, unknown (NULL until checked)
    verified_at TEXT,
    UNIQUE(business_id, email)
);
CREATE INDEX IF NOT EXISTS contacts_email ON contacts(email);

CREATE TABLE IF NOT EXISTS personalization (
    id INTEGER PRIMARY KEY,
    contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id),
    first_line TEXT NOT NULL,
    model TEXT NOT NULL,      -- the Claude model, or "fallback" when no API call was made
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    phase TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    records_in INTEGER NOT NULL DEFAULT 0,
    records_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suppression (
    email TEXT PRIMARY KEY,
    reason TEXT,
    added_at TEXT NOT NULL
);

-- Each Maps search that finished, so a rerun never pays for it twice.
CREATE TABLE IF NOT EXISTS searches (
    provider TEXT NOT NULL,
    query TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    max_results INTEGER NOT NULL,
    results INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    finished_at TEXT NOT NULL,
    PRIMARY KEY (provider, query, city, state, max_results)
);

-- Clean page text saved during the crawl, reused by Phase 5 so sites are fetched once.
CREATE TABLE IF NOT EXISTS pages (
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    url TEXT NOT NULL,
    kind TEXT NOT NULL,       -- home, about, contact, team
    text TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (business_id, url)
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str | os.PathLike[str] | None = None) -> sqlite3.Connection:
    """Open (and create if needed) the database. ':memory:' works for tests."""
    db_path = str(path or os.environ.get("LEADS_DB_PATH", "leads.db"))
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if db_path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    return conn
