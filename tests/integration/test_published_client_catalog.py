import pytest


@pytest.mark.asyncio
async def test_client_cards_are_bound_to_published_catalog(admin):
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={
                "name": "Published QA Package",
                "service": "internet",
                "code": "qa-published-card",
                "speed_mbps": 321,
                "equipment": ["QA equipment"],
            },
        )
    ).json()
    before = await admin.get("/")
    assert f'data-plan-id="{plan["id"]}"' not in before.text
    assert (
        await admin.post(
            f"/api/v1/admin/plans/{plan['id']}/publish", json={"expected_version": plan["version"]}
        )
    ).status_code == 200
    after = await admin.get("/")
    assert f'data-plan-id="{plan["id"]}"' in after.text
    assert "Published QA Package" in after.text
    assert "185.000" not in after.text and "225.000" not in after.text
    detail = await admin.get("/san-pham/internet-gia-dinh")
    assert f'data-plan-id="{plan["id"]}"' in detail.text


@pytest.mark.asyncio
async def test_empty_catalog_has_no_invented_package_cards(client):
    response = await client.get("/")
    assert "data-plan-id=" not in response.text
    assert "Chưa có gói được công bố" in response.text


@pytest.mark.asyncio
async def test_campaign_form_uses_published_ids_and_generic_empty_choice(admin):
    ids = {}
    for kind, payload in [
        ("plans", {"name": "QA Campaign Plan", "code": "qa-campaign", "service": "internet"}),
        (
            "regions",
            {
                "name": "QA Campaign Region",
                "code": "qa-region",
                "zone_id": "mien_nam",
                "branch_id": "00000000-0000-0000-0000-000000000000",
            },
        ),
    ]:
        created = (await admin.post(f"/api/v1/admin/{kind}", json=payload)).json()
        assert (
            await admin.post(
                f"/api/v1/admin/{kind}/{created['id']}/publish",
                json={"expected_version": created["version"]},
            )
        ).status_code == 200
        ids[kind] = created["id"]
    text = (await admin.get("/khuyen-mai")).text
    assert f'<option value="{ids["plans"]}">QA Campaign Plan</option>' in text
    assert f'<option value="{ids["regions"]}">QA Campaign Region</option>' in text
    assert '<option value="">Tư vấn gói phù hợp</option>' in text
    assert '<option value="hn">' not in text and '<option value="Gói Sky' not in text


@pytest.mark.asyncio
async def test_stored_runline_html_is_escaped_in_server_rendering(admin):
    current = (await admin.get("/api/v1/system/display-settings")).json()
    marker = '<img src="/qa-missing" onerror="window.__qaRunlineHtml=1">'
    assert (
        await admin.post(
            "/api/v1/system/display-settings",
            json={"expected_version": current["version"], "runline_text": marker},
        )
    ).status_code == 200
    rendered = (await admin.get("/")).text
    assert marker not in rendered
    assert "&lt;img src=" in rendered
