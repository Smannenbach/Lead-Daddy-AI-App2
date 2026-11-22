"""Loads config.yaml and the .env secrets."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv


@dataclass(frozen=True)
class Location:
    city: str
    state: str


@dataclass
class Config:
    raw: dict[str, Any]
    base_dir: Path

    # Plain accessors keep the rest of the code free of dict lookups.
    @property
    def niches(self) -> list[str]:
        return list(self.raw.get("niches", []))

    @property
    def locations(self) -> list[Location]:
        return [Location(city=l["city"], state=l["state"]) for l in self.raw.get("locations", [])]

    @property
    def max_results(self) -> int:
        return int(self.raw.get("max_results_per_search", 20))

    @property
    def maps_provider(self) -> str:
        return str(self.raw.get("maps_provider", "outscraper")).lower()

    def cap(self, phase: str) -> float:
        return float(self.raw.get("daily_caps_usd", {}).get(phase, 0.0))

    def price(self, key: str) -> float:
        return float(self.raw.get("pricing", {})[key])

    def section(self, name: str) -> dict[str, Any]:
        return dict(self.raw.get(name, {}))

    @property
    def export_dir(self) -> Path:
        return self.base_dir / self.section("export").get("dir", "data/exports")


def load_config(path: str | os.PathLike[str] | None = None) -> Config:
    """Read config.yaml (or LEADS_CONFIG_PATH) and load .env next to it."""
    cfg_path = Path(path or os.environ.get("LEADS_CONFIG_PATH", "config.yaml")).resolve()
    load_dotenv(cfg_path.parent / ".env")
    with cfg_path.open() as fh:
        raw = yaml.safe_load(fh) or {}
    return Config(raw=raw, base_dir=cfg_path.parent)


def secret(name: str) -> str:
    """Return a secret from the environment, or raise a plain error naming the missing key."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise MissingSecret(name)
    return value


class MissingSecret(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"{name} is not set. Add it to .env (see .env.example).")
        self.name = name
