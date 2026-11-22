"""Phase 5: write one personalized opening line per verified contact with Claude.

The instruction block is identical on every call and marked for prompt caching, so after
the first call it bills at the cache read rate. Thin sites skip the API and get a niche
fallback line. Fifty or more lines go through the Message Batches API at half price.
"""
from __future__ import annotations

import logging
import re
import sqlite3
import time
from dataclasses import dataclass
from typing import Any

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

from leads.config import Config
from leads.costs import CapReached, Run
from leads.db import now
from leads.verify import passing_statuses

log = logging.getLogger(__name__)

# Kept stable byte for byte so the cache hits. Claude Haiku 5.5 caches prefixes of 512+ tokens,
# so the guidance is written out in full rather than trimmed.
INSTRUCTIONS = """You write the first line of a cold email from a mortgage professional to a local business owner or professional.

The reader is one of these: a family law attorney, a probate or estate planning attorney, an elder law attorney, a CPA, a home remodeler, a roofer, or a pool builder. These people often see a client's home equity question before a lender does, which is why the sender is reaching out. Do not say that in the line. The line only needs to show the sender actually looked at their business.

You get the business name, its city, its niche, and up to 1,500 characters of text from its own website.

Write exactly one opening line that follows every rule below.
1. Reference one specific, real detail from the website text: a practice focus, a service they emphasize, how long they've served the area, a community they serve, a type of project they're known for, or how they describe their approach. Only use details that appear in the text. Never invent awards, years, numbers, names, reviews, or results.
2. Under 25 words. One sentence.
3. Sound like a person who skimmed their site, not a marketer. Plain words. Casual and respectful.
4. No flattery words. Never use: impressive, amazing, incredible, outstanding, exceptional, remarkable, fantastic, awesome, stellar, top notch, world class, love, admire, inspiring.
5. No dashes of any kind. No hyphen used as punctuation, no en dash, no em dash. Rewrite the sentence instead.
6. Never mention AI, automation, scraping, or that you read their website "text". Saying you saw something on their site is fine.
7. No questions, no greeting, no name, no sign off, no emojis, no quotation marks, no hashtags.
8. Don't pitch. Don't mention mortgages, loans, rates, or referrals.
9. Don't claim a relationship, a past conversation, or a mutual contact.
10. Don't compare them to other businesses or make claims about their market. Stick to what their own site says.

If the website text is too thin, generic, or unrelated to give one real specific detail (for example only a cookie notice, a login page, a parked domain, or a list of links), reply with exactly: THIN

Reply with only the line, or THIN. Nothing else.

Good examples:
Saw that your firm handles both divorce and post decree modifications for families in Mesa.
Noticed you design every pool in house instead of handing the plans off to someone else.
Your page on trust administration for heirs who live out of state was a clear read.

Bad examples and why:
I was so impressed by your amazing work! (flattery, exclamation, nothing specific)
As an AI, I reviewed your site and loved it. (mentions AI, flattery)
Your firm, founded in 1987 and winner of 12 awards, is great. (invented facts)
Quick question about your clients' home equity? (question, pitch)
"""

FLATTERY = re.compile(r"\b(impressive|amazing|incredible|outstanding|exceptional|remarkable|fantastic|awesome|stellar|world class|top notch|admire|inspiring)\b", re.I)
DASHES = re.compile(r"[‒–—―]|\s-\s|--")
AI_WORDS = re.compile(r"\b(AI|artificial intelligence|chatgpt|claude|language model|automated)\b", re.I)

# Used when a site is too thin to personalize. Matched on the business's niche.
# Deliberately plain: they make no claims about the sender or the reader.
FALLBACKS: list[tuple[str, str]] = [
    ("family law", "Came across your family law practice while looking at offices in {city} and wanted to reach out."),
    ("probate", "Came across your probate practice while looking at offices in {city} and wanted to reach out."),
    ("estate", "Came across your estate planning practice while looking at offices in {city} and wanted to reach out."),
    ("elder law", "Came across your elder law practice while looking at offices in {city} and wanted to reach out."),
    ("cpa", "Came across your CPA firm while looking at offices in {city} and wanted to reach out."),
    ("account", "Came across your accounting firm while looking at offices in {city} and wanted to reach out."),
    ("remodel", "Came across your remodeling company while looking at local builders in {city} and wanted to reach out."),
    ("roof", "Came across your roofing company while looking at local contractors in {city} and wanted to reach out."),
    ("pool", "Came across your pool company while looking at local builders in {city} and wanted to reach out."),
]
GENERIC_FALLBACK = "Came across your business while looking at local companies in {city} and wanted to reach out."


