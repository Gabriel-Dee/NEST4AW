"""Deterministic clinical voting. No model, network, or duplicate thresholds."""

import re
from dataclasses import asdict, dataclass

REQUIRED = set(
    "NA_G NA_R NA_Y K_DEFAULT K_ORDER K_SALT K_RANK P_ADD P_MISS SUG_DRINK SUG_G SUG_Y CARB FIBER_RANK GI_Y GI_MISS ALG".split()
)
ALLERGEN_WORDS = {
    "milk": r"milk|buttermilk|cream|butter|whey|casein|cheese|yogurt",
    "eggs": r"egg|eggs|albumen",
    "fish": r"fish|salmon|tuna|cod|anchovy|anchovies",
    "crustacean_shellfish": r"crustacean|shellfish|shrimp|prawn|crab|lobster|crawfish|crayfish",
    "tree_nuts": r"almond|almonds|walnut|walnuts|cashew|cashews|pecan|pecans|pistachios?|hazelnuts?|macadamias?|brazil nuts?|tree nuts?",
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
        votes, reasons, voted = [], [], {}

        def vote(color, rule=None):
            if rule:
                color = self.rules[rule].get("color") or color
            votes.append(color)
            if rule:
                row = self.rules[rule]
                reasons.append({"rule_id": rule, "source": row["source"]})
                voted[rule] = color

        def threshold(key):
            return self.rules[key]["threshold"]

        ingredients = (product.get("ingredients") or "").strip().lower()
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
            sugar = product.get("added_sugar_g")
            # ADA rec 5.25: replace sugar-sweetened drinks and juice with water. Water itself is
            # not red. For drinks use the larger of added and total sugar, because some OFF
            # records list 0 g added sugar on a full-sugar soda.
            drink_sugar = max(
                (v for v in (sugar, product.get("sugar_g")) if v is not None), default=None
            )
            if product.get("is_juice") or (
                product.get("is_drink")
                and drink_sugar is not None
                and drink_sugar >= threshold("SUG_G")
            ):
                vote("red", "SUG_DRINK")
            elif sugar is None:
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
        # Lead with a rule that decided the verdict, so the shown reason matches the color.
        reasons.sort(key=lambda r: voted[r["rule_id"]] != verdict)
        return {
            "verdict": verdict,
            "reasons": reasons,
            "product": product,
            "fiber_rank_bonus": any(person.get(k) for k in ("dm", "htn", "ckd34"))
            and product.get("fiber_g") is not None
            and product["fiber_g"] >= threshold("FIBER_RANK"),
        }


@dataclass
class Person:
    dm: bool
    htn: bool
    ckd34: bool
    k_limit_ordered: bool
    allergens: list[str]


@dataclass
class Item:
    sodium_mg: object = None
    potassium_mg: object = None
    phosphorus_mg: object = None
    added_sugar_g: object = None
    sugar_g: object = None
    carb_g: object = None
    fiber_g: object = None
    gi: object = None
    ingredients: str | None = None
    allergen_tags: list[str] | None = None
    is_drink: bool = False
    is_juice: bool = False


@dataclass(frozen=True)
class Vote:
    rule_id: str
    color: str
    source: str


@dataclass(frozen=True)
class Verdict:
    verdict: str
    reasons: list[Vote]
    fiber_rank_bonus: bool


REQUIRED_RULE_IDS = tuple(sorted(REQUIRED))


def load_rules(conn):
    return {row["rule_id"]: row for row in conn.execute("SELECT * FROM rules")}


def missing_rule_ids(rules):
    return sorted(REQUIRED - rules.keys())


def evaluate(person: Person, item: Item | None, rules: dict) -> Verdict:
    """Upstream dataclass interface, backed by the same clinical rules as every route."""
    if item is None:
        return Verdict("unknown", [], False)
    result = RuleEngine(rules.values()).evaluate(asdict(person), asdict(item))
    votes = [
        Vote(r["rule_id"], rules[r["rule_id"]].get("color") or result["verdict"], r["source"])
        for r in result["reasons"]
    ]
    return Verdict(result["verdict"], votes, result["fiber_rank_bonus"])
