import json
from datetime import date, timedelta

from app.auth import hasher
from app.db import DOCS
from seed.load import load_products

PASSWORD = "nest-local-demo"
GOLDEN = json.loads((DOCS / "golden.json").read_text())


def add_user(db, email, role):
    return db.execute(
        """
        INSERT INTO users (email, password_hash, role)
        VALUES (%s, %s, %s) RETURNING id
        """,
        (email, hasher().hash(PASSWORD), role),
    ).fetchone()["id"]


def bearer(client, email):
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def enroll(client, headers, **overrides):
    body = {
        "legal_name": "Maria Alvarez",
        "phone": "555-0100",
        "email": "maria@demo.local",
        "password": PASSWORD,
        "household_size": 3,
        "icd10": ["E11.9", "I10"],
        "allergens": [],
        "k_limit_ordered": False,
    }
    body.update(overrides)
    res = client.post("/clients", headers=headers, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_enroll_arrive_and_golden_scans(client, db):
    add_user(db, "doctor@demo.local", "doctor")
    headers = bearer(client, "doctor@demo.local")
    load_products(db, GOLDEN["foods"])
    made = {}
    for persona in GOLDEN["personas"]:
        made[persona["key"]] = enroll(
            client,
            headers,
            legal_name=persona["legal_name"],
            email=persona["email"],
            household_size=persona["household_size"],
            icd10=persona["icd10"],
            allergens=persona["allergens"],
            k_limit_ordered=persona["k_limit_ordered"],
            phone="555-0199",
        )
        assert "card_token" in made[persona["key"]]
        assert made[persona["key"]]["tier_id"] == persona["tier"]
    listed = client.get("/clients", headers=headers).json()
    assert all("card_token" not in row for row in listed)
    maria = made["maria"]
    first = client.post("/floor/arrive", json={"token": maria["card_token"]})
    second = client.post("/floor/arrive", json={"token": maria["card_token"]})
    assert first.status_code == 200, first.text
    assert first.json()["session_id"] == second.json()["session_id"]
    assert first.json()["tier_id"] == "T4"
    assert first.json()["status"] == "active"
    assert "legal_name" not in first.json()
    session_id = first.json()["session_id"]
    foods = {food["key"]: food for food in GOLDEN["foods"]}
    banana = client.post(
        "/scan",
        json={"session_id": session_id, "internal_code": foods["banana"]["internal_code"]},
    )
    juice = client.post(
        "/scan",
        json={"session_id": session_id, "internal_code": foods["orange_juice"]["internal_code"]},
    )
    assert banana.json()["verdict"] == "green"
    assert juice.json()["verdict"] == "red"
    assert juice.json()["product"]["sodium_mg"] == 0
    assert juice.json()["product"]["added_sugar_g"] is None
    unknown = client.post("/scan", json={"session_id": session_id, "barcode": "0000000000000"})
    assert unknown.json()["verdict"] == "unknown"
    assert unknown.json()["product"] is None
    james = client.post("/floor/arrive", json={"token": made["james"]["card_token"]}).json()
    luis = client.post("/floor/arrive", json={"token": made["luis"]["card_token"]}).json()
    assert (
        client.post(
            "/scan", json={"session_id": james["session_id"], "internal_code": "P-173944"}
        ).json()["verdict"]
        == "green"
    )
    assert (
        client.post(
            "/scan", json={"session_id": luis["session_id"], "internal_code": "P-173944"}
        ).json()["verdict"]
        == "red"
    )
    bad = client.post("/floor/arrive", json={"token": "not-a-card"})
    assert bad.status_code == 401
    assert bad.json()["message"] == "please see a volunteer"


def test_red_and_unknown_do_not_enter_the_cart(client, db):
    add_user(db, "doctor@demo.local", "doctor")
    headers = bearer(client, "doctor@demo.local")
    load_products(db, GOLDEN["foods"])
    maria = enroll(client, headers)
    session_id = client.post("/floor/arrive", json={"token": maria["card_token"]}).json()[
        "session_id"
    ]
    juice = db.execute("SELECT id FROM products WHERE internal_code = 'P-171354'").fetchone()
    banana = db.execute("SELECT id FROM products WHERE internal_code = 'P-173944'").fetchone()
    refused = client.post(
        "/cart/lines", json={"session_id": session_id, "product_id": str(juice["id"])}
    )
    assert refused.status_code == 409
    assert refused.json()["error"] == "not_eligible"
    assert db.execute("SELECT COUNT(*) AS n FROM cart_lines").fetchone()["n"] == 0
    added = client.post(
        "/cart/lines", json={"session_id": session_id, "product_id": str(banana["id"])}
    )
    assert added.status_code == 200
    assert added.json()["verdict"] == "green"
    assert added.json()["sodium_mg"] == 1
    gone = client.delete(f"/cart/lines/{banana['id']}", params={"session_id": session_id})
    assert gone.json() == {"ok": True}


def test_checkout_sells_one_lot_and_stops_at_zero(client, db):
    add_user(db, "doctor@demo.local", "doctor")
    add_user(db, "staff@demo.local", "warehouse_staff")
    doctor = bearer(client, "doctor@demo.local")
    staff = bearer(client, "staff@demo.local")
    person = enroll(
        client,
        doctor,
        email="buyer@demo.local",
        legal_name="Buyer One",
        icd10=["I10"],
        household_size=1,
    )
    product = db.execute(
        """
        INSERT INTO products (
          name, source, sodium_mg, potassium_mg, phosphorus_mg, added_sugar_g,
          is_drink, is_juice, allergen_tags
        ) VALUES ('Rice', 'test', 10, 10, 10, 0, false, false, '{}')
        RETURNING id
        """
    ).fetchone()
    today = date.today()
    expired = db.execute(
        """
        INSERT INTO lots (product_id, grant_id, arrived_on, expires_on, qty)
        VALUES (%s, 'grant-b', %s, %s, 5) RETURNING id
        """,
        (product["id"], today - timedelta(days=30), today - timedelta(days=1)),
    ).fetchone()
    fresh = db.execute(
        """
        INSERT INTO lots (product_id, grant_id, arrived_on, expires_on, qty)
        VALUES (%s, 'grant-b', %s, %s, 1) RETURNING id
        """,
        (product["id"], today - timedelta(days=2), today + timedelta(days=10)),
    ).fetchone()
    session_id = client.post("/floor/arrive", json={"token": person["card_token"]}).json()[
        "session_id"
    ]
    added = client.post(
        "/cart/lines", json={"session_id": session_id, "product_id": str(product["id"])}
    )
    assert added.status_code == 200, added.text
    first = client.post(
        "/checkout?response_format=summary", headers=staff, json={"session_id": session_id}
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "closed"
    assert db.execute("SELECT qty FROM lots WHERE id = %s", (fresh["id"],)).fetchone()["qty"] == 0
    assert db.execute("SELECT qty FROM lots WHERE id = %s", (expired["id"],)).fetchone()["qty"] == 5
    person2 = enroll(
        client,
        doctor,
        email="buyer2@demo.local",
        legal_name="Buyer Two",
        icd10=["I10"],
        household_size=1,
    )
    session2 = client.post("/floor/arrive", json={"token": person2["card_token"]}).json()[
        "session_id"
    ]
    db.execute(
        """
        INSERT INTO cart_lines (session_id, product_id, qty, verdict)
        VALUES (%s, %s, 1, 'green')
        """,
        (session2, product["id"]),
    )
    second = client.post("/checkout", headers=staff, json={"session_id": session2})
    assert second.status_code == 409
    assert second.json()["error"] == "out_of_stock"
    assert db.execute("SELECT qty FROM lots WHERE id = %s", (fresh["id"],)).fetchone()["qty"] == 0


def test_red_line_sells_nothing(client, db):
    add_user(db, "doctor@demo.local", "doctor")
    add_user(db, "staff@demo.local", "warehouse_staff")
    doctor = bearer(client, "doctor@demo.local")
    staff = bearer(client, "staff@demo.local")
    person = enroll(client, doctor, email="red@demo.local", legal_name="Red Buyer")
    product = db.execute(
        """
        INSERT INTO products (
          name, source, sodium_mg, added_sugar_g, is_drink, is_juice, allergen_tags
        ) VALUES ('Rice', 'test', 10, 0, false, false, '{}')
        RETURNING id
        """
    ).fetchone()
    lot = db.execute(
        """
        INSERT INTO lots (product_id, grant_id, arrived_on, expires_on, qty)
        VALUES (%s, 'grant-b', %s, %s, 1) RETURNING id
        """,
        (product["id"], date.today(), date.today() + timedelta(days=10)),
    ).fetchone()
    session_id = client.post("/floor/arrive", json={"token": person["card_token"]}).json()[
        "session_id"
    ]
    db.execute(
        """
        INSERT INTO cart_lines (session_id, product_id, qty, verdict)
        VALUES (%s, %s, 1, 'green')
        """,
        (session_id, product["id"]),
    )
    db.execute("UPDATE products SET sodium_mg = 900 WHERE id = %s", (product["id"],))
    res = client.post("/checkout", headers=staff, json={"session_id": session_id})
    assert res.status_code == 409
    assert res.json()["error"] == "red_in_cart"
    assert db.execute("SELECT qty FROM lots WHERE id = %s", (lot["id"],)).fetchone()["qty"] == 1


def test_floor_full_and_queue(client, db):
    db.execute("UPDATE warehouse_limits SET max_floor = 1, max_queue = 1 WHERE id = 1")
    add_user(db, "doctor@demo.local", "doctor")
    headers = bearer(client, "doctor@demo.local")
    tokens = []
    for i in range(3):
        row = enroll(
            client,
            headers,
            email=f"p{i}@demo.local",
            legal_name=f"Person {i}",
            icd10=["I10"],
            household_size=1,
        )
        tokens.append(row["card_token"])
    first = client.post("/floor/arrive", json={"token": tokens[0]})
    second = client.post("/floor/arrive", json={"token": tokens[1]})
    third = client.post("/floor/arrive", json={"token": tokens[2]})
    assert first.json()["status"] == "active"
    assert second.json()["status"] == "queued"
    assert third.status_code == 409
    assert third.json() == {"error": "floor_full", "message": "please see a volunteer"}


def test_outside_matrix_and_rules_include_rd_confirm(client, db):
    add_user(db, "doctor@demo.local", "doctor")
    headers = bearer(client, "doctor@demo.local")
    res = client.post(
        "/clients",
        headers=headers,
        json={
            "legal_name": "Dialysis",
            "phone": "555-0100",
            "email": "dial@demo.local",
            "password": PASSWORD,
            "household_size": 1,
            "icd10": ["N18.5"],
            "allergens": [],
            "k_limit_ordered": False,
        },
    )
    assert res.status_code == 422
    assert res.json()["error"] == "outside_matrix"
    assert db.execute("SELECT COUNT(*) AS n FROM clients").fetchone()["n"] == 0
    rules = client.get("/rules", headers=headers)
    assert rules.status_code == 200
    assert any(row["rd_confirm"] is True for row in rules.json())
    patched = enroll(client, headers)
    bad = client.patch(f"/clients/{patched['id']}", headers=headers, json={"verdict": "green"})
    assert bad.status_code == 422
