"""Pull emails, people and clean text out of web pages, then pick the best emails."""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from urllib.parse import unquote

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from leads.domains import is_free_webmail, same_org

EMAIL_RE = re.compile(r"(?<![\w.+-])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}(?![\w-])")

# "name [at] domain [dot] com", "name(at)domain(dot)com", "name AT domain DOT com".
_AT = r"\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|<\s*at\s*>|\s+at\s+)\s*"
_DOT = r"\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|<\s*dot\s*>|\s+dot\s+|\.)\s*"
OBFUSCATED_RE = re.compile(
    rf"(?<![\w.])([A-Za-z0-9][A-Za-z0-9._%+-]{{0,63}}){_AT}([A-Za-z0-9-]+(?:{_DOT}[A-Za-z0-9-]+)*{_DOT}(?:com|net|org|law|legal|us|biz|info|co|pro|cpa|io|attorney|lawyer))\b",
    re.IGNORECASE,
)
_DOT_TOKEN_RE = re.compile(_DOT, re.IGNORECASE)

# Things that look like emails but aren't (image names, tracking, placeholders).
_JUNK_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")
_JUNK_DOMAINS = {"sentry.io", "wixpress.com", "example.com", "domain.com", "email.com", "yourdomain.com", "sentry-next.wixpress.com"}
_JUNK_LOCALS = {"name", "email", "user", "username", "your", "yourname", "you", "firstname", "first.last"}

ROLE_LOCALS = {
    "info", "office", "contact", "contactus", "hello", "hi", "admin", "mail", "email", "inquiries", "inquiry",
    "intake", "reception", "frontdesk", "front.desk", "team", "sales", "service", "services", "help", "support",
    "law", "legal", "firm", "attorneys", "lawyers", "staff", "general", "estimates", "estimate", "quotes", "quote",
    "schedule", "appointments", "booking", "clients", "newclients", "consult", "consultation", "marketing",
}
# Never send to these, even if they're the only address on the site.
BLOCKED_LOCALS = {
    "noreply", "no-reply", "donotreply", "do-not-reply", "careers", "jobs", "hr", "hiring", "recruiting", "billing",
    "accounting", "payments", "invoices", "privacy", "webmaster", "postmaster", "abuse", "security", "unsubscribe",
    "dmca", "legalnotices", "press", "media",
}

TITLE_WORDS = (
    "attorney", "partner", "founder", "co-founder", "owner", "president", "principal", "managing",
    "associate", "of counsel", "counsel", "cpa", "director", "ceo", "lawyer", "esq", "paralegal",
    "accountant", "enrolled agent", "general manager", "project manager", "estimator", "vice president",
)
_NAME_RE = re.compile(r"^(?:(?:Mr|Ms|Mrs|Dr)\.?\s+)?([A-Z][a-zA-Z'’]+)(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-zA-Z'’]+)?\s+([A-Z][a-zA-Z'’-]+)(?:,?\s+(?:Jr\.?|Sr\.?|II|III|Esq\.?|CPA|J\.D\.?))*$")
_NOT_NAMES = {
    "Our", "The", "About", "Contact", "Meet", "Family", "Estate", "Law", "Firm", "Group", "Home", "Practice", "Areas",
    "Free", "Call", "Read", "More", "Learn", "View", "Get", "Book", "Schedule", "Phoenix", "Arizona", "Scottsdale",
    "Services", "Team", "Attorneys", "Office", "Pool", "Roofing", "Tax", "Planning", "Elder", "Probate", "Client",
}


@dataclass
class FoundEmail:
    email: str
    source: str  # mailto, page_text or obfuscated


@dataclass
class Person:
    first_name: str
    last_name: str
    title: str | None = None


@dataclass
class PageData:
    emails: list[FoundEmail] = field(default_factory=list)
    people: list[Person] = field(default_factory=list)
    text: str = ""
    links: list[str] = field(default_factory=list)


def deobfuscate(text: str) -> list[str]:
    """Turn 'jane [at] smithlaw [dot] com' style text into real addresses."""
    out = []
    for m in OBFUSCATED_RE.finditer(text):
        local, domain = m.group(1), _DOT_TOKEN_RE.sub(".", m.group(2))
        out.append(f"{local}@{domain}".lower())
    return out


def clean_email(raw: str) -> str | None:
    email = unquote(raw).strip().strip(".,;:()[]<>\"'").lower()
    email = email.split("?", 1)[0]
    if not EMAIL_RE.fullmatch(email):
        return None
    local, domain = email.rsplit("@", 1)
    if email.endswith(_JUNK_SUFFIXES) or domain in _JUNK_DOMAINS or local in _JUNK_LOCALS:
        return None
    if re.search(r"@\d+x\.", email):  # logo@2x.png style
        return None
    return email


