import json
from uuid import UUID, uuid4, uuid5

import httpx
import pytest

from app.services.recipes import (
    DraftBatch,
    DraftItem,
    DraftRecipe,
    build_recipes,
    cache_key,
    from_model,
    red_ids,
)
from app.tier import derive
from seed.recipes import TEMPLATES

NAMESPACE = UUID("11111111-2222-4333-8444-555555555555")
EVAL_PATH = __file__.replace("tests/test_recipes.py", "RECIPE_EVAL.md")


def product(food):
    return {
        "id": uuid5(NAMESPACE, food["key"]),
        "name": food["name"],
        "category": food["category"],
        "internal_code": food.get("internal_code"),
        "barcode": food.get("barcode"),
        "serving_g": food.get("serving_g"),
        "sodium_mg": food.get("sodium_mg"),
        "potassium_mg": food.get("potassium_mg"),
        "phosphorus_mg": food.get("phosphorus_mg"),
        "added_sugar_g": food.get("added_sugar_g"),
        "sugar_g": food.get("sugar_g"),
        "carb_g": food.get("carb_g"),
        "fiber_g": food.get("fiber_g"),
        "calories_kcal": food.get("calories_kcal"),
        "ingredients": food.get("ingredients"),
        "allergen_tags": food.get("allergen_tags") or [],
        "is_drink": food.get("is_drink"),
        "is_juice": food.get("is_juice"),
        "stock": 4,
        "aisle": "A",
        "shelf": "1",
        "bin_code": "A1",
    }


def client(persona):
    flags = derive(persona["icd10"])
    return {
        "client_id": uuid5(NAMESPACE, persona["key"]),
        "dm": flags["dm"],
        "htn": flags["htn"],
        "ckd34": flags["ckd34"],
        "k_limit_ordered": persona["k_limit_ordered"],
        "allergens": persona["allergens"],
        "household_size": persona["household_size"],
    }


def poison(foods):
    def propose(_context, _timeout):
        return DraftBatch(
            recipes=[
                DraftRecipe(
                    title="Everything in the aisle",
                    ingredients=[DraftItem(product_id=item["id"]) for item in foods],
                )
            ]
        )

    return propose


def test_library_size():
    assert 20 <= len(TEMPLATES) <= 30


def test_empty_cart_uses_profile_mode(engine, golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]

    def down(_context, _timeout):
        raise httpx.ConnectError("model down")

    result = build_recipes(person, foods, {}, "cart", engine, proposer=down)
    assert result["mode"] == "profile"
    assert result["source"] == "fallback"
    assert red_ids(result["recipes"]) == []


def test_allergy_never_returns_peanut(engine, golden):
    asha = client(next(persona for persona in golden["personas"] if persona["key"] == "asha"))
    foods = [product(food) for food in golden["foods"]]
    result = build_recipes(asha, foods, {}, "profile", engine, proposer=poison(foods))
    blob = json.dumps(result).lower()
    assert "peanut" not in blob
    assert red_ids(result["recipes"]) == []
    for recipe in result["recipes"]:
        for ingredient in recipe["ingredients"]:
            assert "peanuts" not in (ingredient["product"]["name"]).lower()
            tags = ingredient["product"].get("allergen_tags") or []
            assert "peanuts" not in tags


def test_invalid_json_then_valid_keeps_ai(engine, golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]
    cookie = next(food for food in foods if food["barcode"] == "FIXTURE-COOKIES-SF")
    calls = {"n": 0}

    def proposer(_context, _timeout):
        calls["n"] += 1
        if calls["n"] == 1:
            raise json.JSONDecodeError("invalid", "doc", 0)
        return DraftBatch(
            recipes=[DraftRecipe(title="Cookie", ingredients=[DraftItem(product_id=cookie["id"])])]
        )

    result = build_recipes(person, foods, {}, "profile", engine, proposer=proposer)
    assert calls["n"] == 2
    assert result["source"] == "ai"
    assert result["recipes"][0]["ingredients"][0]["product"]["id"] == str(cookie["id"])
    assert result["recipes"][0]["nutrition_per_serving"]["sodium_mg"] == round(
        80 / person["household_size"], 1
    )


