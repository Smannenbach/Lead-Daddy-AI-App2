"""The `leads` command line."""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import typer

from leads.config import Config, MissingSecret, load_config
from leads.costs import CapReached
from leads.db import connect

app = typer.Typer(help="Lead Daddy lead pipeline. Builds lists only; it never sends email.", no_args_is_help=True)

ConfigOpt = typer.Option(None, "--config", help="Path to config.yaml.")
DbOpt = typer.Option(None, "--db", help="Path to the SQLite file (default leads.db).")


def _setup(config: Optional[Path], db: Optional[Path]):
    cfg = load_config(config)
    logs = cfg.base_dir / "logs"
    logs.mkdir(exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[logging.FileHandler(logs / f"leads_{datetime.now():%Y%m%d}.log"), logging.StreamHandler()],
    )
    # httpx logs full request URLs at INFO, and MillionVerifier's key rides in the URL.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    conn = connect(db or (cfg.base_dir / "leads.db"))
    return cfg, conn


def _guard(fn):
    try:
        return fn()
    except MissingSecret as exc:
        typer.secho(str(exc), fg=typer.colors.RED)
        raise typer.Exit(2)
    except CapReached as exc:
        typer.secho(str(exc), fg=typer.colors.YELLOW)
        raise typer.Exit(3)


@app.command()
def find(
    niche: Optional[list[str]] = typer.Option(None, "--niche", help="Only this niche. Repeat for more."),
    max_results: Optional[int] = typer.Option(None, "--max-results", help="Override max_results_per_search."),
    city: Optional[str] = typer.Option(None, "--city", help="Only this city from config."),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Phase 2: find businesses on Google Maps."""
    from leads.find import run_find
    from leads.maps import provider_for

    cfg, conn = _setup(config, db)
    if city:
        cfg.raw["locations"] = [l for l in cfg.raw.get("locations", []) if l["city"].lower() == city.lower()]
    r = _guard(lambda: run_find(conn, cfg, provider_for(cfg), niche, max_results))
    typer.echo(f"Searches run: {r.searches_run} (skipped, already done: {r.searches_skipped})")
    typer.echo(f"Places seen: {r.places_seen}  Saved: {r.saved}  No website: {r.no_website}  Duplicates: {r.duplicates}")


@app.command()
def emails(
    limit: Optional[int] = typer.Option(None, help="Crawl at most this many sites."),
    recrawl: bool = typer.Option(False, help="Crawl sites again even if done before."),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Phase 3: crawl business sites for emails and names."""
    from leads.crawl import run_emails

    cfg, conn = _setup(config, db)
    r = run_emails(conn, cfg, limit, recrawl)
    typer.echo(f"Sites crawled: {r.sites}  Failed: {r.sites_failed}  Contacts added: {r.contacts_added}")


@app.command()
def verify(
    limit: Optional[int] = typer.Option(None, help="Verify at most this many emails."),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Phase 4: verify new emails with MillionVerifier."""
    from leads.verify import run_verify

    cfg, conn = _setup(config, db)
    r = _guard(lambda: run_verify(conn, cfg, limit=limit))
    typer.echo(f"Checked: {r.checked}  Reused (checked in last 90 days): {r.reused}  Errors: {r.errors}")
    typer.echo(f"Valid: {r.valid}  Catch all: {r.catch_all}  Invalid: {r.invalid}  Unknown: {r.unknown}")
    if r.stopped_by_cap:
        typer.secho("Stopped early: daily verify cap reached.", fg=typer.colors.YELLOW)


@app.command()
def personalize(
    limit: Optional[int] = typer.Option(None, help="Write at most this many lines."),
    batch: Optional[bool] = typer.Option(None, "--batch/--no-batch", help="Force the Batches API on or off."),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Phase 5: write a personalized first line for each verified contact."""
    from leads.personalize import run_personalize

    cfg, conn = _setup(config, db)
    r = _guard(lambda: run_personalize(conn, cfg, limit=limit, force_batch=batch))
    typer.echo(f"Written by Claude: {r.written}  Fallback lines: {r.fallbacks}  Errors: {r.errors}")
    typer.echo(f"Cost: ${r.cost_usd:.5f}{'  (Batches API, half price)' if r.used_batch else ''}")
    if r.stopped_by_cap:
        typer.secho("Stopped early: daily personalize cap reached.", fg=typer.colors.YELLOW)


@app.command()
def export(
    niche: Optional[str] = typer.Option(None, "--niche", help='Only this niche, e.g. "family law".'),
    fmt: str = typer.Option("instantly", "--format", help="instantly or smartlead."),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Phase 6: export CSVs, one per niche, minus suppressed emails."""
    from leads.export import run_export

    cfg, conn = _setup(config, db)
    files = run_export(conn, cfg, niche, fmt)
    if not files:
        typer.echo("Nothing to export yet. Leads need to be verified and personalized first.")
    for f in files:
        typer.echo(f"Wrote {f.rows} leads to {f.path}")
    _print_stats(cfg, conn)


@app.command("run-all")
def run_all(
    max_results: Optional[int] = typer.Option(None, "--max-results", help="Override max_results_per_search."),
    niche: Optional[list[str]] = typer.Option(None, "--niche", help="Only this niche. Repeat for more."),
    city: Optional[str] = typer.Option(None, "--city", help="Only this city from config."),
    fmt: str = typer.Option("instantly", "--format", help="instantly or smartlead."),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Run every phase in order: find, emails, verify, personalize, export."""
    find(niche, max_results, city, config, db)
    emails(None, False, config, db)
    verify(None, config, db)
    personalize(None, None, config, db)
    export(niche[0] if niche and len(niche) == 1 else None, fmt, config, db)


@app.command("stats")
def stats_cmd(config: Optional[Path] = ConfigOpt, db: Optional[Path] = DbOpt) -> None:
    """Show counts and spend."""
    cfg, conn = _setup(config, db)
    _print_stats(cfg, conn)


@app.command()
def suppress(
    email: str = typer.Argument(..., help="Email to never export again."),
    reason: Optional[str] = typer.Option(None, "--reason"),
    config: Optional[Path] = ConfigOpt,
    db: Optional[Path] = DbOpt,
) -> None:
    """Add an email to the suppression list."""
    from leads.export import add_suppression

    cfg, conn = _setup(config, db)
    add_suppression(conn, email, reason)
    typer.echo(f"Suppressed {email.strip().lower()}")


def _print_stats(cfg: Config, conn) -> None:
    from leads.export import stats

    s = stats(conn, cfg)
    typer.echo("")
    typer.echo(f"Businesses found:   {s.businesses} (crawled {s.crawled})")
    typer.echo(f"Emails found:       {s.emails_found}")
    typer.echo(f"Verified:           {s.verified}")
    typer.echo(f"Personalized:       {s.personalized}")
    typer.echo(f"Suppressed:         {s.suppressed}")
    typer.echo(f"Ready to export:    {s.exportable}")
    for phase, usd in sorted(s.spend.items()):
        typer.echo(f"Spend, {phase:<12}${usd:.4f}")
    typer.echo(f"Total spend:        ${s.total_cost:.4f}")
    cpl = s.cost_per_lead
    typer.echo(f"Cost per finished lead: {'n/a' if cpl is None else f'${cpl:.4f}'}")


if __name__ == "__main__":
    app()