def extract_emails(html_text: str) -> list[FoundEmail]:
    """Emails from mailto links, visible text and simple obfuscations, deduped in that order."""
    tree = HTMLParser(html_text)
    seen: dict[str, FoundEmail] = {}

    def add(raw: str, source: str) -> None:
        email = clean_email(raw)
        if email and email not in seen:
            seen[email] = FoundEmail(email, source)

    for a in tree.css("a[href]"):
        href = a.attributes.get("href") or ""
        if href.lower().startswith("mailto:"):
            for part in href[7:].split(","):
                add(part, "mailto")
    text = page_text(tree, keep_all=True)
    for m in EMAIL_RE.finditer(text):
        add(m.group(0), "page_text")
    # Raw HTML too: some sites put emails in data attributes or JSON-LD.
    for m in EMAIL_RE.finditer(html.unescape(html_text)):
        add(m.group(0), "page_text")
    for email in deobfuscate(text):
        add(email, "obfuscated")
    return list(seen.values())


def page_text(tree: HTMLParser, keep_all: bool = False) -> str:
    """Readable text. Drops scripts and styles, and (unless keep_all) nav, header and footer."""
    for sel in ["script", "style", "noscript", "svg", "template"] + ([] if keep_all else ["nav", "header", "footer", "form"]):
        for node in tree.css(sel):
            node.decompose()
    body = tree.body or tree.root
    text = body.text(separator="\n") if body else ""
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def extract_people(text: str) -> list[Person]:
    """Find 'Jane Smith' followed by a title like 'Managing Partner' on the same or next line."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    people: dict[tuple[str, str], Person] = {}
    for i, line in enumerate(lines):
        # "Jane Smith, Managing Partner" / "Jane Smith | Attorney"
        parts = re.split(r"\s*[,|–—]\s*|\s+-\s+", line, maxsplit=1)
        name_part, rest = parts[0], (parts[1] if len(parts) > 1 else "")
        if len(name_part) > 40:
            continue
        m = _NAME_RE.match(name_part)
        if not m:
            continue
        first, last = m.group(1), m.group(2)
        if first in _NOT_NAMES or last in _NOT_NAMES:
            continue
        title = _title_in(rest) or (_title_in(lines[i + 1]) if i + 1 < len(lines) and len(lines[i + 1]) <= 60 else None)
        if not title and not re.search(r"\b(Esq\.?|CPA)\b", line):
            continue
        key = (first.lower(), last.lower())
        if key not in people:
            people[key] = Person(first, last, title or ("CPA" if "CPA" in line else "Attorney"))
    return list(people.values())


def _title_in(text: str) -> str | None:
    low = text.lower()
    if len(text) > 60 or not any(w in low for w in TITLE_WORDS):
        return None
    return text.strip(" ,|-–—")


def parse_page(html_text: str) -> PageData:
    tree = HTMLParser(html_text)
    links = [a.attributes.get("href") or "" for a in tree.css("a[href]")]
    emails = extract_emails(html_text)
    text_all = page_text(HTMLParser(html_text), keep_all=True)
    return PageData(
        emails=emails,
        people=extract_people(text_all),
        text=page_text(HTMLParser(html_text)),
        links=[l for l in links if l],
    )


@dataclass
class RankedEmail:
    email: str
    source: str
    score: int
    person: Person | None
    webmail: bool


def match_person(email: str, people: list[Person]) -> Person | None:
    """Match 'jsmith@', 'jane@', 'jane.smith@' or 'smith@' to a person on the site."""
    local = re.sub(r"[^a-z]", "", email.split("@", 1)[0].lower())
    for p in people:
        f, l = p.first_name.lower(), re.sub(r"[^a-z]", "", p.last_name.lower())
        if local in {f, l, f + l, f[0] + l, f + l[0], l + f, l + f[0]} or (len(l) > 3 and l in local and (f in local or local.startswith(f[0]))):
            return p
    return None


def rank_emails(found: list[FoundEmail], website_domain: str, people: list[Person], keep: int = 2) -> list[RankedEmail]:
    """Keep the best one or two addresses for a business.

    Own-domain only. Free webmail is used only when the site has no own-domain address,
    and is flagged. Blocked roles (noreply, careers, billing...) are dropped.
    Score: named person on the team page 3, other personal-looking address 2, role address 1.
    """
    own, webmail = [], []
    for f in found:
        local = f.email.split("@", 1)[0]
        if local in BLOCKED_LOCALS:
            continue
        if same_org(f.email, website_domain):
            own.append(f)
        elif is_free_webmail(f.email):
            webmail.append(f)
        # Emails on someone else's domain (web designers, bar associations) are dropped.
    pool, is_webmail = (own, False) if own else (webmail, True)
    ranked = []
    for f in pool:
        local = f.email.split("@", 1)[0]
        person = match_person(f.email, people)
        if person:
            score = 3
        elif local in ROLE_LOCALS or any(local.startswith(r) for r in ("info", "contact", "office")):
            score = 1
        else:
            score = 2
        ranked.append(RankedEmail(f.email, f.source, score, person, is_webmail))
    # Stable sort keeps page order for ties (mailto links come first).
    ranked.sort(key=lambda r: -r.score)
    return ranked[:keep]
