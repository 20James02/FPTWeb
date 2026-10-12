import pytest

from tests.integration.test_telecom_landing import body


@pytest.mark.parametrize("order", [["hero", "hero", "plans"], ["hero", "not-a-section"]])
async def test_landing_rejects_ambiguous_section_order(admin, order):
    response = await admin.post("/api/v1/admin/pages", json=body(section_order=order))
    assert response.status_code == 422


async def test_partial_section_order_preserves_required_landing_content(admin):
    response = await admin.post("/api/v1/admin/landing-preview", json=body(section_order=["faq"]))
    assert response.status_code == 200
    assert 'id="lp-home"' in response.text
    assert 'id="lp-plans"' in response.text
    assert "data-lp-form" in response.text


async def test_hero_uses_configured_features_without_inventing_offer_promises(admin):
    response = await admin.post(
        "/api/v1/admin/landing-preview",
        json=body(hero_features=[{"title": "QA địa bàn", "text": "Kiểm tra trước khi chốt"}]),
    )
    assert response.status_code == 200
    assert "QA địa bàn" in response.text
    for promise in ["Miễn phí lắp đặt 100%", "Triển khai nhanh 12-24h", "Tư vấn trong 5-15 phút"]:
        assert promise not in response.text