def fallback_line(niche: str, city: str | None) -> str:
    n = niche.lower()
    for key, line in FALLBACKS:
        if key in n:
            return line.format(city=city or "the Valley")
    return GENERIC_FALLBACK.format(city=city or "the Valley")


def clean_line(text: str, max_words: int) -> str | None:
    """Return the line if it passes every rule, otherwise None (the caller falls back)."""
    line = text.strip().strip('"“”').strip()
    line = line.splitlines()[0].strip() if line else ""
    if not line or line.upper().startswith("THIN"):
        return None
    if len(line.split()) > max_words or "?" in line or "!" in line:
        return None
    if FLATTERY.search(line) or DASHES.search(line) or AI_WORDS.search(line):
        return None
    return line


def site_text(conn: sqlite3.Connection, business_id: int, max_chars: int) -> str:
    """Homepage first, then about page, trimmed to max_chars."""
    rows = conn.execute(
        """SELECT text FROM pages WHERE business_id = ? AND kind IN ('home', 'about')
           ORDER BY CASE kind WHEN 'home' THEN 0 ELSE 1 END, url""",
        (business_id,),
    ).fetchall()
    text = "\n".join(r[0] for r in rows)
    return text[:max_chars]


def user_prompt(name: str, city: str | None, niche: str, text: str) -> str:
    return f"Business: {name}\nCity: {city or 'unknown'}\nNiche: {niche}\n\nWebsite text:\n{text}"


