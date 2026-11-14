import os

import pytest

TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://nest:nest@127.0.0.1:5433/nest_test"
)


def _guard():
    name = TEST_URL.rsplit("/", 1)[-1].split("?")[0]
    if not name.startswith("nest_test"):
        raise RuntimeError("refusing to reset a database that is not nest_test")


@pytest.fixture(scope="session", autouse=True)
def schema():
    _guard()
    os.environ["DATABASE_URL"] = TEST_URL
    os.environ["JWT_SECRET"] = "test-jwt-secret-value-at-least-32b"
    os.environ["PHI_KEY"] = "test-phi-key-value"
    os.environ["HMAC_KEY"] = "test-hmac-key-value"
    os.environ["SEED_PASSWORD"] = "nest-local-demo"
    from app.db import apply_schema, connect

    with connect(TEST_URL) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        apply_schema(conn)
    return TEST_URL


@pytest.fixture
def db(schema):
    from app.db import connect

    with connect(schema) as conn:
        yield conn


@pytest.fixture(autouse=True)
def clean(schema):
    from app.db import connect

    with connect(schema) as conn:
        conn.execute(
            """
            TRUNCATE checkout_ledger, cart_lines, sessions, lots, bins, products,
                     enrollment_tokens, conditions, client_allergens, clients, users
            RESTART IDENTITY CASCADE
            """
        )
        conn.execute(
            """
            UPDATE warehouse_limits
            SET max_floor = 25, max_queue = 15, lease_minutes = 30
            WHERE id = 1
            """
        )


@pytest.fixture(scope="session")
def rules(schema):
    from app.db import connect
    from app.rules import load_rules

    with connect(schema) as conn:
        return load_rules(conn)


@pytest.fixture(scope="session")
def client(schema):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
