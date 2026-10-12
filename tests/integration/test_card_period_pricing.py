from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_accessories import setup


async def test_coefficient_period_matrix_and_original_offer_snapshot(admin, gateway):
    plan, region = await setup(admin, gateway)
    for months, factor in [(1, "1"), (12, "0.95")]:
        r = await admin.post(
            "/api/v1/admin/prices",
            json={
                "plan_id": plan["id"],
                "scope_kind": "region",
                "scope_id": region["id"],
                "billing_months": months,
                "monthly_vnd": 220000,
                "monthly_coefficient": factor,
                "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
                "source": "QA",
            },
        )
        assert r.status_code == 201, r.text
        p = r.json()
        assert float(p["monthly_coefficient"]) == float(factor)
        assert (
            await admin.post(
                f"/api/v1/admin/prices/{p['id']}/publish", json={"expected_version": p["version"]}
            )
        ).status_code == 200
    r = await admin.post(
        "/api/v1/admin/products",
        json={
            "name": "QA offer",
            "code": "qa-offer",
            "service": "internet",
            "price_vnd": 30000,
            "original_price_vnd": 50000,
            "offer_label": "Ưu đãi cùng gói",
            "billing_mode": "monthly",
        },
    )
    assert r.status_code == 201, r.text
    a = r.json()
    assert (
        await admin.post(
            f"/api/v1/admin/products/{a['id']}/publish", json={"expected_version": a["version"]}
        )
    ).status_code == 200
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={
                "plan_id": plan["id"],
                "region_id": region["id"],
                "billing_months": 12,
                "accessory_ids": [a["id"]],
            },
        )
    ).json()
    assert q["monthly_vnd"] == 209000
    assert q["base_monthly_vnd"] == 220000
    assert q["line_items"]["term_vnd"] == 209000 * 12
    assert q["initial_total_vnd"] == (209000 + 30000) * 12
    assert {o["billing_months"] for o in q["billing_options"]} == {1, 6, 12}
    assert (
        next(o for o in q["billing_options"] if o["billing_months"] == 1)["monthly_vnd"] == 220000
    )
    assert q["accessory_snapshot"][0]["original_price_vnd"] == 50000
    assert q["accessory_snapshot"][0]["offer_label"] == "Ưu đãi cùng gói"
    # Preview amounts are not signed alternative quotes.
    assert all("quote_token" not in o for o in q["billing_options"])


@pytest.mark.parametrize("factor", ["-0.1", "100.1", "0.12345", "NaN", "Infinity"])
async def test_invalid_coefficient_rejected(admin, gateway, factor):
    plan, region = await setup(admin, gateway)
    r = await admin.post(
        "/api/v1/admin/prices",
        json={
            "plan_id": plan["id"],
            "scope_id": region["id"],
            "scope_kind": "region",
            "billing_months": 1,
            "monthly_vnd": 1,
            "monthly_coefficient": factor,
            "start": datetime.now(UTC).isoformat(),
            "source": "QA",
        },
    )
    assert r.status_code == 422


async def test_original_price_and_card_labels_validation_and_admin_pages(admin, gateway):
    bad = await admin.post(
        "/api/v1/admin/products",
        json={
            "name": "QA",
            "code": "qa",
            "service": "internet",
            "price_vnd": 200,
            "original_price_vnd": 100,
        },
    )
    assert bad.status_code == 422
    p = await admin.post(
        "/api/v1/admin/plans",
        json={
            "name": "QA labels",
            "code": "qa-labels",
            "service": "internet",
            "card_labels": {"badge": "Theo nhu cầu", "register": "Đăng ký gói"},
        },
    )
    assert p.status_code == 201, p.text
    row = p.json()
    assert (
        await admin.post(
            f"/api/v1/admin/plans/{row['id']}/publish", json={"expected_version": row["version"]}
        )
    ).status_code == 200
    html = (await admin.get("/")).text
    assert "Theo nhu cầu" in html and "plan-details-dialog" in html
    for page in ["appearance", "navigation"]:
        response = await admin.get("/admin/" + page)
        assert response.status_code == 200
        assert (
            "home-merchandising-form" in response.text
            if page == "appearance"
            else "navigation-form" in response.text
        )


async def test_navigation_cas_safe_urls_and_public_rendering(admin, gateway):
    settings = (await admin.get("/api/v1/system/display-settings")).json()
    items = [
        {
            "id": "qa-link",
            "label": "QA menu",
            "href": "/khuyen-mai",
            "preset": "custom",
            "enabled": True,
            "children": [{"label": "QA mục con", "href": "/chinh-sach-bao-mat"}],
        }
    ]
    saved = await admin.post(
        "/api/v1/system/display-settings",
        json={"expected_version": settings["version"], "navigation_items": items},
    )
    assert saved.status_code == 200, saved.text
    html = (await admin.get("/")).text
    assert "QA menu" in html and "QA mục con" in html
    assert (
        await admin.post(
            "/api/v1/system/display-settings",
            json={"expected_version": settings["version"], "navigation_items": []},
        )
    ).status_code == 409
    for href in ["javascript:alert(1)", "//evil.test", "https://x.test@evil.test", "/\\evil.test"]:
        bad = await admin.post(
            "/api/v1/system/display-settings",
            json={
                "expected_version": saved.json()["settings"]["version"],
                "navigation_items": [{**items[0], "href": href}],
            },
        )
        assert bad.status_code == 422


async def test_csv_apply_and_draft_edit_keep_coefficient(admin, gateway):
    plan, region = await setup(admin, gateway)
    csv = (
        "plan_id,scope_id,scope_kind,billing_months,monthly_vnd,monthly_coefficient,start,source\n"
        + f"{plan['id']},{region['id']},region,12,5,0.1,{datetime.now(UTC).isoformat()},QA"
    )
    preview = (await admin.post("/api/v1/admin/prices/imports/preview", json={"csv": csv})).json()
    applied = await admin.post(
        "/api/v1/admin/prices/imports/apply",
        json={"csv": csv, "approval_token": preview["approval_token"]},
    )
    assert applied.status_code == 201, applied.text
    rows = (await admin.get("/api/v1/admin/prices")).json()["items"]
    row = next(p for p in rows if p["plan_id"] == plan["id"] and p["billing_months"] == 12)
    assert float(row["monthly_coefficient"]) == 0.1
    body = {
        k: row[k]
        for k in [
            "plan_id",
            "scope_id",
            "scope_kind",
            "billing_months",
            "monthly_vnd",
            "monthly_coefficient",
            "setup_vnd",
            "equipment_vnd",
            "vat_included",
            "vat_bps",
            "gift_months",
            "start",
            "end",
            "source",
        ]
    }
    edit = await admin.put(
        "/api/v1/admin/prices/" + row["id"], params={"expected_version": row["version"]}, json=body
    )
    assert edit.status_code == 200 and float(edit.json()["monthly_coefficient"]) == 0.1
    row = edit.json()
    assert (
        await admin.post(
            "/api/v1/admin/prices/" + row["id"] + "/publish",
            json={"expected_version": row["version"]},
        )
    ).status_code == 200
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "billing_months": 12},
        )
    ).json()
    assert q["monthly_vnd"] == 1 and q["initial_total_vnd"] == 12
