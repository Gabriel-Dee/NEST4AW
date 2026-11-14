"""Regression coverage for the origin/main integration and preserved contracts."""

from app.rules import Item, Person, evaluate


def test_both_clinical_interfaces_reject_missing_allergen_evidence(engine):
    person = Person(False, True, False, False, ["milk"])
    item = Item(sodium_mg=0, allergen_tags=[], ingredients=None)
    assert evaluate(person, item, engine.rules).verdict == "unknown"
    assert (
        engine.evaluate(
            {"htn": True, "allergens": ["milk"]}, {"sodium_mg": 0, "allergen_tags": []}
        )["verdict"]
        == "unknown"
    )


def test_rule_table_color_is_used_by_both_interfaces(engine):
    from app.rules import RuleEngine

    rows = [
        {**row, **({"color": "red"} if key == "P_ADD" else {})} for key, row in engine.rules.items()
    ]
    changed = RuleEngine(rows)
    item = Item(sodium_mg=0, phosphorus_mg=1, ingredients="sodium phosphate")
    assert evaluate(Person(False, False, True, False, []), item, changed.rules).verdict == "red"


def test_upstream_entrypoint_and_router_imports(configured):
    import importlib

    from app.main import create_app

    application = importlib.import_module("app.main").app
    assert set(application.openapi()["paths"]) == set(create_app().openapi()["paths"])
    for name in (
        "admin",
        "auth",
        "cart",
        "checkout",
        "floor",
        "health",
        "lots",
        "me",
        "reports",
        "rules",
        "scan",
        "staff",
    ):
        module = importlib.import_module("app.routes." + name)
        assert module.router.routes


def test_response_compatibility_and_token_non_disclosure(api):
    from test_integration import auth

    headers = auth(api, "doctor")
    response = api.post(
        "/clients",
        headers=headers,
        json={
            "legal_name": "Merge Demo",
            "email": "merge@demo.local",
            "password": "nest-local-demo",
            "household_size": 1,
            "icd10": ["I10"],
            "allergens": [],
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["card_token"] == created["token"]
    assert created["email"] == "merge@demo.local"
    read = api.get("/clients/" + created["id"], headers=headers).json()
    assert "token" not in read and "card_token" not in read
    sid = api.post("/floor/arrive", json={"token": created["card_token"]}).json()["session_id"]
    board = api.get("/floor/board", headers=auth(api)).json()
    assert board["active"] == board["active_count"] == 1
    assert board["queued"] == board["queued_count"] == 0
    assert board["rows"][0]["session_id"] == sid
    scanned = api.post("/scan", json={"session_id": sid, "internal_code": "P-173944"}).json()
    added = api.post(
        "/cart/lines", json={"session_id": sid, "product_id": scanned["product"]["id"]}
    ).json()
    assert added["name"] == "Bananas, raw" and added["sodium_mg"] == 1
    rows = api.get("/cart", params={"session_id": sid}).json()
    summary = api.get("/cart", params={"session_id": sid, "response_format": "summary"}).json()
    assert summary["lines"] == rows
    checkout = api.post(
        "/checkout?response_format=summary", headers=auth(api), json={"session_id": sid}
    )
    assert checkout.status_code == 200, checkout.text
    assert (
        checkout.json()["status"] == "closed"
        and checkout.json()["lines"][0]["product_name"] == "Bananas, raw"
    )
    assert api.get("/cart", params={"session_id": sid}).json()["error"] == "session_inactive"
    assert (
        api.get("/cart", params={"session_id": sid, "response_format": "summary"}).json()["error"]
        == "session_not_active"
    )
