from __future__ import annotations

from pathlib import Path

import pytest

from leads.config import Config, load_config
from leads.db import connect

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture()
def cfg() -> Config:
    c = load_config(ROOT / "config.yaml")
    c.raw["locations"] = [{"city": "Phoenix", "state": "AZ"}]
    c.raw["niches"] = ["family law attorney"]
    return c


@pytest.fixture()
def conn():
    c = connect(":memory:")
    yield c
    c.close()


@pytest.fixture(autouse=True)
def fake_keys(monkeypatch):
    # Tests never reach a paid API. Every client is mocked; these just satisfy secret().
    for k in ("OUTSCRAPER_API_KEY", "APIFY_API_TOKEN", "MILLIONVERIFIER_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.setenv(k, "test-not-a-real-key")
