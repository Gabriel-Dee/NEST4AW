import hashlib
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app.auth import APIError
from app.db import get_conn
from app.phi import iso, session_public
from app.roles import staff_or_admin

router = APIRouter()

_PROMOTE = """
WITH lim AS (
  SELECT max_floor, lease_minutes FROM warehouse_limits
), free AS (
  SELECT GREATEST(0,
    (SELECT max_floor FROM lim)
    - (SELECT COUNT(*) FROM sessions WHERE status = 'active')
  ) AS n
)
UPDATE sessions SET status = 'active',
  lease_expires_at = now() + make_interval(mins => (SELECT lease_minutes FROM lim))
WHERE id IN (
  SELECT id FROM sessions
  WHERE status = 'queued'
  ORDER BY queued_at, id
  LIMIT (SELECT n FROM free)
)
"""


class ArriveBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str


def _load_session(conn, session_id):
    return conn.execute(
        """
        SELECT id, status, tier_id, dm, htn, ckd34, k_limit_ordered,
               allergens, household_size, lease_expires_at
        FROM sessions WHERE id = %s
        """,
        (session_id,),
    ).fetchone()


def _admit(conn, client_id):
    existing = conn.execute(
        """
        SELECT id FROM sessions
        WHERE client_id = %s AND status IN ('active', 'queued')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (client_id,),
    ).fetchone()
    if existing:
        return _load_session(conn, existing["id"])

    limits = conn.execute(
        "SELECT max_floor, max_queue, lease_minutes FROM warehouse_limits WHERE id = 1"
    ).fetchone()
    active = conn.execute(
        "SELECT COUNT(*) AS n FROM sessions WHERE status = 'active'"
    ).fetchone()["n"]
    queued = conn.execute(
        "SELECT COUNT(*) AS n FROM sessions WHERE status = 'queued'"
    ).fetchone()["n"]
    if active < limits["max_floor"]:
        status = "active"
    elif queued < limits["max_queue"]:
        status = "queued"
    else:
        return None

    client = conn.execute(
        """
        SELECT tier_id, dm, htn, ckd34, k_limit_ordered, household_size
        FROM clients WHERE id = %s
        """,
        (client_id,),
    ).fetchone()
    allergens = conn.execute(
        """
        SELECT COALESCE(array_agg(code ORDER BY code), '{}') AS codes
        FROM client_allergens WHERE client_id = %s
        """,
        (client_id,),
    ).fetchone()["codes"]
    return conn.execute(
        """
        INSERT INTO sessions (
          client_id, status, queued_at, lease_expires_at,
          tier_id, dm, htn, ckd34, k_limit_ordered, allergens, household_size
        ) VALUES (
          %s, %s,
          CASE WHEN %s = 'queued' THEN now() ELSE NULL END,
          CASE WHEN %s = 'active'
               THEN now() + make_interval(mins => %s) ELSE NULL END,
          %s, %s, %s, %s, %s, %s, %s
        )
        RETURNING id, status, tier_id, dm, htn, ckd34, k_limit_ordered,
                  allergens, household_size, lease_expires_at
        """,
        (
            client_id,
            status,
            status,
            status,
            limits["lease_minutes"],
            client["tier_id"],
            client["dm"],
            client["htn"],
            client["ckd34"],
            client["k_limit_ordered"],
            list(allergens or []),
            client["household_size"],
        ),
    ).fetchone()


@router.post("/floor/arrive")
def arrive(body: ArriveBody, conn=Depends(get_conn)):
    digest = hashlib.sha256(body.token.encode()).digest()
    bad = False
    row = None
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(861104)")
        conn.execute(
            """
            UPDATE sessions SET status = 'expired'
            WHERE status = 'active' AND lease_expires_at <= now()
            """
        )
        conn.execute(_PROMOTE)
        token = conn.execute(
            """
            SELECT id, client_id, status, expires_on
            FROM enrollment_tokens WHERE token_hash = %s
            """,
            (digest,),
        ).fetchone()
        today = date.today()
        bad = token is None or token["status"] != "active" or token["expires_on"] < today
        if token is not None and token["status"] == "active" and token["expires_on"] < today:
            conn.execute(
                "UPDATE enrollment_tokens SET status = 'expired' WHERE id = %s",
                (token["id"],),
            )
        if not bad:
            row = _admit(conn, token["client_id"])
    if bad:
        raise APIError(401, "unauthorized", "please see a volunteer")
    if row is None:
        raise APIError(409, "floor_full", "please see a volunteer")
    return session_public(row)


@router.get("/sessions/{session_id}")
def get_session(session_id: str, conn=Depends(get_conn)):
    row = _load_session(conn, session_id)
    if row is None:
        raise APIError(404, "not_found", "unknown session")
    return session_public(row)


@router.get("/floor/board")
def board(conn=Depends(get_conn), _user=Depends(staff_or_admin)):
    limits = conn.execute(
        """
        SELECT max_floor, max_queue,
          (SELECT COUNT(*) FROM sessions WHERE status = 'active') AS active_count,
          (SELECT COUNT(*) FROM sessions WHERE status = 'queued') AS queued_count
        FROM warehouse_limits WHERE id = 1
        """
    ).fetchone()
    rows = conn.execute(
        """
        SELECT id, status, tier_id, queued_at, lease_expires_at
        FROM sessions
        WHERE status IN ('active', 'queued')
        ORDER BY queued_at NULLS LAST, created_at, id
        """
    ).fetchall()
    return {
        "active_count": limits["active_count"],
        "queued_count": limits["queued_count"],
        "max_floor": limits["max_floor"],
        "max_queue": limits["max_queue"],
        "rows": [
            {
                "session_id": str(row["id"]),
                "status": row["status"],
                "tier_id": row["tier_id"],
                "queued_at": iso(row["queued_at"]),
                "lease_expires_at": iso(row["lease_expires_at"]),
            }
            for row in rows
        ],
    }
