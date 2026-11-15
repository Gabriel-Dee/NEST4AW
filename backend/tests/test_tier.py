import pytest

from app.errors import APIError
from app.tier import derive, tier_of


@pytest.mark.parametrize(
    "flags,tier",
    [
        ((1, 0, 0), "T1"),
        ((0, 1, 0), "T2"),
        ((0, 0, 1), "T3"),
        ((1, 1, 0), "T4"),
        ((1, 0, 1), "T5"),
        ((0, 1, 1), "T6"),
        ((1, 1, 1), "T7"),
        ((0, 0, 0), None),
    ],
)
def test_tiers(flags, tier):
    assert tier_of(*flags) == tier


@pytest.mark.parametrize("code", ["N18.5", "N18.6", "INVALID"])
def test_invalid(code):
    with pytest.raises(APIError):
        derive([code])


def test_icd():
    assert derive(["E11.22"])["ckd34"] is False
    assert derive(["I12.9"])["htn"] is True
    assert derive(["I12.9"])["ckd34"] is False
    assert derive(["E10.9"])["tier_id"] is None
    assert derive(["E13.9"])["warnings"]
    for code in ["N18.1", "N18.2", "N18.9"]:
        assert not derive([code])["ckd34"]
