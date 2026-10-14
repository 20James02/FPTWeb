from urllib.parse import parse_qs, urlparse

from tests.integration.test_vouchers import campaign_body, create


async def test_live_link_redirects_with_intent_and_safe_benefit_context(admin):
    voucher = await create(admin)
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "acquisition-live", "target": "/"},
    )
    result = await admin.get("/s/acquisition-live", follow_redirects=False)
    assert result.status_code == 302
    assert parse_qs(urlparse(result.headers["location"]).query)["pf_offer"] == ["acquisition-live"]
    context = (await admin.get("/api/v1/vouchers/context")).json()["voucher"]
    assert context["benefits"][0]["amount"] == 100000
    assert context["benefits"][0]["region_name"] == "Toàn quốc"
    assert "cost_vnd" not in str(context) and "remaining_budget" not in str(context)


async def test_draft_link_reaches_target_without_setting_a_voucher_cookie(admin):
    voucher = (await admin.post("/api/v1/admin/vouchers", json=campaign_body())).json()
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "acquisition-draft", "target": "/"},
    )
    result = await admin.get("/s/acquisition-draft", follow_redirects=False)
    assert result.status_code == 302, result.text
    query = parse_qs(urlparse(result.headers["location"]).query)
    assert query["pf_offer"] == ["acquisition-draft"]
    assert query.get("pf_link_source"), (
        "Unavailable campaign still has legitimate public link source for general consultation"
    )
    context = (await admin.get("/api/v1/vouchers/context")).json()
    assert context["voucher"] is None
    assert not any(c.name == "pagefpt_voucher" for c in admin.cookies.jar)
    assert (await admin.get("/s/no-such-acquisition", follow_redirects=False)).status_code == 404
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "acquisition-draft", "target": "/", "active": False},
    )
    assert (await admin.get("/s/acquisition-draft", follow_redirects=False)).status_code == 404
