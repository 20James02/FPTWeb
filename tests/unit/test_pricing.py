from datetime import UTC, datetime, timedelta

import pytest

NOW = datetime(2026, 9, 30, 8, tzinfo=UTC)


def engine():
    from pagefpt.modules.pricing.engine import calculate_quote

    return calculate_quote


def price(scope="region", region="hanoi", monthly=200000, **extra):
    return {
        "id": "p1",
        "plan_id": "plan1",
        "scope_kind": scope,
        "scope_id": region,
        "billing_months": 6,
        "monthly_vnd": monthly,
        "setup_vnd": 100000,
        "equipment_vnd": 50000,
        "vat_included": True,
        "vat_bps": 0,
        "gift_months": 1,
        "start": NOW - timedelta(days=1),
        "end": NOW + timedelta(days=1),
        **extra,
    }


def test_exact_region_beats_group():
    q = engine()(
        [price("group", "north", 100000), price()], "plan1", "hanoi", "north", 6, NOW, [], 1
    )
    assert q["initial_total_vnd"] == 1350000
    assert q["price_id"] == "p1"


def test_unknown_region_needs_quote():
    assert engine()([price()], "plan1", None, None, 6, NOW, [], 1)["status"] == "needs_confirmation"


def test_boundary_end_is_exclusive():
    assert (
        engine()([price(end=NOW)], "plan1", "hanoi", None, 6, NOW, [], 1)["status"]
        == "needs_confirmation"
    )


def test_vat_not_double_counted():
    q = engine()([price(vat_included=True, vat_bps=1000)], "plan1", "hanoi", None, 6, NOW, [], 1)
    assert q["initial_total_vnd"] == 1350000
    q = engine()([price(vat_included=False, vat_bps=1000)], "plan1", "hanoi", None, 6, NOW, [], 1)
    assert q["initial_total_vnd"] == 1485000


def test_discount_clamped_and_expiry():
    promo = {
        "id": "a",
        "discount_vnd": 99999999,
        "priority": 1,
        "group": "one",
        "start": NOW,
        "end": NOW + timedelta(minutes=3),
        "plan_ids": ["plan1"],
        "region_ids": ["hanoi"],
    }
    q = engine()([price()], "plan1", "hanoi", None, 6, NOW, [promo], 1)
    assert q["initial_total_vnd"] == 0
    assert q["expires_at"] == (NOW + timedelta(minutes=3)).isoformat()


def test_crypto_phone_and_token():
    from pagefpt.core.crypto import Crypto, normalize_phone
    from pagefpt.core.errors import DomainError

    assert normalize_phone("0901 234 567") == "+84901234567"
    c = Crypto("e" * 32, "m" * 32, "t" * 32)
    a, b = c.encrypt("+84901234567"), c.encrypt("+84901234567")
    assert a != b and c.decrypt(a) == "+84901234567"
    assert c.match("+84901234567") != "+84901234567"
    token = c.sign({"purpose": "quote", "exp": NOW.timestamp() + 60})
    assert c.verify(token, "quote", NOW)["purpose"] == "quote"
    with pytest.raises(DomainError):
        c.verify(token + "x", "quote", NOW)
    with pytest.raises(DomainError):
        c.verify(token, "feedback", NOW)


@pytest.mark.parametrize(
    ("rows", "expected"),
    [
        (
            [
                price("region", "ward", 230000),
                price("region", "province", 210000),
                price("group", "north", 190000),
                price("default", "any", 180000),
            ],
            230000,
        ),
        (
            [
                price("region", "province", 210000),
                price("group", "north", 190000),
                price("default", "any", 180000),
            ],
            210000,
        ),
        ([price("group", "north", 190000), price("default", "any", 180000)], 190000),
        ([price("default", "any", 180000)], 180000),
        ([price("region", "ward", 230000, end=NOW), price("region", "province", 210000)], 210000),
    ],
)
def test_ward_province_group_default_precedence(rows, expected):
    q = engine()(rows, "plan1", "ward", "north", 6, NOW, [], 1, region_path=["ward", "province"])
    assert q["monthly_vnd"] == expected
    assert q["region_id"] == "ward"


def test_ward_inherits_province_promotion():
    promo = {
        "id": "qa-promo",
        "priority": 1,
        "discount_vnd": 10000,
        "start": NOW,
        "end": NOW + timedelta(hours=1),
        "region_ids": ["province"],
    }
    q = engine()(
        [price("region", "province", 210000)],
        "plan1",
        "ward",
        None,
        6,
        NOW,
        [promo],
        1,
        region_path=["ward", "province"],
    )
    assert q["promotion_ids"] == ["qa-promo"]
    assert q["line_items"]["discount_vnd"] == 10000


def test_quote_line_items_reconcile_fees_vat_and_discount():
    promo = {
        "id": "discount",
        "discount_vnd": 100000,
        "priority": 1,
        "group": "discount",
        "start": NOW,
        "end": NOW + timedelta(hours=1),
    }
    quote = engine()(
        [price(vat_included=False, vat_bps=1000)], "plan1", "hanoi", None, 6, NOW, [promo], 1
    )
    items = quote["line_items"]
    assert items["term_vnd"] == 1200000
    assert items["setup_vnd"] == 100000
    assert items["equipment_vnd"] == 50000
    assert items["vat_added_vnd"] == 135000
    assert (
        items["term_vnd"]
        + items["setup_vnd"]
        + items["equipment_vnd"]
        + items["vat_added_vnd"]
        - items["discount_vnd"]
        == quote["initial_total_vnd"]
    )
