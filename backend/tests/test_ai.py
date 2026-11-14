import io
import uuid

import httpx
import pytest
from PIL import Image

from app.errors import APIError
from app.services import llm, nutrition, ocr


def test_ocr_parser_actual_units_and_missing():
    lines = [
        {
            "text": "Serving size 30 g\nSodium 0.12 g\nPotassium 80 mg\nIncludes 2 g Added Sugars\nIngredients: oats, milk",
            "confidence": 0.98,
        }
    ]
    result = ocr.parse_label(lines)
    assert result["sodium_mg"] == 120
    assert result["added_sugar_g"] == 2
    assert result["phosphorus_mg"] is None
    assert result["serving_g"] == 30
    assert "milk" in result["ingredients"]
    assert ocr.parse_label([{"text": "Sodium 10 %", "confidence": 0.2}])["sodium_mg"] is None
    conflict = ocr.parse_label([{"text": "Sodium 10 mg\nSodium 20 mg", "confidence": 0.9}])
    assert conflict["sodium_mg"] is None and conflict["warnings"]


def test_image_validation_and_blank():
    with pytest.raises(APIError):
        ocr.validate_image(b"not an image")
    with pytest.raises(APIError):
        ocr.validate_image(b"x" * (ocr.MAX_BYTES + 1))
    buffer = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(buffer, format="PNG")
    assert ocr.barcodes(ocr.validate_image(buffer.getvalue())) == []
    assert ocr.parse_label([])["confidence"] == 0


def test_nutrition_units():
    data = {
        "code": "1234567890123",
        "serving_size": "30 g",
        "nutriments": {"sodium_100g": 0.5, "sodium_unit": "g", "potassium_100g": 200},
    }
    p = nutrition.from_off(data)
    assert p["sodium_mg"] == 150 and p["potassium_mg"] is None
    assert p["phosphorus_mg"] is None
    assert nutrition.convert(float("nan"), "mg", "mg") is None
    p = nutrition.from_fdc(
        {
            "fdcId": 1,
            "description": "test",
            "servingSize": 30,
            "servingSizeUnit": "g",
            "foodNutrients": [
                {"nutrient": {"name": "Sodium, Na", "unitName": "mg"}, "amount": 100}
            ],
        }
    )
    assert p["sodium_mg"] == 30 and p["added_sugar_g"] is None


@pytest.fixture
def safe_food():
    return {
        "id": str(uuid.uuid4()),
        "name": "Test food",
        "stock": 2,
        "serving_g": 30,
        "ingredients": "oats",
        "sodium_mg": 0,
        "added_sugar_g": 0,
        "phosphorus_mg": 1,
    }


def test_llm_validation(engine, safe_food):
    pid = safe_food["id"]
    products = {pid: safe_food}
    person = {"dm": True}
    proposal = llm.Proposal(
        recommendations=[{"product_id": pid, "suggested_quantity": 1}], recipes=[]
    )
    assert llm.validate_proposal(proposal, products, person, engine, {}) == proposal
    for changes in (
        {"stock": 0},
        {"ingredients": "milk"},
        {"sodium_mg": 1000},
        {"serving_g": None},
    ):
        with pytest.raises(ValueError):
            llm.validate_proposal(
                proposal,
                {pid: {**safe_food, **changes}},
                {**person, "allergens": ["milk"]},
                engine,
                {},
            )
    with pytest.raises(ValueError):
        llm.validate_proposal(proposal, {}, person, engine, {})
    with pytest.raises(ValueError):
        llm.Proposal.model_validate_json("{broken")


