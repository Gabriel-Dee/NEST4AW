import json
from decimal import Decimal
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.db import DOCS
from app.rules import Item, Person, evaluate
from app.tier import flags_from_icd

GOLDEN = json.loads((DOCS / "golden.json").read_text())


def person_from(persona):
    flags = flags_from_icd(persona["icd10"])
    assert flags.tier_id == persona["tier"]
    return Person(
        flags.dm,
        flags.htn,
        flags.ckd34,
        persona["k_limit_ordered"],
        list(persona["allergens"]),
    )


def item_from(food, **overrides):
    data = dict(
        sodium_mg=food["sodium_mg"],
        potassium_mg=food["potassium_mg"],
        phosphorus_mg=food["phosphorus_mg"],
        added_sugar_g=food["added_sugar_g"],
        carb_g=food["carb_g"],
        fiber_g=food["fiber_g"],
        gi=food["gi"],
        ingredients=food["ingredients"],
        allergen_tags=list(food["allergen_tags"]),
        is_drink=food["is_drink"],
        is_juice=food["is_juice"],
    )
    data.update(overrides)
    return Item(**data)


def base_item(**overrides):
    data = dict(
        sodium_mg=10,
        potassium_mg=10,
        phosphorus_mg=10,
        added_sugar_g=0,
        carb_g=1,
        fiber_g=1,
        gi=None,
        ingredients="rice flour",
        allergen_tags=[],
        is_drink=False,
        is_juice=False,
    )
    data.update(overrides)
    return Item(**data)


@pytest.mark.parametrize("persona", GOLDEN["personas"], ids=lambda p: p["key"])
@pytest.mark.parametrize("food", GOLDEN["foods"], ids=lambda f: f["key"])
def test_golden_verdicts(rules, persona, food):
    result = evaluate(person_from(persona), item_from(food), rules)
    expected = GOLDEN["expect"][persona["key"]][food["key"]]
    assert result.verdict == expected


def test_unknown_item_has_no_reasons():
    result = evaluate(Person(True, False, False, False, []), None, {})
    assert result.verdict == "unknown"
    assert result.reasons == []


def test_juice_for_maria_is_red_while_sodium_stays_zero(rules):
    maria = next(p for p in GOLDEN["personas"] if p["key"] == "maria")
    juice = next(f for f in GOLDEN["foods"] if f["key"] == "orange_juice")
    assert juice["sodium_mg"] == 0
    result = evaluate(person_from(maria), item_from(juice), rules)
    assert result.verdict == "red"
    assert any(vote.rule_id == "SUG_DRINK" for vote in result.reasons)


def test_rules_module_does_not_call_a_model():
    text = Path(evaluate.__code__.co_filename).read_text()
    assert "httpx" not in text
    assert "openai" not in text


def test_salt_and_potato_do_not_false_match(rules):
    person = Person(False, False, True, False, [])
    salt = evaluate(person, base_item(ingredients="sea salt"), rules)
    chloride = evaluate(person, base_item(ingredients="potassium chloride"), rules)
    potato = evaluate(person, base_item(ingredients="potato starch"), rules)
    phosphate = evaluate(person, base_item(ingredients="sodium phosphate"), rules)
    assert "K_SALT" not in {v.rule_id for v in salt.reasons}
    assert chloride.verdict == "red"
    assert "P_ADD" not in {v.rule_id for v in potato.reasons}
    assert any(v.rule_id == "P_ADD" for v in phosphate.reasons)


def test_potassium_does_nothing_until_the_order_flag(rules):
    quiet = Person(False, False, True, False, [])
    ordered = Person(False, False, True, True, [])
    low = base_item(potassium_mg=10, phosphorus_mg=10)
    high = base_item(potassium_mg=400, phosphorus_mg=10)
    assert evaluate(quiet, low, rules).verdict == evaluate(quiet, high, rules).verdict
    assert evaluate(ordered, high, rules).verdict == "red"


@settings(max_examples=25)
@given(extra=st.integers(min_value=0, max_value=5000))
def test_sodium_at_or_over_red_is_not_green(rules, extra):
    threshold = Decimal(rules["NA_R"]["threshold"])
    sodium = threshold + Decimal(extra)
    for person in (
        Person(True, False, False, False, []),
        Person(False, True, False, False, []),
        Person(False, False, True, False, []),
    ):
        result = evaluate(person, base_item(sodium_mg=sodium), rules)
        assert result.verdict != "green"


def test_null_sodium_allergen_juice_and_one_red_vote(rules):
    dm = Person(True, False, False, False, [])
    assert evaluate(dm, base_item(sodium_mg=None), rules).verdict != "green"
    assert (
        evaluate(dm, base_item(is_juice=True, is_drink=True, sodium_mg=0), rules).verdict
        == "red"
    )
    allergic = Person(False, False, False, False, ["milk"])
    assert evaluate(allergic, base_item(allergen_tags=["milk"]), rules).verdict == "red"
    assert evaluate(allergic, base_item(ingredients="dried buttermilk"), rules).verdict == "red"
    assert evaluate(dm, base_item(), rules).verdict == "green"
    red = evaluate(
        Person(True, False, False, False, ["peanuts"]),
        base_item(allergen_tags=["peanuts"]),
        rules,
    )
    assert red.verdict == "red"
