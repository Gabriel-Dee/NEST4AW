import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.db import env
from app.tier import flags_from_icd

CLIENT_SQL = """
SELECT c.id,
       c.user_id,
       pgp_sym_decrypt(c.legal_name_enc, %(phi)s) AS legal_name,
       CASE WHEN c.phone_enc IS NULL THEN NULL
            ELSE pgp_sym_decrypt(c.phone_enc, %(phi)s) END AS phone,
       u.email,
       c.household_size,
       c.k_limit_ordered,
       c.dm, c.htn, c.ckd34, c.tier_id,
       COALESCE(icd.codes, '{}') AS icd10,
       COALESCE(alg.codes, '{}') AS allergens,
       tok.status AS token_row_status,
       tok.expires_on AS token_expires_on
FROM clients c
JOIN users u ON u.id = c.user_id
LEFT JOIN LATERAL (
  SELECT array_agg(icd10 ORDER BY icd10) AS codes
  FROM conditions WHERE client_id = c.id
) icd ON true
LEFT JOIN LATERAL (
  SELECT array_agg(code ORDER BY code) AS codes
  FROM client_allergens WHERE client_id = c.id
) alg ON true
LEFT JOIN LATERAL (
  SELECT status, expires_on
  FROM enrollment_tokens
  WHERE client_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) tok ON true
"""


def num(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def token_status(status, expires_on) -> str:
    if status is None:
        return "none"
    if status == "revoked":
        return "revoked"
    if status == "expired" or (expires_on is not None and expires_on < date.today()):
        return "expired"
    if status == "active":
        return "active"
    return status


def warnings_for(codes) -> list[str]:
    try:
        return flags_from_icd(list(codes or [])).warnings
    except Exception:
        return []


def client_public(row, *, card_token: str | None = None) -> dict:
    body = {
        "id": str(row["id"]),
        "legal_name": row["legal_name"],
        "phone": row["phone"],
        "email": row["email"],
        "household_size": row["household_size"],
        "icd10": list(row["icd10"] or []),
        "allergens": list(row["allergens"] or []),
        "k_limit_ordered": row["k_limit_ordered"],
        "dm": row["dm"],
        "htn": row["htn"],
        "ckd34": row["ckd34"],
        "tier_id": row["tier_id"],
        "token_status": token_status(row["token_row_status"], row["token_expires_on"]),
        "warnings": warnings_for(row["icd10"]),
    }
    if card_token is not None:
        body["card_token"] = card_token
    return body


def profile_public(row) -> dict:
    return {
        "legal_name": row["legal_name"],
        "email": row["email"],
        "tier_id": row["tier_id"],
        "dm": row["dm"],
        "htn": row["htn"],
        "ckd34": row["ckd34"],
        "k_limit_ordered": row["k_limit_ordered"],
        "allergens": list(row["allergens"] or []),
        "household_size": row["household_size"],
        "token_status": token_status(row["token_row_status"], row["token_expires_on"]),
    }


def session_public(row) -> dict:
    return {
        "session_id": str(row["id"]),
        "status": row["status"],
        "tier_id": row["tier_id"],
        "dm": row["dm"],
        "htn": row["htn"],
        "ckd34": row["ckd34"],
        "k_limit_ordered": row["k_limit_ordered"],
        "allergens": list(row["allergens"] or []),
        "household_size": row["household_size"],
        "lease_expires_at": iso(row["lease_expires_at"]),
    }


def fetch_clients(conn, client_id=None, user_id=None):
    sql = CLIENT_SQL
    params = {"phi": env("PHI_KEY")}
    if client_id is not None:
        sql += " WHERE c.id = %(client_id)s"
        params["client_id"] = client_id
    elif user_id is not None:
        sql += " WHERE c.user_id = %(user_id)s"
        params["user_id"] = user_id
    sql += " ORDER BY legal_name"
    return conn.execute(sql, params).fetchall()


def issue_card(conn, client_id) -> str:
    raw = secrets.token_urlsafe(32)
    digest = hashlib.sha256(raw.encode()).digest()
    conn.execute(
        """
        INSERT INTO enrollment_tokens (client_id, token_hash, status, expires_on)
        VALUES (%s, %s, 'active', %s)
        """,
        (client_id, digest, date.today() + timedelta(days=365)),
    )
    return raw


def copy_flags(conn, client_id, tier_id, dm, htn, ckd34, k_limit, allergens, household) -> None:
    conn.execute(
        """
        UPDATE sessions
        SET tier_id = %s, dm = %s, htn = %s, ckd34 = %s,
            k_limit_ordered = %s, allergens = %s, household_size = %s
        WHERE client_id = %s AND status IN ('active', 'queued')
        """,
        (tier_id, dm, htn, ckd34, k_limit, list(allergens), household, client_id),
    )
