import os
from urllib.parse import urlparse

import psycopg
import pytest
from psycopg.rows import dict_row

from app.config import settings
from seed.load import initialize


@pytest.fixture
def upstream_database(monkeypatch):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test")
    if not urlparse(url).path.endswith("_test"):
        pytest.fail("refusing to reset a database not ending in _test")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-value-at-least-32b")
    for name in ("PHI_KEY", "HMAC_KEY"):
        monkeypatch.setenv(name, "upstream-test-only-" + name + "x" * 32)
    settings.cache_clear()
    with psycopg.connect(url, row_factory=dict_row) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        initialize(conn)
    yield url
    settings.cache_clear()


@pytest.fixture
def db(upstream_database):
    with psycopg.connect(upstream_database, row_factory=dict_row, autocommit=True) as conn:
        yield conn


@pytest.fixture
def client(upstream_database):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client


@pytest.fixture(scope="session")
def rules(engine):
    return engine.rules
