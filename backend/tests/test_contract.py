from app.contract import cart_outcome, cart_version, code_variants, status_for


def test_code_variants_cover_upc_ean_and_shelf_qr():
    assert code_variants("012345678905") == ["012345678905", "0012345678905"]
    assert "012345678905" in code_variants("0012345678905")
    assert "P-173944" in code_variants("EC:SKU:P-173944")
    assert code_variants(" 490 111 ") == ["490111"]


def test_status_labels_follow_the_engine():
    red = status_for({"verdict": "red", "reasons": [{"rule_id": "sodium_mg", "source": "AHA"}]})
    assert red["level"] == "red"
    assert red["label"] == "Not for you today"
    assert red["triggers"][0]["nutrient"] == "sodium_mg"
    yellow = status_for({"verdict": "yellow", "reasons": []})
    assert yellow == {
        "level": "yellow",
        "label": "Limit to 1",
        "reason": "Limit to 1",
        "limit_qty": 1,
        "triggers": [],
    }
    ask = status_for({"verdict": "unknown", "reasons": []})
    assert ask["level"] == "yellow" and ask["label"] == "Ask a volunteer"
    fresh = status_for({"verdict": "green", "reasons": []}, unverified=True)
    assert fresh["label"] == "Not verified yet"
    assert status_for({"verdict": "green", "reasons": []})["label"] == "Great choice"


def test_cart_outcome_blocks_red_and_yellow_over_the_limit():
    assert cart_outcome("red", 1, 5, None) == "red"
    assert cart_outcome("yellow", 2, 5, 1) == "over"
    assert cart_outcome("yellow", 1, 5, 1) == "ok"
    assert cart_outcome("green", 3, 2, None) == "stock"
    assert cart_outcome("green", 0, 2, None) == "clear"


def test_cart_version_changes_when_quantity_changes():
    first = [{"product": {"id": "a"}, "qty": 1}]
    second = [{"product": {"id": "a"}, "qty": 2}]
    assert cart_version(first) != cart_version(second)
    assert cart_version(first) == cart_version([{"product": {"id": "a"}, "qty": 1}])
