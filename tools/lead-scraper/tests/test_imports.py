from pathlib import Path

import pytest

from leads.estimate import estimate
from leads.extract import decode_cfemail, extract_emails
from leads.imports import emails_in_file, import_businesses


def cf_encode(email: str, key: int = 0x42) -> str:
    return f"{key:02x}" + "".join(f"{ord(c) ^ key:02x}" for c in email)


def test_cloudflare_protected_emails_are_decoded():
    enc = cf_encode("jane@smithlaw.com")
    assert decode_cfemail(enc) == "jane@smithlaw.com"
    assert decode_cfemail("zz") is None
    html = (
        f'<a href="/cdn-cgi/l/email-protection#{cf_encode("office@smithlaw.com", 0x13)}">[email&#160;protected]</a>'
        f'<span class="__cf_email__" data-cfemail="{enc}">[email&#160;protected]</span>'
    )
    found = {f.email: f.source for f in extract_emails(html)}
    assert found == {"office@smithlaw.com": "cloudflare", "jane@smithlaw.com": "cloudflare"}


def write(tmp_path: Path, name: str, text: str) -> Path:
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return p


def test_import_businesses_maps_headers_and_dedupes(conn, tmp_path):
    f = write(tmp_path, "bar.csv",
              "Firm Name,Website,City,State,Phone Number\n"
              "Smith Law,https://www.smithlaw.com,Phoenix,AZ,602-555-0100\n"
              "Smith Law PLLC,smithlaw.com/about,Phoenix,AZ,\n"
              "No Site Firm,,Mesa,AZ,\n"
              ",desertlaw.com,Tempe,AZ,\n")
    r = import_businesses(conn, f, niche="family law attorney")
    assert (r.rows, r.saved, r.duplicates, r.no_website, r.skipped) == (4, 1, 1, 1, 1)
    row = conn.execute("SELECT name, niche, domain, city, source FROM businesses").fetchone()
    assert tuple(row) == ("Smith Law", "family law attorney", "smithlaw.com", "Phoenix", "csv:bar.csv")
    assert import_businesses(conn, f, niche="family law attorney").saved == 0


def test_import_needs_name_website_and_niche(conn, tmp_path):
    with pytest.raises(ValueError, match="website column"):
        import_businesses(conn, write(tmp_path, "a.csv", "name,city\nX,Phoenix\n"))
    with pytest.raises(ValueError, match="--niche"):
        import_businesses(conn, write(tmp_path, "b.csv", "name,website\nX,x.com\n"))
    r = import_businesses(conn, write(tmp_path, "c.csv", "Company,URL,Category\nDesert CPA,desertcpa.com,CPA\n"))
    assert r.saved == 1
    assert conn.execute("SELECT niche FROM businesses").fetchone()[0] == "CPA"


def test_emails_in_any_export_format(tmp_path):
    f = write(tmp_path, "unsubs.csv", "Lead Email,Status,Date\nJane@SmithLaw.com,unsubscribed,2026-11-01\nbob@desertcpa.com,bounced,\njane@smithlaw.com,dup,\n")
    assert emails_in_file(f) == ["jane@smithlaw.com", "bob@desertcpa.com"]


def test_estimate_counts_pending_work(conn, cfg):
    conn.execute("INSERT INTO searches VALUES ('outscraper', 'family law attorney', 'Phoenix', 'AZ', 20, 20, 0.06, 'now')")
    cfg.raw["niches"] = ["family law attorney", "CPA"]
    est = {e.phase: e for e in estimate(conn, cfg)}
    assert est["find"].units == 20  # one search left, 20 places max
    assert est["find"].max_usd == pytest.approx(20 * cfg.price("outscraper_per_place"))
    assert est["verify"].units == 0 and est["personalize"].max_usd == 0
