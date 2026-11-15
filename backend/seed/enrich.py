import re

import psycopg
from psycopg.rows import dict_row

from app.config import settings
from app.rules import ALLERGEN_WORDS
from app.services.nutrition import fdc_detail, fdc_search, off_lookup
from seed.load import insert_product, stock_demo


def missing_classes(foods):
    checks = {
        "at least 100 products": len(foods) >= 100,
        "high sodium": any((p["sodium_mg"] or 0) >= 460 for p in foods),
        "low sodium": any(p["sodium_mg"] is not None and p["sodium_mg"] <= 140 for p in foods),
        "sugar-sweetened drink": any(
            p["is_drink"] and (p["added_sugar_g"] or 0) > 0 for p in foods
        ),
        "juice": any(p["is_juice"] for p in foods),
        "phosphate additive": any(
            "phosphat" in (p["ingredients"] or "").lower()
            or "phosphoric" in (p["ingredients"] or "").lower()
            for p in foods
        ),
        "high potassium produce": any(
            (p["potassium_mg"] or 0) >= 200 and p["category"] == "produce" for p in foods
        ),
    }
    for allergen, words in ALLERGEN_WORDS.items():
        checks[allergen] = any(
            not p["source"].startswith("Team fixture")
            and (
                allergen in p["allergen_tags"]
                or re.search(r"\b(?:" + words + r")\b", (p["ingredients"] or "").lower())
            )
            for p in foods
        )
    return [name for name, ok in checks.items() if not ok]


def enrich():
    if not settings().fdc_api_key:
        raise SystemExit(
            "FDC_API_KEY is required. Golden seed remains usable; 100 products not claimed."
        )
    for query in (
        "milk",
        "egg",
        "fish",
        "shrimp",
        "almond",
        "peanut",
        "wheat",
        "soy",
        "sesame",
        "cola",
        "phosphate",
        "beans",
        "vegetables",
        "fruit",
    ):
        for hit in fdc_search(query)[:12]:
            food = fdc_detail(hit["fdcId"])
            if food.get("barcode"):
                try:
                    off = off_lookup(food["barcode"])
                except Exception:
                    off = None
                if off:
                    # Only fill missing USDA data; explicitly retain both source credits.
                    for key in (
                        "ingredients",
                        "allergen_tags",
                        *(
                            "sodium_mg",
                            "potassium_mg",
                            "phosphorus_mg",
                            "added_sugar_g",
                            "carb_g",
                            "fiber_g",
                        ),
                    ):
                        if not food.get(key) and (
                            key in ("ingredients", "allergen_tags") or food.get(key) is None
                        ):
                            # Numeric values need the same serving basis.
                            if (
                                key in ("ingredients", "allergen_tags")
                                or food["serving_g"] == off["serving_g"]
                            ):
                                food[key] = off.get(key)
                    food["off_code"] = off["off_code"]
                    food["source"] += "; " + off["source"]
            with psycopg.connect(settings().database_url, row_factory=dict_row) as conn:
                pid = insert_product(conn, food)
                index = conn.execute("SELECT count(*) AS n FROM products").fetchone()["n"]
                if pid:
                    stock_demo(conn, pid, index)
    with psycopg.connect(settings().database_url, row_factory=dict_row) as conn:
        foods = conn.execute("SELECT * FROM products").fetchall()
    missing = missing_classes(foods)
    print(f"Persisted {len(foods)} products with source provenance")
    if missing:
        raise SystemExit("Missing required classes: " + ", ".join(missing))
