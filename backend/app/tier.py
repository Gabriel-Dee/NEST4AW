import re

from app.errors import APIError


def tier_of(dm, htn, ckd34):
    return {
        (True, False, False): "T1",
        (False, True, False): "T2",
        (False, False, True): "T3",
        (True, True, False): "T4",
        (True, False, True): "T5",
        (False, True, True): "T6",
        (True, True, True): "T7",
    }.get((dm, htn, ckd34))


def derive(codes):
    codes = {c.strip().upper() for c in codes}
    if any(not re.fullmatch(r"[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?", c) for c in codes):
        raise APIError(422, "invalid_clinical_input", "invalid ICD-10 format")
    if codes & {"N18.5", "N18.6"}:
        raise APIError(422, "outside_matrix", "stage 5 and dialysis require clinical review")
    dm = any(c == "E11" or c.startswith("E11.") for c in codes)
    htn = any(c == "I10" or c.split(".")[0] in {"I11", "I12", "I13", "I15"} for c in codes)
    ckd = bool(codes & {"N18.30", "N18.31", "N18.32", "N18.4"})
    warnings = (
        ["a clinician must confirm diabetes type"]
        if any(c.split(".")[0] in {"E10", "E13"} for c in codes)
        else []
    )
    return dict(dm=dm, htn=htn, ckd34=ckd, tier_id=tier_of(dm, htn, ckd), warnings=warnings)
