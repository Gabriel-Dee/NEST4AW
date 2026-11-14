"""Real Ollama smoke test with synthetic, constrained inventory. No patient data."""

import json
import os
import time
from decimal import Decimal
from pathlib import Path

from app.rules import RuleEngine
from app.services.llm import generate, render, validate_proposal


def main():
    for key in ("JWT_SECRET", "PHI_KEY", "HMAC_KEY"):
        os.environ.setdefault(key, "synthetic-inference-test-" + key + "x" * 32)
    os.environ.setdefault("DATABASE_URL", "postgresql://localhost/nest_test")
    os.environ.setdefault("LLM_TIMEOUT", "120")
    # Read the same rule rows used by unit tests, not a second threshold definition.
    import re

    root = Path(__file__).resolve().parents[2]
    text = (root / "docs/seed_reference.sql").read_text()
    pattern = re.compile(
        r"\(\s*'([A-Z_]+)',\s*'[^']*',\s*(?:'[^']*'|NULL),\s*(?:'[^']*'|NULL),\s*([\d.]+|NULL),\s*(?:'[^']*'|NULL),\s*'((?:[^']|'')*)'",
        re.S,
    )
    engine = RuleEngine(
        [
            {
                "rule_id": m[1],
                "threshold": Decimal(m[2]) if m[2] != "NULL" else None,
                "source": m[3],
            }
            for m in pattern.finditer(text)
        ]
    )
    foods = json.loads((root / "docs/golden.json").read_text())["foods"]
    banana = {
        **foods[0],
        "id": "00000000-0000-4000-8000-000000000001",
        "stock": 3,
        "bin_code": "A1",
    }
    products = {banana["id"]: banana}
    person = {
        "dm": False,
        "htn": True,
        "ckd34": False,
        "k_limit_ordered": False,
        "allergens": [],
        "household_size": 1,
    }
    cart = {banana["id"]: 1}
    context = {
        "profile": person,
        "candidates": [banana],
        "cart": cart,
        "request": "Recommend the available item and generate one simple recipe using the cart item. Prepare as labeled then serve.",
    }
    start = time.monotonic()
    proposal = generate(context)
    validate_proposal(proposal, products, person, engine, cart)
    assert proposal.recommendations, "model returned no recommendations"
    assert proposal.recipes, "model returned no recipes"
    print(
        json.dumps(
            {
                "elapsed_seconds": round(time.monotonic() - start, 2),
                "validated": True,
                "output": render(proposal, products, person, engine),
            },
            default=str,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
