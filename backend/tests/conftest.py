import json
import os
import re
from pathlib import Path

import pytest

from app.rules import RuleEngine

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def golden():
    return json.loads((ROOT / "docs/golden.json").read_text())


@pytest.fixture(scope="session")
def engine():
    # Unit tests read the authoritative SQL fixture; production always reads PostgreSQL.
    text = (ROOT / "docs/seed_reference.sql").read_text()
    pattern = re.compile(
        r"\(\s*'([A-Z_]+)',\s*'[^']*',\s*(?:'[^']*'|NULL),\s*(?:'[^']*'|NULL),\s*([\d.]+|NULL),\s*(?:'[^']*'|NULL),\s*'((?:[^']|'')*)'",
        re.S,
    )
    rows = [
        {"rule_id": m[1], "threshold": float(m[2]) if m[2] != "NULL" else None, "source": m[3]}
        for m in pattern.finditer(text)
    ]
    return RuleEngine(rows)


@pytest.fixture
def configured(monkeypatch):
    for key in ("JWT_SECRET", "PHI_KEY", "HMAC_KEY"):
        monkeypatch.setenv(key, "test-only-" + key + "x" * 40)
    monkeypatch.setenv(
        "DATABASE_URL", os.getenv("TEST_DATABASE_URL", "postgresql://localhost/nest_test")
    )
    from app.config import settings

    settings.cache_clear()
    yield
    settings.cache_clear()


@pytest.fixture
def api(configured):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test")
    from urllib.parse import urlparse

    if not urlparse(url).path.endswith("_test"):
        pytest.fail("test database name must end in _test; this fixture resets its public schema")
    import psycopg
    from fastapi.testclient import TestClient
    from psycopg.rows import dict_row

    from app.main import create_app
    from seed.load import initialize, seed

    with psycopg.connect(url, row_factory=dict_row) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        initialize(conn)
        cards = seed(conn)
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        client.cards = {c["email"].split("@")[0]: c["token"] for c in cards}
        yield client


@pytest.fixture
def db():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("PostgreSQL integration database not configured")
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(url, row_factory=dict_row, autocommit=True) as conn:
        yield conn
