"""Compatibility helpers using the unified encryption/card services."""

from datetime import date, datetime, timezone
from decimal import Decimal

from app.clients import issue_card, read_client
from app.floor import public_session as session_public
from app.tier import flags_from_icd


def num(value):
    return float(value) if isinstance(value, Decimal) else value


def iso(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return value.isoformat() if isinstance(value, date) else value


def warnings_for(codes):
    return flags_from_icd(codes or []).warnings


def fetch_clients(conn, client_id=None, user_id=None):
    if client_id is not None:
        return [read_client(conn, client_id)]
    rows = conn.execute(
        "SELECT id FROM clients WHERE (%s::uuid IS NULL OR user_id=%s) ORDER BY created_at,id",
        (user_id, user_id),
    )
    return [read_client(conn, row["id"]) for row in rows.fetchall()]


__all__ = ["issue_card", "session_public", "num", "iso", "warnings_for", "fetch_clients"]
