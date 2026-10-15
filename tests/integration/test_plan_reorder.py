import pytest


@pytest.mark.asyncio
async def test_plan_reorder_and_sort_order(admin):
    # Create 3 plans
    p1 = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "Alpha Plan", "service": "internet", "code": "qa-alpha", "sort_order": 10},
        )
    ).json()
    p2 = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "Beta Plan", "service": "internet", "code": "qa-beta", "sort_order": 20},
        )
    ).json()
    p3 = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "Gamma Plan", "service": "internet", "code": "qa-gamma", "sort_order": 30},
        )
    ).json()

    # Publish all three
    for p in [p1, p2, p3]:
        r = await admin.post(
            f"/api/v1/admin/plans/{p['id']}/publish",
            json={"expected_version": p["version"]},
        )
        assert r.status_code == 200

    # Check /api/v1/catalog order
    catalog_res = await admin.get("/api/v1/catalog")
    assert catalog_res.status_code == 200
    items = catalog_res.json()["items"]
    ids_in_catalog = [item["id"] for item in items if item["id"] in [p1["id"], p2["id"], p3["id"]]]
    assert ids_in_catalog == [p1["id"], p2["id"], p3["id"]]

    # Now reorder to: Gamma (p3), Alpha (p1), Beta (p2)
    reorder_res = await admin.post(
        "/api/v1/admin/plans/reorder",
        json={"plan_ids": [p3["id"], p1["id"], p2["id"]]},
    )
    assert reorder_res.status_code == 200

    # Check /api/v1/catalog new order
    catalog_after = (await admin.get("/api/v1/catalog")).json()["items"]
    reordered_ids = [item["id"] for item in catalog_after if item["id"] in [p1["id"], p2["id"], p3["id"]]]
    assert reordered_ids == [p3["id"], p1["id"], p2["id"]]

    # Check client homepage cards order
    home_html = (await admin.get("/")).text
    pos_p3 = home_html.find(f'data-plan-id="{p3["id"]}"')
    pos_p1 = home_html.find(f'data-plan-id="{p1["id"]}"')
    pos_p2 = home_html.find(f'data-plan-id="{p2["id"]}"')
    assert pos_p3 != -1 and pos_p1 != -1 and pos_p2 != -1
    assert pos_p3 < pos_p1 < pos_p2
