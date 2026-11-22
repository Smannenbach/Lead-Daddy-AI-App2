"""Website and email domain helpers."""
from __future__ import annotations

from urllib.parse import urlparse

# Two-part public suffixes we might see. Most targets are .com/.net/.law in the US.
_TWO_PART_SUFFIXES = {"co.uk", "com.au", "co.nz", "com.mx", "co.za"}

FREE_WEBMAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com",
    "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "comcast.net",
    "att.net", "sbcglobal.net", "cox.net", "verizon.net", "protonmail.com", "proton.me",
    "gmx.com", "zoho.com", "mail.com",
}


def normalize_url(url: str) -> str:
    """Give a bare domain a scheme so it can be fetched."""
    url = url.strip()
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    return url


def clean_website(url: str) -> str:
    """Drop tracking tags and fragments: '...com/office?utm_source=yext#x' -> '...com/office'."""
    url = normalize_url(url)
    return url.split("#", 1)[0].split("?", 1)[0] if url else ""


def site_domain(url: str) -> str:
    """'https://www.SmithLaw.com/contact?x=1' -> 'smithlaw.com'."""
    host = urlparse(normalize_url(url)).hostname or ""
    host = host.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def registrable(host: str) -> str:
    """Reduce a host to its registrable domain: 'mail.smithlaw.com' -> 'smithlaw.com'."""
    parts = host.lower().strip(".").split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in _TWO_PART_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


def is_free_webmail(email: str) -> bool:
    return email_domain(email) in FREE_WEBMAIL


def same_org(email: str, website_domain: str) -> bool:
    """True when the email is on the business's own domain (subdomains count)."""
    return registrable(email_domain(email)) == registrable(website_domain)