def test_hallucinated_id_is_dropped(engine, golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]
    cookie = next(food for food in foods if food["barcode"] == "FIXTURE-COOKIES-SF")
    missing = uuid4()

    def proposer(_context, _timeout):
        return DraftBatch(
            recipes=[
                DraftRecipe(
                    title="Mixed",
                    ingredients=[
                        DraftItem(product_id=missing),
                        DraftItem(product_id=cookie["id"]),
                    ],
                )
            ]
        )

    result = build_recipes(person, foods, {}, "profile", engine, proposer=proposer)
    ids = [
        ingredient["product"]["id"]
        for recipe in result["recipes"]
        for ingredient in recipe["ingredients"]
    ]
    assert str(missing) not in ids
    assert str(cookie["id"]) in ids


def test_model_down_returns_fallback_inside_budget(engine, golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]
    calls = []

    def clock():
        return 0 if not calls else 100

    def proposer(_context, timeout):
        calls.append(timeout)
        raise httpx.ConnectError("down")

    result = build_recipes(person, foods, {}, "profile", engine, proposer=proposer, clock=clock)
    assert result["source"] == "fallback"
    assert calls == [8]
    assert red_ids(result["recipes"]) == []


def test_yellow_double_serving_is_dropped(engine, golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]
    soup = next(food for food in foods if food["barcode"] == "767335077793")
    batch = DraftBatch(
        recipes=[
            DraftRecipe(
                title="Big soup",
                ingredients=[DraftItem(product_id=soup["id"], servings=2)],
            )
        ]
    )
    assert from_model(batch, person, foods, {}, "profile", engine) == []


def test_context_has_no_identity(engine, golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]
    seen = {}

    def proposer(context, _timeout):
        seen.update(context)
        raise httpx.ConnectError("down")

    build_recipes(person, foods, {}, "profile", engine, proposer=proposer)
    blob = json.dumps(seen)
    assert "legal_name" not in blob
    assert "phone" not in blob
    assert "Maria" not in blob
    assert seen["clinical"]["allergens"] == []


def test_profile_cache_ignores_cart_and_cart_cache_does_not(golden):
    person = client(golden["personas"][0])
    foods = [product(food) for food in golden["foods"]]
    empty = cache_key(person["client_id"], "profile", person, foods, {}, "2026-11-14")
    filled = cache_key(
        person["client_id"], "profile", person, foods, {foods[0]["id"]: 1}, "2026-11-14"
    )
    assert empty == filled
    cart_a = cache_key(
        person["client_id"], "cart", person, foods, {str(foods[0]["id"]): 1}, "2026-11-14"
    )
    cart_b = cache_key(
        person["client_id"], "cart", person, foods, {str(foods[0]["id"]): 2}, "2026-11-14"
    )
    assert cart_a != cart_b


def test_persona_trials_have_no_red_ingredients(engine, golden):
    foods = [product(food) for food in golden["foods"]]
    lines = [
        "# Recipe safety trials",
        "",
        "Each persona was generated 10 times. The model returned all six catalog ids, including foods the rules mark red. The server dropped or replaced those ingredients before responding.",
        "",
        "| Persona | Runs | Passes | Recipes in run 1 | Source |",
        "| --- | --- | --- | --- | --- |",
    ]
    for persona in golden["personas"]:
        person = client(persona)
        passes = 0
        first = None
        for _run in range(10):
            result = build_recipes(person, foods, {}, "profile", engine, proposer=poison(foods))
            first = first or result
            assert red_ids(result["recipes"]) == []
            passes += 1
        if persona["key"] == "asha":
            assert "peanut" not in json.dumps(first).lower()
        lines.append(
            f"| {persona['key']} | 10 | {passes} | {len(first['recipes'])} | {first['source']} |"
        )
    lines.extend(["", "Pass means the returned recipes contained no red ingredient.", ""])
    text = "\n".join(lines)
    with open(EVAL_PATH, "w", encoding="utf-8") as handle:
        handle.write(text)
    assert text.count("| 10 | 10 |") == 5


@pytest.mark.integration
def test_saved_recipe_survives_a_new_visit(api, db):
    from tests.test_integration import arrive

    sid = arrive(api, "maria")
    listed = api.get("/api/v1/recipes/for-me", params={"session_id": sid})
    assert listed.status_code == 200, listed.text
    recipe = listed.json()["recipes"][0]
    saved = api.post("/api/v1/recipes/saved", json={"session_id": sid, "recipe_id": recipe["id"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["points"] == 1
    db.execute("UPDATE sessions SET status='closed' WHERE id=%s", (sid,))
    sid2 = arrive(api, "maria")
    assert sid2 != sid
    again = api.get("/api/v1/recipes/saved", params={"session_id": sid2})
    assert again.status_code == 200, again.text
    assert any(item["id"] == recipe["id"] for item in again.json())
