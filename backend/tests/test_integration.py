import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.auth import password_hash
from app.config import settings

pytestmark = pytest.mark.integration


def auth(api, name="staff"):
    r = api.post("/auth/login", json={"email": name + "@demo.local", "password": "nest-local-demo"})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def arrive(api, name="maria"):
    r = api.post("/floor/arrive", json={"token": api.cards[name]})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


def banana(api, sid):
    r = api.post("/scan", json={"session_id": sid, "internal_code": "P-173944"})
    assert r.status_code == 200, r.text
    return r.json()


def test_auth_roles_errors_cors(api, db):
    assert api.get("/health").json() == {"ok": True}
    assert api.get("/clients").status_code == 401
    for role in ["staff", "partner", "maria"]:
        assert api.get("/clients", headers=auth(api, role)).status_code == 403
    assert (
        api.post(
            "/checkout", json={"session_id": str(uuid.uuid4())}, headers=auth(api, "doctor")
        ).status_code
        == 403
    )
    assert (
        api.get(
            "/reports/dispensed?from=2020-01-01&to=2030-01-01", headers=auth(api, "staff")
        ).status_code
        == 403
    )
    for email, password in [("none@demo.local", "wrong"), ("staff@demo.local", "wrong")]:
        r = api.post("/auth/login", json={"email": email, "password": password})
        assert r.status_code == 401 and r.json() == {
            "error": "unauthorized",
            "message": "invalid email or password",
        }
    token = auth(api)
    db.execute("UPDATE users SET disabled=true WHERE email='staff@demo.local'")
    assert api.get("/auth/me", headers=token).status_code == 401
    assert (
        api.post(
            "/auth/login", json={"email": "staff@demo.local", "password": "nest-local-demo"}
        ).status_code
        == 401
    )
    user = db.execute("SELECT * FROM users WHERE email='doctor@demo.local'").fetchone()
    assert password_hash.verify("nest-local-demo", user["password_hash"])
    for algorithm, key, expiry in [
        ("HS256", "wrong" * 10, 1),
        ("none", "", 1),
        ("HS256", settings().jwt_secret, -1),
    ]:
        bad = jwt.encode(
            {
                "sub": str(user["id"]),
                "role": user["role"],
                "email": user["email"],
                "iat": datetime.now(timezone.utc) - timedelta(hours=2),
                "exp": datetime.now(timezone.utc) + timedelta(hours=expiry),
            },
            key,
            algorithm=algorithm,
        )
        assert api.get("/auth/me", headers={"Authorization": "Bearer " + bad}).status_code == 401
    for origin in ("http://localhost:5173", "http://localhost:5174"):
        r = api.options(
            "/scan",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
        assert r.status_code == 200 and r.headers["access-control-allow-origin"] == origin
    assert set(api.post("/scan", json={}).json()) == {"error", "message"}
    assert set(api.get("/absent").json()) == {"error", "message"}


def test_enrollment_and_profile_sync(api, db):
    headers = auth(api, "doctor")
    body = {
        "legal_name": "Synthetic Person",
        "phone": "555-0101",
        "email": "synthetic@demo.local",
        "password": "test-password",
        "household_size": 3,
        "icd10": ["E11.9", "I10"],
        "allergens": [],
        "k_limit_ordered": False,
    }
    r = api.post("/clients", json=body, headers=headers)
    assert r.status_code == 201, r.text
    client = r.json()
    assert client["tier_id"] == "T4"
    assert api.get("/clients/" + client["id"], headers=headers).json().get("token") is None
    encrypted = db.execute(
        "SELECT legal_name_enc FROM clients WHERE id=%s", (client["id"],)
    ).fetchone()["legal_name_enc"]
    assert b"Synthetic" not in encrypted
    sid = api.post("/floor/arrive", json={"token": client["token"]}).json()["session_id"]
    r = api.patch(
        "/clients/" + client["id"],
        json={"icd10": ["N18.4"], "allergens": ["milk"]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert api.get("/sessions/" + sid).json()["allergens"] == ["milk"]
    assert (
        api.patch(
            "/clients/" + client["id"], json={"verdict": "green"}, headers=headers
        ).status_code
        == 422
    )
    assert (
        api.patch("/clients/" + client["id"], json={"icd10": ["N18.5"]}, headers=headers).json()[
            "error"
        ]
        == "outside_matrix"
    )
    assert (
        api.post("/clients/" + client["id"] + "/tokens/revoke", headers=headers).status_code == 200
    )
    assert api.get("/sessions/" + sid).status_code == 409
    assert api.post("/floor/arrive", json={"token": client["token"]}).status_code == 401


def test_scan_checkout_fifo_and_reports(api, db):
    sid = arrive(api)
    assert "legal_name" not in api.get("/sessions/" + sid).json()
    assert arrive(api) == sid
    food = banana(api, sid)
    assert food["verdict"] == "green"
    pid = food["product"]["id"]
    assert (
        api.post("/scan", json={"session_id": sid, "internal_code": "missing"}).json()["product"]
        is None
    )
    assert (
        api.post("/scan", json={"session_id": sid, "internal_code": "P-171354"}).json()["verdict"]
        == "red"
    )
    assert banana(api, arrive(api, "luis"))["verdict"] == "red"
    assert banana(api, arrive(api, "james"))["verdict"] == "green"
    assert api.post("/cart/lines", json={"session_id": sid, "product_id": pid}).status_code == 200
    r = api.post("/checkout", json={"session_id": sid}, headers=auth(api))
    assert r.status_code == 200, r.text
    sold = r.json()[0]
    lot = db.execute("SELECT * FROM lots WHERE id=%s", (sold["lot_id"],)).fetchone()
    assert lot["qty"] == 0
    assert db.execute(
        "SELECT expires_on>CURRENT_DATE AS valid FROM lots WHERE id=%s", (sold["lot_id"],)
    ).fetchone()["valid"]
    assert api.get("/sessions/" + sid).status_code == 409
    assert api.post("/checkout", json={"session_id": sid}, headers=auth(api)).status_code == 409
    r = api.get("/reports/dispensed?from=2020-01-01&to=2030-01-01", headers=auth(api, "partner"))
    assert r.status_code == 200 and set(r.json()[0]) == {
        "day",
        "tier_id",
        "grant_id",
        "units",
        "pounds",
    }


def test_concurrent_last_unit_and_rollback(api, db):
    s1, s2 = arrive(api), arrive(api, "james")
    pid = banana(api, s1)["product"]["id"]
    db.execute("UPDATE lots SET qty=0 WHERE product_id=%s", (pid,))
    db.execute(
        "UPDATE lots SET qty=1 WHERE id=(SELECT id FROM lots WHERE product_id=%s AND expires_on>CURRENT_DATE ORDER BY arrived_on LIMIT 1)",
        (pid,),
    )
    for sid in (s1, s2):
        assert (
            api.post("/cart/lines", json={"session_id": sid, "product_id": pid}).status_code == 200
        )
    headers = auth(api)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda sid: api.post("/checkout", json={"session_id": sid}, headers=headers),
                (s1, s2),
            )
        )
    assert sorted(r.status_code for r in results) == [200, 409], [
        (r.status_code, r.text) for r in results
    ]
    assert next(r for r in results if r.status_code == 409).json()["error"] == "out_of_stock"
    assert db.execute("SELECT min(qty) AS n FROM lots").fetchone()["n"] >= 0
    assert db.execute("SELECT sum(qty) AS n FROM checkout_ledger").fetchone()["n"] == 1


def test_checkout_revalidates_clinical_change(api, db):
    sid = arrive(api)
    pid = banana(api, sid)["product"]["id"]
    api.post("/cart/lines", json={"session_id": sid, "product_id": pid})
    before = db.execute("SELECT sum(qty) AS n FROM lots").fetchone()["n"]
    cid = db.execute("SELECT client_id FROM sessions WHERE id=%s", (sid,)).fetchone()["client_id"]
    assert (
        api.patch(
            "/clients/" + str(cid), json={"k_limit_ordered": True}, headers=auth(api, "doctor")
        ).status_code
        == 200
    )
    r = api.post("/checkout", json={"session_id": sid}, headers=auth(api))
    assert r.status_code == 409 and r.json()["error"] == "red_in_cart"
    assert db.execute("SELECT sum(qty) AS n FROM lots").fetchone()["n"] == before


def test_floor_queue_expiry_reissue(api, db):
    db.execute("UPDATE warehouse_limits SET max_floor=1,max_queue=1")
    s1 = arrive(api)
    s2 = arrive(api, "james")
    assert api.get("/sessions/" + s2).json()["status"] == "queued"
    assert (
        api.post("/floor/arrive", json={"token": api.cards["helen"]}).json()["error"]
        == "floor_full"
    )
    db.execute("UPDATE sessions SET lease_expires_at=now()-interval '1 minute' WHERE id=%s", (s1,))
    assert api.get("/sessions/" + s2).json()["status"] == "active"
    cid = db.execute("SELECT client_id FROM sessions WHERE id=%s", (s2,)).fetchone()["client_id"]
    r = api.post("/staff/reissue", json={"client_id": str(cid)}, headers=auth(api))
    assert r.status_code == 200, r.text
    assert api.get("/sessions/" + s2).status_code == 409
    assert api.post("/floor/arrive", json={"token": api.cards["james"]}).status_code == 401
    assert api.post("/floor/arrive", json={"token": r.json()["token"]}).status_code == 200


def test_seed_catalog_is_repeatable_and_covers_requirements(api, db):
    from seed.enrich import missing_classes
    from seed.load import initialize, seed

    before = db.execute("SELECT count(*) AS n FROM products").fetchone()["n"]
    assert before >= 100
    assert missing_classes(db.execute("SELECT * FROM products").fetchall()) == []
    token_count = db.execute("SELECT count(*) AS n FROM enrollment_tokens").fetchone()["n"]
    with db.transaction():
        initialize(db)
        assert seed(db) == []
    assert db.execute("SELECT count(*) AS n FROM products").fetchone()["n"] == before
    assert db.execute("SELECT count(*) AS n FROM enrollment_tokens").fetchone()["n"] == token_count


def test_all_roles_cannot_cross_route_boundaries(api):
    paths = {
        "/admin/users": {"admin"},
        "/clients": {"admin", "doctor"},
        "/floor/board": {"admin", "staff"},
        "/lots": {"admin", "staff"},
        "/inventory": {"admin", "staff"},
        "/rules": {"admin", "doctor"},
        "/me/profile": {"maria"},
        "/me/visits": {"maria"},
        "/products": {"admin", "doctor", "staff"},
        "/reports/dispensed?from=2020-01-01&to=2030-01-01": {"admin", "partner"},
    }
    for role in ("admin", "doctor", "staff", "partner", "maria"):
        headers = auth(api, role)
        for path, allowed in paths.items():
            response = api.get(path, headers=headers)
            assert response.status_code == (200 if role in allowed else 403), (
                role,
                path,
                response.text,
            )
