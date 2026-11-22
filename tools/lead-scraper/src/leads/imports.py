"""Load businesses or suppressions from CSV files instead of paid searches."""
from __future__ import annotations

import csv
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from leads.extract import EMAIL_RE
from leads.find import save_place
from leads.maps import Place, _float, _int

# Accepted header names for each field, lowercased with spaces and underscores removed.
_ALIASES = {
    "name": {"name", "businessname", "company", "companyname", "firm", "firmname", "title"},
    "website": {"website", "site", "url", "web", "domain", "homepage"},
    "niche": {"niche", "category", "industry", "type", "practicearea"},
    "address": {"address", "streetaddress", "fulladdress", "street"},
    "city": {"city", "town"},
    "state": {"state", "statecode", "province"},
    "zip": {"zip", "zipcode", "postalcode", "postcode"},
    "phone": {"phone", "phonenumber", "businessphone", "telephone"},
    "rating": {"rating", "stars"},
    "review_count": {"reviews", "reviewcount", "numberofreviews"},
}


def _key(header: str) -> str:
    return header.lower().replace(" ", "").replace("_", "").replace("-", "")


def _columns(headers: list[str]) -> dict[str, str]:
    """Map our field names to the file's actual header names."""
    out = {}
    for h in headers:
        for field, names in _ALIASES.items():
            if _key(h) in names and field not in out:
                out[field] = h
    return out


@dataclass
class ImportResult:
    rows: int = 0
    saved: int = 0
    duplicates: int = 0
    no_website: int = 0
    skipped: int = 0  # missing a name or a niche


def import_businesses(conn: sqlite3.Connection, path: Path, niche: str | None = None) -> ImportResult:
    """Add businesses from a CSV. Needs name and website columns, plus niche (column or --niche).

    Rows go through the same dedupe as Maps results (website domain), so importing the
    same file twice does nothing the second time.
    """
    out = ImportResult()
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        cols = _columns(reader.fieldnames or [])
        if "name" not in cols or "website" not in cols:
            raise ValueError(f"{path.name} needs a name column and a website column. Found: {', '.join(reader.fieldnames or [])}")
        if "niche" not in cols and not niche:
            raise ValueError(f"{path.name} has no niche column. Pass --niche.")
        get = lambda row, f: (row.get(cols[f]) or "").strip() if f in cols else ""  # noqa: E731
        for row in reader:
            out.rows += 1
            row_niche = niche or get(row, "niche")
            if not get(row, "name") or not row_niche:
                out.skipped += 1
                continue
            place = Place(
                name=get(row, "name"), address=get(row, "address") or None, city=get(row, "city") or None,
                state=get(row, "state") or None, zip=get(row, "zip") or None, phone=get(row, "phone") or None,
                website=get(row, "website") or None, place_id=None,
                rating=_float(get(row, "rating")), review_count=_int(get(row, "review_count")),
            )
            outcome = save_place(conn, place, row_niche, f"csv:{path.name}")
            if outcome == "saved":
                out.saved += 1
            elif outcome == "no_website":
                out.no_website += 1
            else:
                out.duplicates += 1
    conn.commit()
    return out


def emails_in_file(path: Path) -> list[str]:
    """Every email address in a CSV or plain text file, from any column.

    Works with Instantly and Smartlead unsubscribe or bounce exports without knowing
    their exact column names.
    """
    found: dict[str, None] = {}
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    for m in EMAIL_RE.finditer(text):
        found.setdefault(m.group(0).lower(), None)
    return list(found)
