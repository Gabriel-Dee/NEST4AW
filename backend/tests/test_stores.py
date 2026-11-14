from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest

from app.errors import APIError
from app.geo import admission, haversine_m, within_geofence
from app.routes.stores import KioskBody, client_from_kiosk
from app.visits import is_open

EPIC = (29.8947, -81.3145)


def offset_m(meters):
    return EPIC[0] + meters / 111_320, EPIC[1]


def test_check_in_distance_accepts_50m_and_rejects_2km():
    near = haversine_m(*offset_m(50), *EPIC)
    far = haversine_m(*offset_m(2000), *EPIC)
    assert 40 <= near <= 70
    assert far > 1500
    assert within_geofence(near, 150, 10)
    assert not within_geofence(far, 150, 10)


def test_accuracy_tolerance_is_capped_at_100m():
    assert within_geofence(240, 150, 500)
    assert not within_geofence(260, 150, 500)


def test_full_store_does_not_change_another_store():
    assert admission(active=1, capacity=1, waiting=0, max_queue=5) == "queue_waiting"
    assert admission(active=0, capacity=8, waiting=0, max_queue=5) == "active"


def test_closed_hours():
    hours = {day: ["09:00", "17:00"] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    morning = datetime(2026, 11, 14, 8, 0, tzinfo=timezone.utc)
    midday = datetime(2026, 11, 14, 15, 0, tzinfo=timezone.utc)
    assert is_open(hours, "UTC", morning) is False
    assert is_open(hours, "UTC", midday) is True


def test_expired_qr_is_rejected(configured):
    from app.config import settings

    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "purpose": "checkin",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings().jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(APIError) as caught:
        client_from_kiosk(None, KioskBody(qr_token=token))
    assert caught.value.status == 401
    assert caught.value.code == "unauthorized"


@pytest.mark.integration
def test_geofence_kiosk_capacity_and_store_stock(api, db):
    def login(email):
        response = api.post("/auth/login", json={"email": email, "password": "nest-local-demo"})
        assert response.status_code == 200, response.text
        return {"Authorization": "Bearer " + response.json()["token"]}

    epic = db.execute("SELECT * FROM stores WHERE slug='epic-cure'").fetchone()
    beach = db.execute("SELECT * FROM stores WHERE slug='st-augustine-beach'").fetchone()
    maria = login("maria@demo.local")
    near_lat, near_lng = offset_m(50)
    ok = api.post(
        f"/stores/{epic['id']}/check-in",
        headers=maria,
        json={"lat": near_lat, "lng": near_lng, "accuracy_m": 10},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "active"
    again = api.post(
        f"/stores/{epic['id']}/check-in",
        headers=maria,
        json={"lat": epic["lat"], "lng": epic["lng"], "accuracy_m": 5},
    )
    assert again.status_code == 409
    assert again.json()["error"] == "ALREADY_CHECKED_IN"
    far_lat, far_lng = offset_m(2000)
    james = login("james@demo.local")
    away = api.post(
        f"/stores/{epic['id']}/check-in",
        headers=james,
        json={"lat": far_lat, "lng": far_lng, "accuracy_m": 5},
    )
    assert away.status_code == 403
    assert away.json()["error"] == "NOT_AT_STORE"
    assert away.json()["distance_m"] > 1500
    wrong = api.post(
        "/kiosk/check-in",
        headers={"X-Kiosk-Code": "not-a-kiosk"},
        json={"client_code": "nope"},
    )
    assert wrong.status_code == 401
    from app.config import settings

    expired = jwt.encode(
        {
            "sub": str(uuid4()),
            "purpose": "checkin",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=30),
        },
        settings().jwt_secret,
        algorithm="HS256",
    )
    stale = api.post(
        "/kiosk/check-in",
        headers={"X-Kiosk-Code": epic["kiosk_code"]},
        json={"qr_token": expired},
    )
    assert stale.status_code == 401
    db.execute("UPDATE stores SET max_floor_capacity=1 WHERE id=%s", (epic["id"],))
    db.execute(
        """UPDATE visits SET status='expired', ended_at=now()
        WHERE client_id=(SELECT id FROM clients c JOIN users u ON u.id=c.user_id WHERE u.email='maria@demo.local')"""
    )
    first = api.post(
        f"/stores/{epic['id']}/check-in",
        headers=maria,
        json={"lat": epic["lat"], "lng": epic["lng"], "accuracy_m": 1},
    )
    assert first.status_code == 200, first.text
    queued = api.post(
        f"/stores/{epic['id']}/check-in",
        headers=james,
        json={"lat": epic["lat"], "lng": epic["lng"], "accuracy_m": 1},
    )
    assert queued.status_code == 202, queued.text
    assert queued.json()["status"] == "queue_waiting"
    asha = login("asha@demo.local")
    other = api.post(
        f"/stores/{beach['id']}/check-in",
        headers=asha,
        json={"lat": beach["lat"], "lng": beach["lng"], "accuracy_m": 1},
    )
    assert other.status_code == 200, other.text
    product = db.execute(
        "SELECT id, barcode FROM products WHERE barcode='FIXTURE-BAR-PEANUT'"
    ).fetchone()
    db.execute(
        "UPDATE lots SET qty=0 WHERE product_id=%s AND store_id=%s", (product["id"], epic["id"])
    )
    maria_visit = db.execute(
        """SELECT v.id FROM visits v
        JOIN clients c ON c.id=v.client_id JOIN users u ON u.id=c.user_id
        WHERE u.email='maria@demo.local' AND v.status='active'"""
    ).fetchone()
    hidden = api.post(
        "/scan",
        json={"session_id": str(maria_visit["id"]), "barcode": product["barcode"]},
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["verdict"] == "unknown"
    beach_visit = db.execute(
        """SELECT v.id FROM visits v
        JOIN clients c ON c.id=v.client_id JOIN users u ON u.id=c.user_id
        WHERE u.email='asha@demo.local' AND v.status='active'"""
    ).fetchone()
    shown = api.post(
        "/scan",
        json={"session_id": str(beach_visit["id"]), "barcode": product["barcode"]},
    )
    assert shown.status_code == 200, shown.text
    assert shown.json()["verdict"] != "unknown"
