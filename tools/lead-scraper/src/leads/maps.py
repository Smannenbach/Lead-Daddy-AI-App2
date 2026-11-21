"""Google Maps business search through Outscraper or Apify.

Both providers return different shapes, so each one is normalized to `Place`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from leads.config import Config, secret


@dataclass
class Place:
    name: str
    address: str | None
    city: str | None
    state: str | None
    zip: str | None
    phone: str | None
    website: str | None
    place_id: str | None
    rating: float | None
    review_count: int | None


class MapsProvider(Protocol):
    name: str

    def price_per_place(self) -> float: ...

    def search(self, query: str, city: str, state: str, limit: int) -> list[Place]: ...


def _float(v: Any) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _int(v: Any) -> int | None:
    f = _float(v)
    return int(f) if f is not None else None


class Outscraper:
    """Outscraper Maps Search v3. Docs: https://app.outscraper.com/api-docs"""

    name = "outscraper"
    URL = "https://api.app.outscraper.com/maps/search-v3"

    def __init__(self, cfg: Config, client: httpx.Client | None = None) -> None:
        self.cfg = cfg
        self.client = client or httpx.Client(timeout=300)

    def price_per_place(self) -> float:
        return self.cfg.price("outscraper_per_place")

    def search(self, query: str, city: str, state: str, limit: int) -> list[Place]:
        resp = self.client.get(
            self.URL,
            params={"query": f"{query}, {city}, {state}, USA", "limit": limit, "async": "false", "language": "en"},
            headers={"X-API-KEY": secret("OUTSCRAPER_API_KEY")},
        )
        resp.raise_for_status()
        data = resp.json().get("data") or []
        # data is a list with one result list per query.
        rows = data[0] if data and isinstance(data[0], list) else data
        return [
            Place(
                name=r.get("name") or "",
                address=r.get("full_address") or r.get("address"),
                city=r.get("city"),
                state=r.get("state_code") or r.get("state"),
                zip=r.get("postal_code"),
                phone=r.get("phone"),
                website=r.get("site") or r.get("website"),
                place_id=r.get("place_id") or r.get("google_id"),
                rating=_float(r.get("rating")),
                review_count=_int(r.get("reviews")),
            )
            for r in rows
            if isinstance(r, dict)
        ]


class Apify:
    """Apify Google Maps Scraper actor (compass/crawler-google-places), run synchronously."""

    name = "apify"
    URL = "https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items"

    def __init__(self, cfg: Config, client: httpx.Client | None = None) -> None:
        self.cfg = cfg
        self.client = client or httpx.Client(timeout=300)

    def price_per_place(self) -> float:
        return self.cfg.price("apify_per_place")

    def search(self, query: str, city: str, state: str, limit: int) -> list[Place]:
        resp = self.client.post(
            self.URL,
            json={
                "searchStringsArray": [query],
                "locationQuery": f"{city}, {state}, USA",
                "maxCrawledPlacesPerSearch": limit,
                "language": "en",
                "skipClosedPlaces": True,
            },
            headers={"Authorization": f"Bearer {secret('APIFY_API_TOKEN')}"},
        )
        resp.raise_for_status()
        return [
            Place(
                name=r.get("title") or "",
                address=r.get("address"),
                city=r.get("city"),
                state=r.get("state"),
                zip=r.get("postalCode"),
                phone=r.get("phone"),
                website=r.get("website"),
                place_id=r.get("placeId"),
                rating=_float(r.get("totalScore")),
                review_count=_int(r.get("reviewsCount")),
            )
            for r in resp.json()
            if isinstance(r, dict)
        ]


def provider_for(cfg: Config) -> MapsProvider:
    if cfg.maps_provider == "apify":
        return Apify(cfg)
    if cfg.maps_provider == "outscraper":
        return Outscraper(cfg)
    raise ValueError(f"Unknown maps_provider '{cfg.maps_provider}'. Use outscraper or apify.")
