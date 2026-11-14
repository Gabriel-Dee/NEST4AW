import pytest

from app.tier import OutsideMatrix, flags_from_icd, tier_of


def test_tier_matrix():
    assert tier_of(True, False, False) == "T1"
    assert tier_of(False, True, False) == "T2"
    assert tier_of(False, False, True) == "T3"
    assert tier_of(True, True, False) == "T4"
    assert tier_of(True, False, True) == "T5"
    assert tier_of(False, True, True) == "T6"
    assert tier_of(True, True, True) == "T7"
    assert tier_of(False, False, False) is None


def test_maria_james_and_e11_22_does_not_set_ckd():
    maria = flags_from_icd(["E11.9", "I10"])
    assert (maria.dm, maria.htn, maria.ckd34, maria.tier_id) == (True, True, False, "T4")
    james = flags_from_icd(["I10", "N18.32"])
    assert (james.dm, james.htn, james.ckd34, james.tier_id) == (False, True, True, "T6")
    only = flags_from_icd(["E11.22"])
    assert (only.dm, only.htn, only.ckd34, only.tier_id) == (True, False, False, "T1")


def test_i12_is_hypertension_only_and_early_ckd_is_ignored():
    row = flags_from_icd(["I12.9", "N18.1", "N18.2", "N18.9"])
    assert (row.dm, row.htn, row.ckd34, row.tier_id) == (False, True, False, "T2")


def test_stage_5_and_dialysis_are_rejected():
    with pytest.raises(OutsideMatrix):
        flags_from_icd(["N18.5"])
    with pytest.raises(OutsideMatrix):
        flags_from_icd(["E11.9", "N18.6"])


def test_e10_warns_and_does_not_set_diabetes():
    row = flags_from_icd(["E10.9"])
    assert row.dm is False
    assert row.tier_id is None
    assert row.warnings


def test_allergens_do_not_change_the_tier():
    row = flags_from_icd(["E11.22", "I10", "N18.4"])
    assert row.tier_id == "T7"
