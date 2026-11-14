"""Source-specific conversions. Unknown units and nutrients remain null."""

import math
import re

import httpx

from app.config import settings
from app.rules import ALLERGEN_WORDS

OFF_TAGS = dict(
    zip(
        (
            "en:milk",
            "en:eggs",
            "en:fish",
            "en:crustaceans",
            "en:tree-nuts",
            "en:peanuts",
            "en:gluten",
            "en:soybeans",
            "en:sesame",
        ),
        ALLERGEN_WORDS,
    )
)
FIELDS = {
    "protein_g": ("proteins", "g"),
    "fat_g": ("fat", "g"),
    "sugar_g": ("sugars", "g"),
    "sodium_mg": ("sodium", "mg"),
    "potassium_mg": ("potassium", "mg"),
    "phosphorus_mg": ("phosphorus", "mg"),
    "added_sugar_g": ("added-sugars", "g"),
    "carb_g": ("carbohydrates", "g"),
    "fiber_g": ("fiber", "g"),
}


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and n >= 0 else None
    except (ValueError, TypeError):
        return None


def convert(value, unit, target):
    value = number(value)
    unit = (unit or "").lower()
    if value is None or unit not in ("g", "mg", "µg", "ug"):
        return None
    grams = value * {"g": 1, "mg": 0.001, "µg": 0.000001, "ug": 0.000001}[unit]
    return grams * (1000 if target == "mg" else 1)


def from_off(data):
    n = data.get("nutriments") or {}
    serving_text = data.get("serving_size") or ""
    match = re.search(r"(\d+(?:\.\d+)?)\s*g\b", serving_text, re.I)
    serving = float(match[1]) if match else None
    result = {
        "name": data.get("product_name") or "Unidentified product",
        "barcode": data.get("code"),
        "brand": data.get("brands"),
        "serving_text": serving_text or None,
        "serving_g": serving,
        "ingredients": data.get("ingredients_text") or None,
        "allergen_tags": sorted(
            {OFF_TAGS[t] for t in data.get("allergens_tags", []) if t in OFF_TAGS}
        ),
        "off_code": data.get("code"),
        "source": "Open Food Facts contributors, ODbL 1.0; community-reported",
        "source_url": f"https://world.openfoodfacts.org/product/{data.get('code', '')}",
    }
    for field, (key, unit) in FIELDS.items():
        value = n.get(key + "_serving")
        factor = 1
        if value is None and serving is not None:
            value, factor = n.get(key + "_100g"), serving / 100
        converted = convert(value, n.get(key + "_unit"), unit)
        result[field] = converted * factor if converted is not None else None
    energy = number(n.get("energy-kcal_serving"))
    if energy is None and serving is not None:
        per100 = number(n.get("energy-kcal_100g"))
        energy = None if per100 is None else per100 * serving / 100
    result["calories_kcal"] = energy if n.get("energy-kcal_unit") == "kcal" else None
    category = " ".join(data.get("categories_tags", [])).lower()
    result["is_juice"] = "juice" in category
    result["is_drink"] = result["is_juice"] or any(
        k in category for k in ("beverages", "drinks", "sodas")
    )
    return result


FDC_NAMES = {
    "protein": "protein_g",
    "total lipid (fat)": "fat_g",
    "sugars, total including nlea": "sugar_g",
    "sugars, total": "sugar_g",
    "sodium, na": "sodium_mg",
    "potassium, k": "potassium_mg",
    "phosphorus, p": "phosphorus_mg",
    "sugars, added": "added_sugar_g",
    "carbohydrate, by difference": "carb_g",
    "fiber, total dietary": "fiber_g",
}


def from_fdc(data):
    serving = (
        number(data.get("servingSize"))
        if str(data.get("servingSizeUnit", "")).lower() in ("g", "grm")
        else None
    )
    # A 100 g basis is explicit, not an invented household serving.
    if serving is None and data.get("dataType") in ("Foundation", "SR Legacy"):
        serving = 100.0
    nutrients = {f: None for f in FIELDS}
    nutrients["calories_kcal"] = None
    for item in data.get("foodNutrients", []):
        nutrient = item.get("nutrient") or {}
        name = str(nutrient.get("name") or item.get("nutrientName", "")).lower()
        unit = str(nutrient.get("unitName", item.get("unitName", ""))).lower()
        amount = number(item.get("amount", item.get("value")))
        if name == "energy" and unit in ("kcal", "kj") and amount is not None and serving:
            if nutrients["calories_kcal"] is None or unit == "kcal":
                nutrients["calories_kcal"] = amount * serving / 100 / (4.184 if unit == "kj" else 1)
        field = FDC_NAMES.get(name)
        if field and serving:
            value = convert(
                item.get("amount", item.get("value")),
                nutrient.get("unitName", item.get("unitName")),
                "mg" if field.endswith("_mg") else "g",
            )
            nutrients[field] = None if value is None else value * serving / 100
    name = data.get("description") or "Unidentified food"
    ingredients = data.get("ingredients") or None
    category = data.get("foodCategory") or data.get("brandedFoodCategory") or ""
    if isinstance(category, dict):
        category = category.get("description", "")
    return {
        **nutrients,
        "name": name,
        "barcode": data.get("gtinUpc") or None,
        "internal_code": None if data.get("gtinUpc") else f"FDC-{data['fdcId']}",
        "fdc_id": str(data["fdcId"]),
        "serving_g": serving,
        "serving_text": f"{serving:g} g" if serving else None,
        "ingredients": ingredients,
        "category": category,
        "allergen_tags": [],
        "is_juice": "juice" in name.lower(),
        "is_drink": any(w in category.lower() for w in ("beverage", "drink", "juice"))
        or "juice" in name.lower(),
        "source": "USDA FoodData Central; nutrients converted from 100 g to stated serving",
        "source_url": f"https://fdc.nal.usda.gov/food-details/{data['fdcId']}/nutrients",
    }


def off_lookup(barcode):
    if not re.fullmatch(r"\d{8,14}", barcode):
        return None
    cfg = settings()
    with httpx.Client(
        timeout=10, headers={"User-Agent": cfg.off_user_agent}, follow_redirects=False
    ) as client:
        response = client.get(f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json")
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") != 1:
            return None
        return from_off({**payload["product"], "code": barcode})


def fdc_search(query, page=1):
    cfg = settings()
    if not cfg.fdc_api_key:
        return []
    with httpx.Client(timeout=15) as client:
        response = client.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={"api_key": cfg.fdc_api_key, "query": query, "pageSize": 50, "pageNumber": page},
        )
        response.raise_for_status()
        return response.json().get("foods", [])


def fdc_detail(fdc_id):
    cfg = settings()
    with httpx.Client(timeout=15) as client:
        response = client.get(
            f"https://api.nal.usda.gov/fdc/v1/food/{int(fdc_id)}",
            params={"api_key": cfg.fdc_api_key},
        )
        response.raise_for_status()
        return from_fdc(response.json())
