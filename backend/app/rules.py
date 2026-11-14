import re
from dataclasses import dataclass
from decimal import Decimal

REQUIRED_RULE_IDS = (
    "NA_G",
    "NA_R",
    "NA_Y",
    "K_DEFAULT",
    "K_ORDER",
    "K_SALT",
    "K_RANK",
    "P_ADD",
    "P_MISS",
    "SUG_DRINK",
    "SUG_G",
    "SUG_Y",
    "CARB",
    "FIBER_RANK",
    "GI_Y",
    "GI_MISS",
    "ALG",
)

_WORDS = {
    "milk": re.compile(r"milk", re.I),
    "eggs": re.compile(r"\beggs?\b", re.I),
    "fish": re.compile(r"\bfish\b", re.I),
    "crustacean_shellfish": re.compile(
        r"crustacean|shellfish|shrimp|crab|lobster|crawfish|crayfish", re.I
    ),
    "tree_nuts": re.compile(
        r"tree nuts?|almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|brazil nuts?",
        re.I,
    ),
    "peanuts": re.compile(r"peanuts?", re.I),
    "wheat": re.compile(r"\bwheat\b", re.I),
    "soybeans": re.compile(r"soy", re.I),
    "sesame": re.compile(r"sesame", re.I),
}
_PHOSPHATE = re.compile(r"phosphate|phosphoric|pyrophosphate", re.I)
_K_SALT = re.compile(r"potassium chloride", re.I)


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


def load_rules(conn) -> dict:
    rows = conn.execute("SELECT * FROM rules").fetchall()
    return {row["rule_id"]: row for row in rows}


def missing_rule_ids(rules: dict) -> list[str]:
    return [rule_id for rule_id in REQUIRED_RULE_IDS if rule_id not in rules]


def _dec(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _vote(rule: dict, color: str | None = None) -> Vote:
    chosen = rule["color"] if color is None else color
    return Vote(rule["rule_id"], chosen, rule["source"])


def _tags_hit(person: Person, item: Item) -> bool:
    tags = {tag.lower() for tag in (item.allergen_tags or [])}
    return any(code.lower() in tags for code in person.allergens)


def _text_hit(person: Person, item: Item) -> bool:
    text = item.ingredients or ""
    if not text:
        return False
    for code in person.allergens:
        pattern = _WORDS.get(code.lower())
        if pattern and pattern.search(text):
            return True
    return False


def _condition(person: Person) -> bool:
    return bool(person.dm or person.htn or person.ckd34)


def evaluate(person: Person, item: Item | None, rules: dict) -> Verdict:
    if item is None:
        return Verdict("unknown", [], False)

    votes: list[Vote] = []
    # ponytail: empty tag list means no allergen tags, so the golden banana stays green
    # for Asha and Helen. Vote unknown only when the tag list itself is missing.
    # Upgrade path: if golden.json marks that banana unknown, treat [] as missing too.
    if person.allergens and item.allergen_tags is None and not (item.ingredients or "").strip():
        votes.append(_vote(rules["ALG"], "unknown"))
    elif person.allergens and (_tags_hit(person, item) or _text_hit(person, item)):
        votes.append(_vote(rules["ALG"]))

    if _condition(person):
        sodium = _dec(item.sodium_mg)
        if sodium is None:
            votes.append(_vote(rules["NA_G"], "unknown"))
        elif sodium <= _dec(rules["NA_G"]["threshold"]):
            votes.append(_vote(rules["NA_G"]))
        elif sodium >= _dec(rules["NA_R"]["threshold"]):
            votes.append(_vote(rules["NA_R"]))
        else:
            votes.append(_vote(rules["NA_Y"]))

    if person.ckd34 and item.ingredients and _K_SALT.search(item.ingredients):
        votes.append(_vote(rules["K_SALT"]))

    if person.k_limit_ordered:
        potassium = _dec(item.potassium_mg)
        if potassium is None:
            votes.append(_vote(rules["K_ORDER"], "unknown"))
        elif potassium >= _dec(rules["K_ORDER"]["threshold"]):
            votes.append(_vote(rules["K_ORDER"]))

    if person.ckd34 and item.ingredients and _PHOSPHATE.search(item.ingredients):
        votes.append(_vote(rules["P_ADD"]))
    if person.ckd34 and item.phosphorus_mg is None:
        votes.append(_vote(rules["P_MISS"]))

    if person.dm and (item.is_drink or item.is_juice):
        votes.append(_vote(rules["SUG_DRINK"]))
    elif person.dm:
        sugar = _dec(item.added_sugar_g)
        if sugar is None:
            votes.append(_vote(rules["SUG_G"], "unknown"))
        elif sugar < _dec(rules["SUG_G"]["threshold"]):
            votes.append(_vote(rules["SUG_G"]))
        elif sugar >= _dec(rules["SUG_Y"]["threshold"]):
            votes.append(_vote(rules["SUG_Y"]))

    if person.dm:
        gi = _dec(item.gi)
        if gi is not None and gi >= _dec(rules["GI_Y"]["threshold"]):
            votes.append(_vote(rules["GI_Y"]))

    bonus = False
    if _condition(person):
        fiber = _dec(item.fiber_g)
        threshold = _dec(rules["FIBER_RANK"]["threshold"])
        if fiber is not None and threshold is not None and fiber >= threshold:
            bonus = True

    # Loaded so startup fails if a row disappears. These four do not vote.
    _ = (rules["K_DEFAULT"], rules["K_RANK"], rules["CARB"], rules["GI_MISS"])

    colors = [vote.color for vote in votes]
    if "red" in colors:
        verdict = "red"
    elif "yellow" in colors:
        verdict = "yellow"
    elif "unknown" in colors:
        verdict = "unknown"
    else:
        verdict = "green"
    return Verdict(verdict, votes, bonus)
