import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.rules import RuleEngine
from app.tier import derive

# Explicit safety corrections approved by the user; golden.json remains untouched.
SAFETY_CORRECTIONS = {("asha", "banana"), ("helen", "banana"), ("helen", "orange_juice")}


@pytest.mark.parametrize("person_key", ["maria", "james", "asha", "luis", "helen"])
@pytest.mark.parametrize(
    "food_key",
    ["banana", "orange_juice", "progresso", "mcdougall", "sugar_free_cookies", "peanut_bar"],
)
def test_golden(engine, golden, person_key, food_key):
    person = next(p for p in golden["personas"] if p["key"] == person_key)
    food = next(p for p in golden["foods"] if p["key"] == food_key)
    verdict = engine.evaluate({**person, **derive(person["icd10"])}, food)["verdict"]
    expected = (
        "unknown"
        if (person_key, food_key) in SAFETY_CORRECTIONS
        else golden["expect"][person_key][food_key]
    )
    assert verdict == expected


@given(
    st.floats(min_value=460, max_value=1e6, allow_nan=False),
    st.sampled_from(["dm", "htn", "ckd34"]),
)
def test_high_sodium_not_green(engine, sodium, condition):
    assert engine.evaluate({condition: True}, {"sodium_mg": sodium})["verdict"] == "red"


@given(st.sampled_from(["dm", "htn", "ckd34"]))
def test_missing_sodium_not_green(engine, condition):
    assert engine.evaluate({condition: True}, {})["verdict"] != "green"


@given(st.floats(min_value=0, max_value=10000, allow_nan=False))
def test_potassium_requires_order(engine, k):
    p = {"sodium_mg": 0, "potassium_mg": k, "phosphorus_mg": 1}
    assert engine.evaluate({"ckd34": True}, p)["verdict"] == "green"
    if k >= engine.rules["K_ORDER"]["threshold"]:
        assert engine.evaluate({"ckd34": True, "k_limit_ordered": True}, p)["verdict"] == "red"


def test_allergen_and_juice(engine):
    assert (
        engine.evaluate({"allergens": ["milk"]}, {"ingredients": "whey", "sodium_mg": 0})["verdict"]
        == "red"
    )
    assert engine.evaluate({"dm": True}, {"is_juice": True, "sodium_mg": 0})["verdict"] == "red"
    assert (
        engine.evaluate(
            {"ckd34": True}, {"ingredients": "phosphoric acid", "phosphorus_mg": 1, "sodium_mg": 0}
        )["verdict"]
        == "yellow"
    )
    assert (
        engine.evaluate({"ckd34": True}, {"ingredients": "potassium chloride", "sodium_mg": 0})[
            "verdict"
        ]
        == "red"
    )
    assert engine.evaluate({"allergens": ["sesame"]}, {"sodium_mg": 0})["verdict"] == "unknown"
    assert engine.evaluate({}, None)["product"] is None


def test_missing_rules_rejected():
    with pytest.raises(RuntimeError):
        RuleEngine([])
