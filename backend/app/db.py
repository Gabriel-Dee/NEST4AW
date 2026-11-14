from pathlib import Path

import psycopg
from fastapi import Request
from psycopg.rows import dict_row

from app.config import settings


def connection(request: Request):
    # A route, including its authorization dependency, shares one transaction.
    with request.app.state.pool.connection() as conn:
        yield conn


DOCS = Path(__file__).resolve().parents[2] / "docs"


def connect(url=None):
    """Administrative/test connection. Use conn.transaction() for grouped mutations."""
    return psycopg.connect(url or settings().database_url, row_factory=dict_row, autocommit=True)


def apply_schema(conn):
    from seed.load import initialize

    with conn.transaction():
        initialize(conn)