def test_recipe_restrictions(engine, safe_food):
    pid = safe_food["id"]
    products = {pid: safe_food}
    choice = {"product_id": pid, "suggested_quantity": 1}
    recipe = {
        "ingredients": [choice],
        "missing_ingredients": [],
        "steps": [
            {"action": "prepare_as_labeled", "product_ids": [pid]},
            {"action": "serve", "product_ids": [pid]},
        ],
    }
    p = llm.Proposal(recommendations=[], recipes=[recipe])
    llm.validate_proposal(p, products, {"dm": True}, engine, {pid: 1})
    with pytest.raises(ValueError):
        llm.validate_proposal(p, products, {}, engine, {})
    with pytest.raises(ValueError):
        llm.validate_proposal(
            p,
            {pid: {**safe_food, "ingredients": "peanuts"}},
            {"allergens": ["peanuts"]},
            engine,
            {pid: 1},
        )
    with pytest.raises(ValueError):
        llm.Proposal(
            recommendations=[], recipes=[{**recipe, "instructions": ["add peanut butter"]}]
        )
    with pytest.raises(ValueError):
        llm.validate_proposal(
            llm.Proposal(
                recommendations=[],
                recipes=[{**recipe, "steps": [{"action": "serve", "product_ids": [pid]}]}],
            ),
            products,
            {},
            engine,
            {pid: 1},
        )


def test_model_json_request(configured, monkeypatch, safe_food):
    def post(self, url, **kwargs):
        assert kwargs["json"]["format"]["$defs"]["Choice"]["properties"]["product_id"]["enum"] == [
            safe_food["id"]
        ]
        return httpx.Response(
            200,
            json={"message": {"content": '{"recommendations":[],"recipes":[]}'}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.Client, "post", post)
    assert llm.generate({"candidates": [safe_food]}).recipes == []


@pytest.mark.integration
def test_ai_fallback_and_image_failure(api, monkeypatch):
    from test_integration import arrive

    sid = arrive(api)

    def timeout(*args):
        raise httpx.ReadTimeout("test")

    monkeypatch.setattr(llm, "generate", timeout)
    r = api.post("/recommendations", json={"session_id": sid})
    assert r.status_code == 200, r.text
    assert r.json()["mode"] == "deterministic_fallback" and r.json()["model"] is None

    def failure(*args):
        raise APIError(503, "ocr_unavailable", "test")

    monkeypatch.setattr(ocr, "extract", failure)
    buffer = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(buffer, format="PNG")
    r = api.post(
        "/scan/image",
        data={"session_id": sid},
        files={"image": ("test.png", buffer.getvalue(), "image/png")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["verdict"] == "unknown" and r.json()["recognition"] == "unavailable"


def test_ocr_does_not_take_previous_line_as_added_sugar():
    result = ocr.parse_label([{"text": "Dietary Fiber 3 g\nAdded Sugars 2 g", "confidence": 0.99}])
    assert result["added_sugar_g"] == 2


def test_real_barcode_decoder():
    import zxingcpp

    barcode = zxingcpp.create_barcode("1234567890128", zxingcpp.BarcodeFormat.EAN13)
    image = zxingcpp.write_barcode_to_image(barcode, scale=4)
    assert ocr.barcodes(image) == ["1234567890128"]


@pytest.mark.inference
@pytest.mark.integration
def test_live_ollama_route(api):
    import os

    if os.getenv("RUN_REAL_INFERENCE") != "1":
        pytest.skip("set RUN_REAL_INFERENCE=1 with local Ollama running")
    from test_integration import arrive, banana

    sid = arrive(api)
    pid = banana(api, sid)["product"]["id"]
    api.post("/cart/lines", json={"session_id": sid, "product_id": pid})
    response = api.post("/recommendations", json={"session_id": sid})
    assert response.status_code == 200, response.text
    assert response.json()["mode"] == "ollama", response.text
    assert response.json()["recommendations"], response.text


def test_fdc_energy_and_total_sugar():
    product = nutrition.from_fdc(
        {
            "fdcId": 1,
            "servingSize": 50,
            "servingSizeUnit": "g",
            "foodNutrients": [
                {"nutrient": {"name": "Energy", "unitName": "kcal"}, "amount": 200},
                {"nutrient": {"name": "Sugars, total", "unitName": "g"}, "amount": 4},
            ],
        }
    )
    assert product["calories_kcal"] == 100
    assert product["sugar_g"] == 2
