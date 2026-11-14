"""Translate a rules-engine verdict into the shopping status the apps already parse.

The engine remains the only source of green, yellow, and red. This module does not
invent nutrient limits or call a model.
"""

import hashlib
import re

NUTRIENTS = {
    "sodium_mg": "mg",
    "added_sugar_g": "g",
    "sugar_g": "g",
    "potassium_mg": "mg",
    "phosphorus_mg": "mg",
    "phosphorus": "mg",
}


def code_variants(raw: str) -> list[str]:
    compact = re.sub(r"\s+", "", raw.strip())
    variants: list[str] = []

    def add(value: str) -> None:
        if value and value not in variants:
            variants.append(value)

    add(compact)
    if compact.upper().startswith("EC:SKU:"):
        add(compact.split(":", 2)[-1])
    digits = re.sub(r"\D", "", compact)
    if digits:
        add(digits)
        if len(digits) == 12:
            add("0" + digits)
        if len(digits) == 13 and digits.startswith("0"):
            add(digits[1:])
    return variants


def status_for(evaluation: dict, *, unverified: bool = False) -> dict:
    verdict = evaluation["verdict"]
    reasons = evaluation.get("reasons") or []
    reason = reasons[0]["rule_id"] if reasons else ""
    triggers = [
        {
            "nutrient": item["rule_id"],
            "value": None,
            "limit": None,
            "condition": item["source"],
        }
        for item in reasons
    ]
    if verdict == "red":
        level, label, limit = "red", "Not for you today", None
    elif verdict == "unknown":
        level, label, limit = "yellow", "Ask a volunteer", None
        reason = reason or "Ask a volunteer"
    elif unverified and verdict == "green":
        level, label, limit = "yellow", "Not verified yet", None
        reason = "Not verified yet"
    elif verdict == "yellow":
        level, label, limit = "yellow", "Limit to 1", 1
        reason = reason or label
    elif verdict == "green":
        level, label, limit = "green", "Great choice", None
        reason = reason or label
    else:
        raise RuntimeError(f"unexpected verdict {verdict}")
    return {
        "level": level,
        "label": label,
        "reason": reason,
        "limit_qty": limit,
        "triggers": triggers,
    }


def cart_outcome(level: str, resulting_qty: int, stock: int, limit_qty: int | None) -> str:
    if level == "red":
        return "red"
    if resulting_qty < 1:
        return "clear"
    if level == "yellow" and limit_qty is not None and resulting_qty > limit_qty:
        return "over"
    if resulting_qty > stock:
        return "stock"
    return "ok"


def cart_version(items: list[dict]) -> int:
    payload = "|".join(f"{item['product']['id']}:{item['qty']}" for item in items)
    return int.from_bytes(hashlib.sha256(payload.encode()).digest()[:4], "big")


def key_nutrients(food: dict, status: dict) -> list[dict]:
    rows = []
    for trigger in status["triggers"]:
        nutrient = trigger["nutrient"]
        if nutrient not in NUTRIENTS or food.get(nutrient) is None:
            continue
        rows.append(
            {
                "name": nutrient,
                "value": float(food[nutrient]),
                "limit": trigger["limit"],
                "unit": NUTRIENTS[nutrient],
            }
        )
    return rows
