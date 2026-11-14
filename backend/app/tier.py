from dataclasses import dataclass, field


ALLOWED_ALLERGENS = frozenset(
    {
        "milk",
        "eggs",
        "fish",
        "crustacean_shellfish",
        "tree_nuts",
        "peanuts",
        "wheat",
        "soybeans",
        "sesame",
    }
)


class OutsideMatrix(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass
class TierFlags:
    dm: bool
    htn: bool
    ckd34: bool
    tier_id: str | None
    warnings: list[str] = field(default_factory=list)


def tier_of(dm: bool, htn: bool, ckd34: bool) -> str | None:
    if dm and htn and ckd34:
        return "T7"
    if dm and htn:
        return "T4"
    if dm and ckd34:
        return "T5"
    if htn and ckd34:
        return "T6"
    if dm:
        return "T1"
    if htn:
        return "T2"
    if ckd34:
        return "T3"
    return None


def _family(code: str, prefix: str) -> bool:
    return code == prefix or code.startswith(prefix + ".")


def flags_from_icd(codes: list[str]) -> TierFlags:
    dm = False
    htn = False
    ckd34 = False
    confirm_type = False
    for raw in codes:
        code = raw.strip().upper()
        if not code:
            continue
        if code.startswith("N18.5") or code.startswith("N18.6"):
            raise OutsideMatrix(code)
        if _family(code, "E11"):
            dm = True
        elif _family(code, "E10") or _family(code, "E13"):
            confirm_type = True
        if (
            _family(code, "I10")
            or _family(code, "I11")
            or _family(code, "I12")
            or _family(code, "I13")
            or _family(code, "I15")
        ):
            htn = True
        if code in {"N18.30", "N18.31", "N18.32"} or code.startswith("N18.4"):
            ckd34 = True
    warnings: list[str] = []
    if confirm_type:
        warnings.append(
            "Confirm the diabetes type. E10 and E13 do not set a tier by themselves."
        )
    return TierFlags(dm, htn, ckd34, tier_of(dm, htn, ckd34), warnings)
