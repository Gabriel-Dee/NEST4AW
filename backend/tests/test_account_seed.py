import pytest

from app.auth import password_hash
from seed.accounts import account_plan, create_accounts


def test_account_plan():
    plan = account_plan()
    assert len(plan) == 9
    assert {row["role"] for row in plan} == {
        "admin",
        "doctor",
        "warehouse_staff",
        "community_partner",
        "client",
    }
    assert all(row["email"].endswith("@epic.com") for row in plan)
    assert sum(row["role"] == "client" for row in plan) == 5
    with pytest.raises(ValueError):
        account_plan("@epic.com")


def test_account_seed_login_profiles_and_repeat_safety(api, db):
    password = "Synthetic-Seed-Test-Only-2026"
    stock_before = db.execute("SELECT sum(qty) AS n FROM lots").fetchone()["n"]
    with db.transaction():
        result = create_accounts(db, password)
    assert len(result) == 9 and all(row["result"] == "created" for row in result)
    for account in result:
        response = api.post("/auth/login", json={"email": account["email"], "password": password})
        assert response.status_code == 200, response.text
        assert response.json()["role"] == account["role"]
        if account["role"] == "client":
            profile = api.get(
                "/me/profile",
                headers={"Authorization": "Bearer " + response.json()["access_token"]},
            )
            assert profile.json()["id"] == account["client_id"]
            arrival = api.post("/floor/arrive", json={"token": account["card_token"]})
            assert arrival.status_code == 200, arrival.text
    tokens_before = db.execute("SELECT count(*) AS n FROM enrollment_tokens").fetchone()["n"]
    db.execute("UPDATE users SET disabled=true WHERE email='partner@epic.com'")
    with db.transaction():
        again = create_accounts(db, "Another-Unused-Password-2026")
    assert all(row["result"] == "unchanged" and "card_token" not in row for row in again)
    assert next(row for row in again if row["email"] == "partner@epic.com")["disabled"] is True
    assert (
        db.execute("SELECT count(*) AS n FROM enrollment_tokens").fetchone()["n"] == tokens_before
    )
    assert db.execute("SELECT sum(qty) AS n FROM lots").fetchone()["n"] == stock_before
    stored = db.execute("SELECT password_hash FROM users WHERE email='admin@epic.com'").fetchone()[
        "password_hash"
    ]
    assert password_hash.verify(password, stored)
    assert not password_hash.verify("Another-Unused-Password-2026", stored)


def test_account_seed_conflict_rolls_back(api, db):
    db.execute(
        "INSERT INTO users(email,password_hash,role) VALUES('maria@epic.com',%s,'doctor')",
        (password_hash.hash("Existing-Test-Password"),),
    )
    with pytest.raises(ValueError, match="already has role"):
        with db.transaction():
            create_accounts(db, "Synthetic-Seed-Test-Only-2026")
    assert (
        db.execute("SELECT count(*) AS n FROM users WHERE email LIKE '%%@epic.com'").fetchone()["n"]
        == 1
    )
