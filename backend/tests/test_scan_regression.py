"""Regression: a self-registered T2D + nut-allergy client saw every scan as red.

Root cause: Open Food Facts files nearly all plant foods under
"en:plant-based-foods-and-beverages", and a substring match on "beverages" marked oats,
bread and peanut butter as drinks, so SUG_DRINK turned them red. Water was red too.
"""

from app.services import nutrition


def person(**kw):
    base = {"dm": True, "htn": False, "ckd34": False, "k_limit_ordered": False, "allergens": ["peanuts"]}
    return {**base, **kw}


def test_off_plant_foods_are_not_drinks():
    oats = {"code": "030000010402", "categories_tags": ["en:plant-based-foods-and-beverages", "en:rolled-oats"]}
    water = {"code": "1", "categories_tags": ["en:beverages", "en:waters"]}
    oj = {"code": "2", "categories_tags": ["en:beverages", "en:fruit-juices", "en:orange-juices"]}
    assert nutrition.from_off(oats)["is_drink"] is False
    assert nutrition.from_off(water)["is_drink"] is True
    assert nutrition.from_off(oj)["is_juice"] is True


def test_t2d_nut_allergy_client_rules(engine):
    p = person()
    oats = {"sodium_mg": 0, "added_sugar_g": 0, "sugar_g": 1, "ingredients": "whole grain rolled oats", "allergen_tags": []}
    assert engine.evaluate(p, oats)["verdict"] == "green"
    water = {"sodium_mg": 8, "added_sugar_g": 0, "sugar_g": None, "is_drink": True, "allergen_tags": [], "ingredients": "water"}
    assert engine.evaluate(p, water)["verdict"] == "green"
    no_sugar_data = {**water, "added_sugar_g": None}
    assert engine.evaluate(p, no_sugar_data)["verdict"] == "unknown"  # yellow "Ask a volunteer", never red
    # Bad OFF record: added sugar says 0 but the label has 26.5 g sugar. Must stay red.
    coke = {"sodium_mg": 0, "added_sugar_g": 0, "sugar_g": 26.5, "is_drink": True, "allergen_tags": [], "ingredients": "sugar"}
    result = engine.evaluate(p, coke)
    assert result["verdict"] == "red" and result["reasons"][0]["rule_id"] == "SUG_DRINK"
    juice = {"sodium_mg": 0, "added_sugar_g": 0, "sugar_g": 20, "is_drink": True, "is_juice": True, "allergen_tags": []}
    assert engine.evaluate(p, juice)["verdict"] == "red"
    pb = {"sodium_mg": 12, "added_sugar_g": 0, "allergen_tags": ["peanuts"], "ingredients": "peanuts"}
    result = engine.evaluate(p, pb)
    assert result["verdict"] == "red" and any(r["rule_id"] == "ALG" for r in result["reasons"])


def test_registered_client_scans_end_to_end(api, db):
    reg = api.post(
        "/api/v1/auth/register",
        json={
            "first_name": "Reg", "last_name": "Test", "email": "reg-t2d@test.local",
            "password": "pw-test-12345", "household_size": 1,
            "icd10_codes": ["E11.9"], "allergies": ["peanuts"],
        },
    )
    assert reg.status_code == 201, reg.text
    client = reg.json()["client"]
    assert client["dm"] and not client["ckd34"] and client["allergens"] == ["peanuts"]
    auth = {"Authorization": "Bearer " + reg.json()["access_token"]}
    epic = db.execute("SELECT * FROM stores WHERE slug='epic-cure'").fetchone()
    visit = api.post(f"/stores/{epic['id']}/check-in", headers=auth,
                     json={"lat": epic["lat"], "lng": epic["lng"], "accuracy_m": 5})
    assert visit.status_code == 200, visit.text
    headers = {**auth, "X-Visit-Token": visit.json()["visit_token"]}

    def level(code):
        r = api.post("/api/v1/scan", headers=headers, json={"code": code})
        assert r.status_code == 200, r.text
        return r.json()["status"]

    assert level("6111035000430")["level"] != "red"  # still water
    assert level("3229820019307")["level"] != "red"  # Flocons d'avoine (oats)
    peanut = level("3327272107969")  # 100% peanut butter
    assert peanut["level"] == "red" and peanut["reason"] == "ALG"
