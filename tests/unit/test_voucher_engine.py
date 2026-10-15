from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pagefpt.modules.vouchers.engine import apply_voucher

NOW = datetime(2026, 10, 13, tzinfo=UTC)


def campaign(**kw):
    return dict(
        id=str(uuid4()),
        published_version=1,
        code="TEST",
        name="Test",
        start=(NOW - timedelta(days=1)).isoformat(),
        end=(NOW + timedelta(days=1)).isoformat(),
        plan_ids=[],
        services=[],
        billing_months=[1, 6, 12],
        stackable=False,
        rules=[
            dict(
                key="default",
                region_id=None,
                discount_kind="fixed",
                amount=100000,
                basis="initial",
                cap_vnd=None,
                quota=None,
                gift_product_id=None,
            )
        ],
        exclusions=[],
        **kw,
    )


def quote():
    return dict(
        status="confirmed",
        plan_id="p",
        region_id="w",
        billing_months=6,
        monthly_vnd=200000,
        initial_total_vnd=1200000,
        promotion_ids=[],
        expires_at=(NOW + timedelta(minutes=15)).isoformat(),
        line_items=dict(term_vnd=1200000, setup_vnd=0, equipment_vnd=0, discount_vnd=0),
    )


def test_ward_priority_and_explicit_exclusion():
    c = campaign()
    c["rules"] += [
        dict(c["rules"][0], key="province", region_id="p", amount=200000),
        dict(c["rules"][0], key="ward", region_id="w", amount=300000),
    ]
    q = quote()
    apply_voucher(q, c, ["w", "p"], {"id": "p", "service": "internet"}, NOW)
    assert q["initial_total_vnd"] == 900000 and q["voucher"]["rule_key"] == "ward"
    c["exclusions"] = ["p"]
    q = quote()
    apply_voucher(q, c, ["w", "p"], {"id": "p"}, NOW)
    assert q["voucher"]["status"] == "area_excluded" and q["initial_total_vnd"] == 1200000


def test_monthly_percentage_rounding_cap_and_total():
    c = campaign()
    c["rules"][0].update(discount_kind="percent", amount=500, basis="monthly", cap_vnd=7000)
    q = quote()
    apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
    assert q["monthly_vnd"] == 193000
    assert q["initial_total_vnd"] == 1158000
    assert q["voucher"]["discount_vnd"] == 42000


def test_monthly_voucher_updates_period_average_without_repricing_the_term():
    c = campaign()
    c["rules"][0].update(discount_kind="percent", amount=500, basis="monthly", cap_vnd=7000)
    q = {**quote(), "display_monthly_vnd": 175000, "service_months": 7}
    apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
    assert q["display_monthly_vnd"] == 169000
    assert q["initial_total_vnd"] == 1158000


def test_does_not_stack_unless_enabled_and_never_goes_negative():
    c = campaign()
    q = quote()
    q["promotion_ids"] = ["promo"]
    apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
    assert q["voucher"]["status"] == "promotion_conflict"
    c["stackable"] = True
    c["rules"][0]["amount"] = 2000000
    q = quote()
    apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
    assert q["initial_total_vnd"] == 0


def test_future_expired_and_wrong_term_do_not_discount():
    for change, status in [
        ({"start": (NOW + timedelta(days=1)).isoformat()}, "not_started"),
        ({"end": NOW.isoformat()}, "expired"),
        ({"billing_months": [12]}, "term_mismatch"),
    ]:
        c = campaign()
        c.update(change)
        q = quote()
        apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
        assert q["voucher"]["status"] == status and q["initial_total_vnd"] == 1200000


def test_gift_does_not_charge_again_or_silently_disappear():
    c = campaign()
    c["rules"][0]["gift_product_id"] = "gift"
    for gift, ids, status in [
        (None, [], "gift_unavailable"),
        (
            {
                "id": "gift",
                "cost_vnd": 100,
                "name": "Camera",
                "plan_ids": ["other"],
                "service": "internet",
            },
            [],
            "gift_incompatible",
        ),
        (
            {
                "id": "gift",
                "cost_vnd": 100,
                "name": "Camera",
                "plan_ids": [],
                "service": "internet",
            },
            ["gift"],
            "gift_selected",
        ),
    ]:
        c["rules"][0]["gift"] = gift
        q = quote()
        q["accessory_ids"] = ids
        apply_voucher(q, c, ["w"], {"id": "p", "service": "internet"}, NOW)
        assert q["voucher"]["status"] == status and q["initial_total_vnd"] == 1200000


def test_stackable_service_discount_never_spends_accessory_charges():
    for basis in ("initial", "monthly", "setup", "equipment"):
        c = campaign()
        c["stackable"] = True
        c["rules"][0].update(basis=basis, amount=100000)
        q = quote()
        q.update(initial_total_vnd=60000, accessory_once_vnd=60000, promotion_ids=["all-service"])
        q["line_items"].update(setup_vnd=100000, equipment_vnd=100000)
        apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
        assert q["initial_total_vnd"] == 60000, basis
        assert q["voucher"]["discount_vnd"] == 0


def test_known_insufficient_budget_does_not_advertise_an_unreservable_discount():
    for basis in ("initial", "monthly"):
        c = campaign()
        c["remaining_budget_vnd"] = 99999
        c["rules"][0]["basis"] = basis
        q = quote()
        apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
        assert q["voucher"]["status"] == "sold_out"
        assert q["initial_total_vnd"] == 1200000
        assert q["monthly_vnd"] == 200000


def test_zero_effect_discount_cannot_be_held_as_an_eligible_benefit():
    c = campaign()
    c["rules"][0].update(basis="setup", amount=100000)
    q = quote()
    apply_voucher(q, c, ["w"], {"id": "p"}, NOW)
    assert q["voucher"]["status"] == "no_benefit"
    assert q["initial_total_vnd"] == 1200000
    assert "budget_cost_vnd" not in q["voucher"]
