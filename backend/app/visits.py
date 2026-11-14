"""A visit is one store check-in. It is not an account login."""

import hashlib
import json
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

from app.clients import read_client
from app.errors import APIError
from app.geo import admission, haversine_m, within_geofence

OPEN = ("queue_waiting", "active", "checking_out")


def token_hash(raw: str) -> bytes:
    return hashlib.sha256(raw.encode()).digest()


def is_open(hours, timezone_name, now=None) -> bool:
    if isinstance(hours, str):
        hours = json.loads(hours)
    moment = now or datetime.now(ZoneInfo(timezone_name))
    key = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[moment.weekday()]
    window = (hours or {}).get(key)
    if not window:
        return False
    current = moment.strftime("%H:%M")
    return window[0] <= current <= window[1]


def expire_idle(conn):
    conn.execute(
        """UPDATE visits SET status='expired', ended_at=now()
        WHERE status IN ('queue_waiting','active','checking_out')
        AND last_seen_at < now() - interval '3 hours'"""
    )


def summary(conn, client_id):
    row = read_client(conn, client_id)
    legal_name = (row["legal_name"] or "").strip()
    return {
        "id": row["id"],
        "first_name": legal_name.split()[0] if legal_name else None,
        "household_size": row["household_size"],
        "tier_id": row["tier_id"],
        "dm": row["dm"],
        "htn": row["htn"],
        "ckd34": row["ckd34"],
        "k_limit_ordered": row["k_limit_ordered"],
        "allergens": list(row["allergens"] or []),
    }


def public_visit(conn, visit, raw_token=None):
    store = conn.execute("SELECT id,name FROM stores WHERE id=%s", (visit["store_id"],)).fetchone()
    body = {
        "visit_token": raw_token,
        "status": visit["status"],
        "store": {"id": store["id"], "name": store["name"]},
        "client": summary(conn, visit["client_id"]),
    }
    if visit["status"] == "queue_waiting":
        body["queue_position"] = visit["queue_position"]
        body["est_wait_min"] = int(visit["queue_position"] or 1) * 8
    if raw_token is None:
        body.pop("visit_token")
    return body


def open_visit(conn, client_id):
    expire_idle(conn)
    return conn.execute(
        "SELECT * FROM visits WHERE client_id=%s AND status IN ('queue_waiting','active','checking_out')",
        (client_id,),
    ).fetchone()


def _counts(conn, store_id):
    rows = conn.execute(
        """SELECT status, count(*) AS n FROM visits
        WHERE store_id=%s AND status IN ('active','queue_waiting') GROUP BY status""",
        (store_id,),
    ).fetchall()
    counts = {row["status"]: row["n"] for row in rows}
    return counts.get("active", 0), counts.get("queue_waiting", 0)


def _sync_floor(conn, store_id):
    active, _waiting = _counts(conn, store_id)
    conn.execute("UPDATE stores SET active_floor_shoppers=%s WHERE id=%s", (active, store_id))


def _start_session(conn, client, visit_id):
    allergens = [
        row["code"]
        for row in conn.execute(
            "SELECT code FROM client_allergens WHERE client_id=%s ORDER BY code", (client["id"],)
        )
    ]
    limits = conn.execute("SELECT lease_minutes FROM warehouse_limits WHERE id=1").fetchone()
    conn.execute(
        """INSERT INTO sessions
        (id,client_id,status,lease_expires_at,tier_id,dm,htn,ckd34,k_limit_ordered,allergens,household_size)
        VALUES (%s,%s,'active',now()+make_interval(mins=>%s),%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO NOTHING""",
        (
            visit_id,
            client["id"],
            limits["lease_minutes"],
            client["tier_id"],
            client["dm"],
            client["htn"],
            client["ckd34"],
            client["k_limit_ordered"],
            allergens,
            client["household_size"],
        ),
    )


def promote(conn, store_id):
    active, _waiting = _counts(conn, store_id)
    capacity = conn.execute(
        "SELECT max_floor_capacity FROM stores WHERE id=%s", (store_id,)
    ).fetchone()["max_floor_capacity"]
    while active < capacity:
        nxt = conn.execute(
            """SELECT * FROM visits WHERE store_id=%s AND status='queue_waiting'
            ORDER BY queue_position, started_at, id LIMIT 1 FOR UPDATE""",
            (store_id,),
        ).fetchone()
        if not nxt:
            break
        conn.execute(
            "UPDATE visits SET status='active', queue_position=NULL, last_seen_at=now() WHERE id=%s",
            (nxt["id"],),
        )
        client = read_client(conn, nxt["client_id"])
        _start_session(conn, client, nxt["id"])
        active += 1
    _sync_floor(conn, store_id)


def check_in(conn, client_id, store, method, lat=None, lng=None, accuracy_m=0):
    conn.execute("SELECT id FROM stores WHERE id=%s FOR UPDATE", (store["id"],))
    expire_idle(conn)
    existing = open_visit(conn, client_id)
    if existing:
        raise APIError(
            409,
            "ALREADY_CHECKED_IN",
            "this account already has a visit",
            visit=public_visit(conn, existing),
        )
    client = read_client(conn, client_id)
    if client["token_status"] in ("expired", "revoked"):
        raise APIError(403, "ENROLLMENT_EXPIRED", "enrollment is not active")
    if not store["is_active"] or not is_open(store["open_hours_json"], store["timezone"]):
        raise APIError(403, "STORE_CLOSED", "store is closed")
    if method == "geofence":
        distance = haversine_m(lat, lng, store["lat"], store["lng"])
        if not within_geofence(distance, store["geofence_radius_m"], accuracy_m):
            raise APIError(
                403,
                "NOT_AT_STORE",
                "check-in location is outside this store",
                distance_m=round(distance, 1),
            )
    active, waiting = _counts(conn, store["id"])
    decision = admission(active, store["max_floor_capacity"], waiting, store["max_queue"])
    if decision == "full":
        raise APIError(409, "floor_full", "this store floor and queue are full")
    raw = secrets.token_urlsafe(32)
    position = waiting + 1 if decision == "queue_waiting" else None
    visit = conn.execute(
        """INSERT INTO visits
        (visit_token_hash,client_id,store_id,status,queue_position,check_in_method,check_in_lat,check_in_lng)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (
            token_hash(raw),
            client_id,
            store["id"],
            decision,
            position,
            method,
            lat,
            lng,
        ),
    ).fetchone()
    if decision == "active":
        _start_session(conn, client, visit["id"])
    _sync_floor(conn, store["id"])
    return decision, public_visit(conn, visit, raw)


def leave(conn, client_id):
    visit = open_visit(conn, client_id)
    if not visit:
        return None
    conn.execute(
        "UPDATE visits SET status='expired', ended_at=now() WHERE id=%s",
        (visit["id"],),
    )
    conn.execute(
        "UPDATE sessions SET status='expired' WHERE id=%s AND status IN ('active','queued')",
        (visit["id"],),
    )
    promote(conn, visit["store_id"])
    return visit


def resolve_visit_token(conn, raw):
    if not raw:
        return None
    expire_idle(conn)
    visit = conn.execute(
        "SELECT * FROM visits WHERE visit_token_hash=%s", (token_hash(raw),)
    ).fetchone()
    if not visit or visit["status"] not in OPEN:
        raise APIError(401, "unauthorized", "visit is not active")
    conn.execute("UPDATE visits SET last_seen_at=now() WHERE id=%s", (visit["id"],))
    return visit


def store_of_session(conn, session_id):
    row = conn.execute("SELECT store_id FROM visits WHERE id=%s", (session_id,)).fetchone()
    return None if row is None else row["store_id"]
