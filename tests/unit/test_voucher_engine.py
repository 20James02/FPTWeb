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


def test_physical_gift_campaign_is_eligible_even_with_zero_cash_discount():
    c = campaign(
        program_type="physical_gift",
        physical_gift=dict(
            name="Camera FPT Outdoor IQ3",
            market_value_vnd=1200000,
            image_url="https://example.com/camera.jpg",
            delivery_type="installation",
            condition_note="Tặng kèm gói cước",
            stock_total=100,
        ),
        popup_config=dict(
            eyebrow="🎁 ĐẠI TIỆC QUÀ TẶNG",
            title="Nhận Camera FPT Outdoor",
            hero_prefix="TẶNG MIỄN PHÍ",
            hero_highlight="CAMERA AI",
            cta_text="ĐĂNG KÝ NHẬN QUÀ NGAY",
        ),
    )
    c["rules"][0].update(basis="initial", amount=0)
    q = quote()
    apply_voucher(q, c, ["w"], {"id": "p", "service": "internet"}, NOW)
    assert q["voucher"]["status"] == "eligible"
    assert q["voucher"]["discount_vnd"] == 0
    assert q["voucher"]["physical_gift"]["name"] == "Camera FPT Outdoor IQ3"


def test_voucher_input_schema_validation_with_physical_gift():
    from pagefpt.modules.vouchers.schemas import PhysicalGift, PopupConfig, VoucherInput

    data = dict(
        code="GIFT-CAM",
        name="Quà tặng Camera FPT",
        label="Ưu đãi quà",
        terms="Áp dụng lắp mới",
        start=NOW,
        end=NOW + timedelta(days=7),
        quota=50,
        budget_vnd=50000000,
        rules=[dict(key="default", amount=0)],
        program_type="physical_gift",
        physical_gift=PhysicalGift(
            name="Camera Outdoor IQ3",
            market_value_vnd=1200000,
            delivery_type="installation",
        ),
        popup_config=PopupConfig(
            title="Tặng Camera FPT",
            cta_text="Nhận quà ngay",
        ),
    )
    validated = VoucherInput(**data)
    assert validated.physical_gift.name == "Camera Outdoor IQ3"
    assert validated.popup_config.title == "Tặng Camera FPT"
    assert validated.program_type == "physical_gift"


def test_voucher_popup_config_field_toggles():
    from pagefpt.modules.vouchers.schemas import PopupConfig

    default_cfg = PopupConfig()
    assert default_cfg.show_eyebrow is True
    assert default_cfg.show_subtitle is True
    assert default_cfg.show_hero is True
    assert default_cfg.show_benefits is True
    assert default_cfg.show_code_box is True
    assert default_cfg.show_terms is True
    assert default_cfg.show_reassurance is True
    assert default_cfg.show_dismiss is True

    custom_cfg = PopupConfig(
        show_hero=False,
        show_code_box=False,
        show_dismiss=False,
    )
    assert custom_cfg.show_hero is False
    assert custom_cfg.show_code_box is False
    assert custom_cfg.show_dismiss is False
    assert custom_cfg.show_eyebrow is True
    dumped = custom_cfg.model_dump()
    assert dumped["show_hero"] is False
    assert dumped["show_code_box"] is False
    assert dumped["show_dismiss"] is False


