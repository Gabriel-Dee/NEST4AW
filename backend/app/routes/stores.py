"""Store discovery and check-in. The account JWT and the visit token are different credentials."""

from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from app.auth import require_role
from app.config import settings
from app.db import connection
from app.errors import APIError
from app.geo import haversine_m, within_geofence
from app.schemas import Strict
from app.visits import (
    check_in,
    is_open,
    leave,
    open_visit,
    public_visit,
    resolve_visit_token,
    token_hash,
)

router = APIRouter()


class CheckInBody(Strict):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(default=0, ge=0, le=5000)


class KioskBody(Strict):
    client_code: str | None = Field(default=None, max_length=256)
    qr_token: str | None = Field(default=None, max_length=4000)


class StaffCheckIn(Strict):
    client_id: UUID


def store_row(conn, store_id):
    row = conn.execute("SELECT * FROM stores WHERE id=%s", (store_id,)).fetchone()
    if not row or not row["is_active"]:
        raise APIError(404, "not_found", "store not found")
    return row


def floor(conn, store):
    counts = {
        row["status"]: row["n"]
        for row in conn.execute(
            """SELECT status, count(*) AS n FROM visits
            WHERE store_id=%s AND status IN ('active','queue_waiting') GROUP BY status""",
            (store["id"],),
        )
    }
    return {
        "active": counts.get("active", 0),
        "max": store["max_floor_capacity"],
        "queue_length": counts.get("queue_waiting", 0),
    }


def public_store(conn, store, lat, lng):
    distance = haversine_m(lat, lng, store["lat"], store["lng"])
    return {
        "id": store["id"],
        "name": store["name"],
        "address": store["address"],
        "city": store["city"],
        "lat": store["lat"],
        "lng": store["lng"],
        "distance_m": round(distance, 1),
        "is_open": is_open(store["open_hours_json"], store["timezone"]),
        "floor": floor(conn, store),
        "within_geofence": within_geofence(distance, store["geofence_radius_m"], 0),
    }


def respond(status, body):
    return JSONResponse(status_code=202 if status == "queue_waiting" else 200, content=body)


@router.get("/stores")
def list_stores(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_km: float = Query(default=25, gt=0, le=200),
    conn=Depends(connection, scope="function"),
):
    rows = [
        public_store(conn, store, lat, lng)
        for store in conn.execute("SELECT * FROM stores WHERE is_active ORDER BY name")
    ]
    nearby = [row for row in rows if row["distance_m"] <= radius_km * 1000]
    return sorted(nearby, key=lambda row: row["distance_m"])


@router.get("/stores/nearest")
def nearest(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    conn=Depends(connection, scope="function"),
):
    rows = [
        public_store(conn, store, lat, lng)
        for store in conn.execute("SELECT * FROM stores WHERE is_active")
    ]
    if not rows:
        raise APIError(404, "not_found", "store not found")
    return min(rows, key=lambda row: row["distance_m"])


@router.get("/stores/{store_id}")
def store_detail(store_id: UUID, conn=Depends(connection, scope="function")):
    store = store_row(conn, store_id)
    return {
        "id": store["id"],
        "name": store["name"],
        "slug": store["slug"],
        "address": store["address"],
        "city": store["city"],
        "lat": store["lat"],
        "lng": store["lng"],
        "geofence_radius_m": store["geofence_radius_m"],
        "timezone": store["timezone"],
        "hours": store["open_hours_json"],
        "is_open": is_open(store["open_hours_json"], store["timezone"]),
        "floor": floor(conn, store),
    }


@router.post("/stores/{store_id}/check-in")
def geofence_check_in(
    store_id: UUID,
    body: CheckInBody,
    user=Depends(require_role("client")),
    conn=Depends(connection, scope="function"),
):
    client = conn.execute("SELECT id FROM clients WHERE user_id=%s", (user["id"],)).fetchone()
    if not client:
        raise APIError(403, "forbidden", "client profile required")
    status, payload = check_in(
        conn,
        client["id"],
        store_row(conn, store_id),
        "geofence",
        body.lat,
        body.lng,
        body.accuracy_m,
    )
    return respond(status, payload)


@router.post("/stores/{store_id}/check-in/staff")
def staff_check_in(
    store_id: UUID,
    body: StaffCheckIn,
    _user=Depends(require_role("warehouse_staff", "admin")),
    conn=Depends(connection, scope="function"),
):
    status, payload = check_in(conn, body.client_id, store_row(conn, store_id), "staff")
    return respond(status, payload)


@router.post("/kiosk/check-in")
def kiosk_check_in(
    body: KioskBody,
    conn=Depends(connection, scope="function"),
    x_kiosk_code: str | None = Header(default=None),
):
    store = conn.execute(
        "SELECT * FROM stores WHERE kiosk_code=%s AND is_active", (x_kiosk_code,)
    ).fetchone()
    if not store:
        raise APIError(401, "unauthorized", "kiosk is not recognized")
    client_id = client_from_kiosk(conn, body)
    status, payload = check_in(conn, client_id, store, "kiosk")
    return respond(status, payload)


def client_from_kiosk(conn, body: KioskBody):
    if body.qr_token:
        try:
            claims = jwt.decode(body.qr_token, settings().jwt_secret, algorithms=["HS256"])
        except jwt.PyJWTError:
            raise APIError(401, "unauthorized", "qr token expired") from None
        if claims.get("purpose") != "checkin":
            raise APIError(401, "unauthorized", "qr token expired")
        row = conn.execute("SELECT id FROM clients WHERE user_id=%s", (claims["sub"],)).fetchone()
        if not row:
            raise APIError(401, "unauthorized", "qr token expired")
        return row["id"]
    if body.client_code:
        row = conn.execute(
            """SELECT client_id FROM enrollment_tokens
            WHERE token_hash=%s AND status='active' AND expires_on>CURRENT_DATE""",
            (token_hash(body.client_code),),
        ).fetchone()
        if not row:
            raise APIError(401, "unauthorized", "card is not active")
        return row["client_id"]
    raise APIError(422, "invalid_input", "client code or qr token is required")


@router.get("/visits/current")
def current_visit(user=Depends(require_role("client")), conn=Depends(connection, scope="function")):
    client = conn.execute("SELECT id FROM clients WHERE user_id=%s", (user["id"],)).fetchone()
    if not client:
        return None
    visit = open_visit(conn, client["id"])
    return None if visit is None else public_visit(conn, visit)


@router.post("/visits/current/leave")
def leave_visit(user=Depends(require_role("client")), conn=Depends(connection, scope="function")):
    client = conn.execute("SELECT id FROM clients WHERE user_id=%s", (user["id"],)).fetchone()
    if not client or leave(conn, client["id"]) is None:
        raise APIError(404, "not_found", "no active visit")
    return {"ok": True}


def visit_store(request: Request, conn):
    raw = request.headers.get("x-visit-token")
    if not raw:
        return None
    return resolve_visit_token(conn, raw)
