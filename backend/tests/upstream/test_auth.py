import base64
import json
from datetime import date, datetime, timedelta, timezone

import jwt

from app.auth import TOKEN_SECONDS, hasher

PASSWORD = "nest-local-demo"


def add_user(db, email, role, password=PASSWORD, disabled=False):
    return db.execute(
        """
        INSERT INTO users (email, password_hash, role, disabled)
        VALUES (%s, %s, %s, %s) RETURNING id
        """,
        (email, hasher().hash(password), role, disabled),
    ).fetchone()["id"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def login(client, email, password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_health_needs_no_token(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_login_shape_and_claims(client, db):
    user_id = add_user(db, "staff@demo.local", "warehouse_staff")
    res = login(client, "staff@demo.local")
    assert res.status_code == 200
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["role"] == "warehouse_staff"
    assert body["expires_in"] == TOKEN_SECONDS
    payload = jwt.decode(
        body["access_token"], "test-jwt-secret-value-at-least-32b", algorithms=["HS256"]
    )
    assert payload["sub"] == str(user_id)
    assert payload["role"] == "warehouse_staff"
    assert payload["email"] == "staff@demo.local"
    remaining = payload["exp"] - datetime.now(timezone.utc).timestamp()
    assert 7 * 3600 < remaining <= TOKEN_SECONDS


def test_failed_login_messages_match(client, db):
    add_user(db, "staff@demo.local", "warehouse_staff")
    add_user(db, "gone@demo.local", "admin", disabled=True)
    wrong = login(client, "staff@demo.local", "not-the-password")
    missing = login(client, "nobody@demo.local")
    disabled = login(client, "gone@demo.local")
    assert wrong.status_code == missing.status_code == disabled.status_code == 401
    assert wrong.json() == missing.json() == disabled.json()
    assert wrong.json()["message"] == "invalid email or password"


def test_password_hash_is_not_the_raw_password(db):
    add_user(db, "staff@demo.local", "warehouse_staff")
    row = db.execute(
        "SELECT password_hash FROM users WHERE email = %s", ("staff@demo.local",)
    ).fetchone()
    assert row["password_hash"] != PASSWORD
    assert hasher().verify(PASSWORD, row["password_hash"])


def test_me_and_change_password(client, db):
    add_user(db, "doctor@demo.local", "doctor")
    token = login(client, "doctor@demo.local").json()["access_token"]
    me = client.get("/auth/me", headers=auth(token))
    assert me.status_code == 200
    assert set(me.json()) == {"id", "email", "role"}
    assert me.json()["role"] == "doctor"
    short = client.post(
        "/auth/change-password",
        headers=auth(token),
        json={"current_password": PASSWORD, "new_password": "short"},
    )
    assert short.status_code == 422
    bad = client.post(
        "/auth/change-password",
        headers=auth(token),
        json={"current_password": "nope-nope", "new_password": "newer-password"},
    )
    assert bad.status_code == 401
    ok = client.post(
        "/auth/change-password",
        headers=auth(token),
        json={"current_password": PASSWORD, "new_password": "newer-password"},
    )
    assert ok.status_code == 200
    assert login(client, "doctor@demo.local", "newer-password").status_code == 200


def test_bad_signature_and_alg_none_are_401(client, db):
    add_user(db, "admin@demo.local", "admin")
    bad = jwt.encode(
        {"sub": "x", "role": "admin", "email": "admin@demo.local"},
        "other-secret",
        algorithm="HS256",
    )
    assert client.get("/auth/me", headers=auth(bad)).status_code == 401

    def b64(obj):
        raw = json.dumps(obj, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    none = (
        b64({"alg": "none", "typ": "JWT"})
        + "."
        + b64({"sub": "x", "role": "admin", "email": "a@b.c"})
        + "."
    )
    assert client.get("/auth/me", headers=auth(none)).status_code == 401
    assert client.get("/clients").status_code == 401


def test_each_role_is_forbidden_on_someone_elses_route(client, db):
    tokens = {}
    for role, email in (
        ("doctor", "doctor@demo.local"),
        ("client", "client@demo.local"),
        ("warehouse_staff", "staff@demo.local"),
        ("admin", "admin@demo.local"),
        ("community_partner", "partner@demo.local"),
    ):
        add_user(db, email, role)
        tokens[role] = login(client, email).json()["access_token"]
    checks = (
        ("community_partner", "get", "/clients"),
        ("client", "get", "/clients"),
        ("doctor", "post", "/checkout"),
        ("warehouse_staff", "get", "/reports/dispensed?from=2026-01-01&to=2026-01-02"),
        ("doctor", "get", "/admin/users"),
        ("warehouse_staff", "get", "/rules"),
        ("client", "get", "/floor/board"),
        ("warehouse_staff", "get", "/me/profile"),
        ("community_partner", "post", "/clients"),
    )
    client_body = {
        "legal_name": "Nope",
        "phone": "555-0100",
        "email": "nope@demo.local",
        "password": PASSWORD,
        "household_size": 1,
        "icd10": ["I10"],
        "allergens": [],
        "k_limit_ordered": False,
    }
    for role, method, path in checks:
        kwargs = {"headers": auth(tokens[role])}
        if method == "post" and path == "/checkout":
            kwargs["json"] = {"session_id": "00000000-0000-0000-0000-000000000001"}
        elif method == "post":
            kwargs["json"] = client_body
        res = getattr(client, method)(path, **kwargs)
        assert res.status_code == 403, (role, path, res.status_code, res.text)
        assert res.json()["error"] == "forbidden"


def test_partner_report_has_only_the_five_fields(client, db):
    add_user(db, "partner@demo.local", "community_partner")
    product = db.execute(
        """
        INSERT INTO products (name, source, net_weight_g)
        VALUES ('Oats', 'test', 453.59237) RETURNING id
        """
    ).fetchone()
    lot = db.execute(
        """
        INSERT INTO lots (product_id, grant_id, arrived_on, expires_on, qty)
        VALUES (%s, 'grant-b', %s, %s, 1) RETURNING id
        """,
        (product["id"], date.today(), date.today() + timedelta(days=10)),
    ).fetchone()
    client_user = add_user(db, "maria@demo.local", "client")
    person = db.execute(
        """
        INSERT INTO clients (
          user_id, legal_name_enc, name_hmac, household_size, tier_id, dm, htn, ckd34
        ) VALUES (
          %s, pgp_sym_encrypt('Maria', 'test-phi-key-value'),
          hmac(convert_to('maria', 'UTF8'), convert_to('test-hmac-key-value', 'UTF8'), 'sha256'),
          1, 'T1', true, false, false
        ) RETURNING id
        """,
        (client_user,),
    ).fetchone()
    session = db.execute(
        """
        INSERT INTO sessions (
          client_id, status, tier_id, dm, htn, ckd34, k_limit_ordered, household_size
        ) VALUES (%s, 'closed', 'T1', true, false, false, false, 1) RETURNING id
        """,
        (person["id"],),
    ).fetchone()
    db.execute(
        """
        INSERT INTO checkout_ledger (session_id, lot_id, product_id, grant_id, tier_id, qty)
        VALUES (%s, %s, %s, 'grant-b', 'T1', 1)
        """,
        (session["id"], lot["id"], product["id"]),
    )
    token = login(client, "partner@demo.local").json()["access_token"]
    day = date.today().isoformat()
    res = client.get(f"/reports/dispensed?from={day}&to={day}", headers=auth(token))
    assert res.status_code == 200
    rows = res.json()
    assert rows
    assert set(rows[0]) == {"day", "tier_id", "grant_id", "units", "pounds"}
    assert client.get("/clients", headers=auth(token)).status_code == 403
