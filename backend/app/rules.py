"""Deterministic clinical voting. No model, network, or duplicate thresholds."""

import re

REQUIRED = set(
    "NA_G NA_R NA_Y K_DEFAULT K_ORDER K_SALT K_RANK P_ADD P_MISS SUG_DRINK SUG_G SUG_Y CARB FIBER_RANK GI_Y GI_MISS ALG".split()
)
ALLERGEN_WORDS = {
    "milk": r"milk|cream|butter|whey|casein|cheese|yogurt",
    "eggs": r"egg|eggs|albumen",
    "fish": r"fish|salmon|tuna|cod|anchovy|anchovies",
    "crustacean_shellfish": r"shrimp|prawn|crab|lobster|crayfish",
    "tree_nuts": r"almond|almonds|walnut|walnuts|cashew|cashews|pecan|pecans|pistachio|hazelnut|macadamia",
    "peanuts": r"peanut|peanuts",
    "wheat": r"wheat|semolina|spelt|bulgur",
    "soybeans": r"soy|soya|soybean|soybeans|tofu|edamame",
    "sesame": r"sesame|tahini",
}


class RuleEngine:
    def __init__(self, rows):
        self.rules = {r["rule_id"]: dict(r) for r in rows}
        missing = REQUIRED - self.rules.keys()
        if missing:
            raise RuntimeError(f"missing clinical rules: {sorted(missing)}")
        for key in ("NA_G", "NA_R", "K_ORDER", "SUG_G", "SUG_Y", "FIBER_RANK", "GI_Y"):
            if self.rules[key]["threshold"] is None:
                raise RuntimeError(f"missing threshold: {key}")

    def evaluate(self, person, product):
        if product is None:
            return {"verdict": "unknown", "reasons": [], "product": None}
        votes, reasons = [], []

        def vote(color, rule=None):
            votes.append(color)
            if rule:
                row = self.rules[rule]
                reasons.append({"rule_id": rule, "source": row["source"]})

        def threshold(key):
            return self.rules[key]["threshold"]

        ingredients = (product.get("ingredients") or "").lower()
        tags = set(product.get("allergen_tags") or [])
        allergens = set(person.get("allergens") or [])
        if allergens and not tags and not ingredients:
            vote("unknown")
        if allergens & tags or any(
            re.search(r"\b(?:" + ALLERGEN_WORDS[a] + r")\b", ingredients) for a in allergens
        ):
            vote("red", "ALG")
        if any(person.get(k) for k in ("dm", "htn", "ckd34")):
            sodium = product.get("sodium_mg")
            if sodium is None:
                vote("unknown")
            elif sodium <= threshold("NA_G"):
                vote("green", "NA_G")
            elif sodium >= threshold("NA_R"):
                vote("red", "NA_R")
            else:
                vote("yellow", "NA_Y")
        if person.get("ckd34"):
            if "potassium chloride" in ingredients:
                vote("red", "K_SALT")
            if any(s in ingredients for s in ("phosphate", "phosphoric", "pyrophosphate")):
                vote("yellow", "P_ADD")
            if product.get("phosphorus_mg") is None:
                vote("yellow", "P_MISS")
        if person.get("k_limit_ordered"):
            potassium = product.get("potassium_mg")
            if potassium is None:
                vote("unknown")
            elif potassium >= threshold("K_ORDER"):
                vote("red", "K_ORDER")
        if person.get("dm"):
            if product.get("is_drink") or product.get("is_juice"):
                vote("red", "SUG_DRINK")
            else:
                sugar = product.get("added_sugar_g")
                if sugar is None:
                    vote("unknown")
                elif sugar < threshold("SUG_G"):
                    vote("green", "SUG_G")
                elif sugar >= threshold("SUG_Y"):
                    vote("yellow", "SUG_Y")
                else:
                    vote("unknown")
            if product.get("gi") is not None and product["gi"] >= threshold("GI_Y"):
                vote("yellow", "GI_Y")
        verdict = next((c for c in ("red", "yellow", "unknown") if c in votes), "green")
        return {
            "verdict": verdict,
            "reasons": reasons,
            "product": product,
            "fiber_rank_bonus": product.get("fiber_g") is not None
            and product["fiber_g"] >= threshold("FIBER_RANK"),
        }