def request_params(model: str, prompt: str) -> dict[str, Any]:
    return {
        "model": model,
        "max_tokens": 200,
        # Short fixed output, so keep thinking off and effort low to keep cost down.
        "thinking": {"type": "disabled"},
        "output_config": {"effort": "low"},
        "system": [{"type": "text", "text": INSTRUCTIONS, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": prompt}],
    }


def usage_cost(cfg: Config, usage: Any, batch: bool = False) -> float:
    def n(attr: str) -> int:
        return int(getattr(usage, attr, 0) or 0)

    usd = (
        n("input_tokens") * cfg.price("claude_input_per_mtok")
        + n("output_tokens") * cfg.price("claude_output_per_mtok")
        + n("cache_creation_input_tokens") * cfg.price("claude_cache_write_per_mtok")
        + n("cache_read_input_tokens") * cfg.price("claude_cache_read_per_mtok")
    ) / 1_000_000
    return usd * (cfg.price("claude_batch_discount") if batch else 1.0)


def text_of(message: Any) -> str:
    return "".join(b.text for b in message.content if getattr(b, "type", "") == "text")


@dataclass
class PersonalizeResult:
    written: int = 0
    fallbacks: int = 0
    errors: int = 0
    cost_usd: float = 0.0
    used_batch: bool = False
    stopped_by_cap: bool = False


def _save(conn: sqlite3.Connection, contact_id: int, line: str, model: str, cost: float) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO personalization (contact_id, first_line, model, cost_usd, created_at) VALUES (?, ?, ?, ?, ?)",
        (contact_id, line, model, cost, now()),
    )


def run_personalize(conn: sqlite3.Connection, cfg: Config, client: anthropic.Anthropic | None = None,
                    limit: int | None = None, force_batch: bool | None = None) -> PersonalizeResult:
    p = cfg.section("personalize")
    model = str(p.get("model", "claude-haiku-5-5"))
    max_chars, min_chars = int(p.get("max_site_chars", 1500)), int(p.get("min_site_chars", 200))
    max_words = int(p.get("max_words", 25))
    statuses = passing_statuses(cfg)
    sql = f"""SELECT c.id AS contact_id, b.id AS business_id, b.name, b.city, b.niche
              FROM contacts c JOIN businesses b ON b.id = c.business_id
              LEFT JOIN personalization p ON p.contact_id = c.id
              WHERE p.id IS NULL AND c.verification_status IN ({",".join("?" * len(statuses))})
              ORDER BY c.id"""
    if limit:
        sql += f" LIMIT {int(limit)}"
    rows = conn.execute(sql, statuses).fetchall()
    out = PersonalizeResult()

    with Run(conn, "personalize", cfg.cap("personalize")) as run:
        run.records_in = len(rows)
        jobs: list[tuple[sqlite3.Row, str]] = []
        for r in rows:
            text = site_text(conn, r["business_id"], max_chars)
            if len(text) < min_chars:
                _save(conn, r["contact_id"], fallback_line(r["niche"], r["city"]), "fallback", 0.0)
                out.fallbacks += 1
            else:
                jobs.append((r, user_prompt(r["name"], r["city"], r["niche"], text)))
        conn.commit()
        if not jobs:
            run.records_out = out.fallbacks
            return out
        client = client or anthropic.Anthropic()
        use_batch = force_batch if force_batch is not None else len(jobs) >= int(p.get("batch_threshold", 50))
        # Rough upper bound per line for the cap check: ~1,500 input tokens + 60 output.
        per_line = usage_cost(cfg, _Usage(input_tokens=1500, output_tokens=60), batch=use_batch)
        try:
            if use_batch:
                out.used_batch = True
                run.ensure_budget(per_line * len(jobs))
                _run_batch(conn, cfg, client, model, jobs, run, out, max_words, float(p.get("batch_poll_seconds", 20)))
            else:
                for r, prompt in jobs:
                    run.ensure_budget(per_line)
                    _run_one(conn, cfg, client, model, r, prompt, run, out, max_words)
        except CapReached as exc:
            log.warning(str(exc))
            out.stopped_by_cap = True
        run.records_out = out.written + out.fallbacks
        out.cost_usd = run.cost
    return out


@dataclass
class _Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


def _finish_line(conn, cfg, r, raw: str, cost: float, model: str, run: Run, out: PersonalizeResult, max_words: int) -> None:
    run.charge(cost)
    line = clean_line(raw, max_words)
    if line:
        _save(conn, r["contact_id"], line, model, cost)
        out.written += 1
    else:
        # THIN, or the line broke a rule: use the niche fallback, still log what the call cost.
        _save(conn, r["contact_id"], fallback_line(r["niche"], r["city"]), f"fallback ({model})", cost)
        out.fallbacks += 1
    conn.commit()


def _run_one(conn, cfg, client, model, r, prompt, run, out, max_words) -> None:
    try:
        msg = client.messages.create(**request_params(model, prompt))
    except anthropic.RateLimitError:
        time.sleep(10)
        try:
            msg = client.messages.create(**request_params(model, prompt))
        except anthropic.APIError as exc:
            log.warning("Claude call failed for contact %s: %s", r["contact_id"], exc)
            out.errors += 1
            run.errors += 1
            return
    except anthropic.APIStatusError as exc:
        log.warning("Claude call failed for contact %s: %s %s", r["contact_id"], exc.status_code, exc.message)
        out.errors += 1
        run.errors += 1
        return
    except anthropic.APIConnectionError as exc:
        log.warning("Could not reach Claude for contact %s: %s", r["contact_id"], exc)
        out.errors += 1
        run.errors += 1
        return
    raw = text_of(msg) if msg.stop_reason != "refusal" else "THIN"
    _finish_line(conn, cfg, r, raw, usage_cost(cfg, msg.usage), model, run, out, max_words)


def _run_batch(conn, cfg, client, model, jobs, run, out, max_words, poll_seconds) -> None:
    by_id = {f"c{r['contact_id']}": r for r, _ in jobs}
    batch = client.messages.batches.create(
        requests=[
            Request(custom_id=f"c{r['contact_id']}", params=MessageCreateParamsNonStreaming(**request_params(model, prompt)))
            for r, prompt in jobs
        ]
    )
    log.info("Submitted batch %s with %d lines. Waiting for it to finish.", batch.id, len(jobs))
    while client.messages.batches.retrieve(batch.id).processing_status != "ended":
        time.sleep(poll_seconds)
    # Results come back in any order, so match them by custom_id.
    for item in client.messages.batches.results(batch.id):
        r = by_id.get(item.custom_id)
        if r is None:
            continue
        if item.result.type != "succeeded":
            log.warning("Batch line failed for contact %s: %s", r["contact_id"], item.result.type)
            out.errors += 1
            run.errors += 1
            continue
        msg = item.result.message
        raw = text_of(msg) if msg.stop_reason != "refusal" else "THIN"
        _finish_line(conn, cfg, r, raw, usage_cost(cfg, msg.usage, batch=True), model, run, out, max_words)
