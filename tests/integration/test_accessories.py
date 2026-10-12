from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg


async def setup(admin, gateway):
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        branch = c.execute("SELECT branch_id FROM private.memberships LIMIT 1").fetchone()[0]
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "QA base", "code": "qa-base", "service": "internet"},
        )
    ).json()
    region = (
        await admin.post(
            "/api/v1/admin/regions",
            json={"name": "QA Province", "code": "qa-province", "branch_id": str(branch)},
        )
    ).json()
    for path, row in [("plans", plan), ("regions", region)]:
        assert (
            await admin.post(
                f"/api/v1/admin/{path}/{row['id']}/publish",
                json={"expected_version": row["version"]},
            )
        ).status_code == 200
    price = (
        await admin.post(
            "/api/v1/admin/prices",
            json={
                "plan_id": plan["id"],
                "scope_id": region["id"],
                "scope_kind": "region",
                "billing_months": 6,
                "monthly_vnd": 200000,
                "vat_included": False,
                "vat_bps": 1000,
                "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
                "source": "QA",
            },
        )
    ).json()
    assert (
        await admin.post(
            f"/api/v1/admin/prices/{price['id']}/publish",
            json={"expected_version": price["version"]},
        )
    ).status_code == 200
    return plan, region


async def product(admin, plan, mode, price, code="qa-device"):
    r = await admin.post(
        "/api/v1/admin/products",
        json={
            "name": "QA device",
            "code": code,
            "service": "internet",
            "plan_ids": [plan["id"]],
            "price_vnd": price,
            "billing_mode": mode,
        },
    )
    assert r.status_code == 201, r.text
    row = r.json()
    p = await admin.post(
        f"/api/v1/admin/products/{row['id']}/publish", json={"expected_version": row["version"]}
    )
    assert p.status_code == 200, p.text
    return p.json()


async def test_accessories_final_prices_outside_package_vat_and_signed_lead_snapshot(
    admin, gateway
):
    plan, region = await setup(admin, gateway)
    once = await product(admin, plan, "one_time", 500000)
    monthly = await product(admin, plan, "monthly", 30000, "qa-monthly")
    q = await admin.post(
        "/api/v1/quotes",
        json={
            "plan_id": plan["id"],
            "region_id": region["id"],
            "billing_months": 6,
            "accessory_ids": [once["id"], monthly["id"]],
        },
    )
    assert q.status_code == 200, q.text
    quote = q.json()
    assert quote["initial_total_vnd"] == 200000 * 6 * 1.1 + 500000 + 30000 * 6
    assert quote["accessory_monthly_vnd"] == 30000 and quote["accessory_once_vnd"] == 500000
    lead = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": "qa-accessories-" + uuid4().hex},
        json={
            "phone": "0981234567",
            "plan_id": plan["id"],
            "region_id": region["id"],
            "accessory_ids": [once["id"], monthly["id"]],
            "quote_token": quote["quote_token"],
            "consent_version": "qa-v1",
        },
    )
    assert lead.status_code == 201, lead.text
    with psycopg.connect(gateway.dsn) as c:
        lid = str(c.execute("SELECT id FROM private.leads LIMIT 1").fetchone()[0])
    detail = (await admin.get("/api/v1/admin/leads/" + lid)).json()
    assert detail["quote"]["initial_total_vnd"] == quote["initial_total_vnd"]
    assert len(detail["payload"]["accessory_snapshot"]) == 2
    assert {a["price_vnd"] for a in detail["payload"]["accessory_snapshot"]} == {500000, 30000}


async def test_draft_incompatible_and_duplicate_accessories_rejected(admin, gateway):
    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "one_time", 0)
    path = "/api/v1/quotes"
    base = {"plan_id": plan["id"], "region_id": region["id"]}
    assert (
        await admin.post(path, json={**base, "accessory_ids": [a["id"], a["id"]]})
    ).status_code == 422
    assert (
        await admin.post(path, json={**base, "accessory_ids": [str(uuid4())]})
    ).status_code == 422
    draft = (
        await admin.post(
            "/api/v1/admin/products",
            json={
                "name": "QA",
                "code": "qa-draft",
                "service": "camera",
                "price_vnd": 100,
                "billing_mode": "monthly",
            },
        )
    ).json()
    assert (
        await admin.post(path, json={**base, "accessory_ids": [draft["id"]]})
    ).status_code == 422
    assert (
        await admin.post(
            "/api/v1/admin/products",
            json={"name": "Bad", "code": "bad", "service": "internet", "price_vnd": -1},
        )
    ).status_code == 422


async def test_public_products_use_published_snapshot_and_retirement_invalidates_quotes(
    admin, gateway
):
    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "monthly", 30000)
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "accessory_ids": [a["id"]]},
        )
    ).json()
    assert (await admin.get("/api/v1/accessories")).status_code == 200
    assert (
        await admin.post(
            f"/api/v1/admin/products/{a['id']}/retire", json={"expected_version": a["version"]}
        )
    ).status_code == 200
    assert (await admin.get("/api/v1/accessories")).json()["items"] == []
    with psycopg.connect(gateway.dsn) as c:
        revision = c.execute("SELECT version FROM private.catalog_revision WHERE id").fetchone()[0]
    assert revision > q["revision"]


async def test_admin_accessory_page_and_public_choices_exist(admin, gateway):
    plan, _ = await setup(admin, gateway)
    await product(admin, plan, "monthly", 30000)
    r = await admin.get("/admin/accessories")
    assert r.status_code == 200 and "accessory-editor" in r.text
    html = (await admin.get("/")).text
    assert "data-accessory-id=" in html and "data-billing-months" in html


async def test_forged_quote_device_scope_does_not_confirm_different_selection(admin, gateway):
    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "monthly", 30000)
    quote = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "accessory_ids": [a["id"]]},
        )
    ).json()
    lead = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": "scope-accessories-" + uuid4().hex},
        json={
            "phone": "0987654321",
            "plan_id": plan["id"],
            "region_id": region["id"],
            "accessory_ids": [],
            "quote_token": quote["quote_token"],
            "consent_version": "qa",
        },
    )
    assert lead.status_code == 201
    with psycopg.connect(gateway.dsn) as c:
        state = c.execute("SELECT quote_status FROM private.leads LIMIT 1").fetchone()[0]
    assert state == "needs_confirmation"


async def test_accessories_admin_cursor_and_quote_rejects_obsolete_device_snapshot(admin, gateway):
    from copy import deepcopy

    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "one_time", 100000)
    await product(admin, plan, "monthly", 10000, "qa-second")
    first = (await admin.get("/api/v1/admin/products?limit=1")).json()
    assert first.get("next_cursor"), first
    second = (
        await admin.get(
            "/api/v1/admin/products", params={"limit": 1, "before": first["next_cursor"]}
        )
    ).json()
    assert second["items"][0]["id"] != first["items"][0]["id"]
    quote = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "accessory_ids": [a["id"]]},
        )
    ).json()
    update = await admin.put(
        "/api/v1/admin/products/" + a["id"],
        params={"expected_version": a["version"]},
        json={**a["payload"], "price_vnd": 200000},
    )
    assert update.status_code == 200, update.text
    row = update.json()
    assert (
        await admin.post(
            "/api/v1/admin/products/" + row["id"] + "/publish",
            json={"expected_version": row["version"]},
        )
    ).status_code == 200
    revision = (
        await gateway.rpc(
            "dispatch",
            {
                "command": {
                    "op": "pricing_data",
                    "plan_id": plan["id"],
                    "region_id": region["id"],
                    "billing_months": 6,
                }
            },
        )
    )["revision"]
    stale = deepcopy(quote)
    stale.pop("quote_token", None)
    stale["revision"] = revision
    import pytest

    from pagefpt.core.errors import DomainError

    with pytest.raises(DomainError) as error:
        await gateway.rpc("dispatch", {"command": {"op": "quote_save", "payload": stale}})
    assert error.value.code == "QUOTE_STALE"


async def test_retry_returns_original_receipt_after_accessory_retired(admin, gateway):
    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "one_time", 100000)
    headers = {"Idempotency-Key": "qa-retry-" + uuid4().hex}
    body = {
        "phone": "0981122334",
        "consent_version": "qa",
        "plan_id": plan["id"],
        "region_id": region["id"],
        "accessory_ids": [a["id"]],
    }
    first = await admin.post("/api/v1/leads", json=body, headers=headers)
    assert first.status_code == 201
    assert (
        await admin.post(
            "/api/v1/admin/products/" + a["id"] + "/retire", json={"expected_version": a["version"]}
        )
    ).status_code == 200
    retry = await admin.post("/api/v1/leads", json=body, headers=headers)
    assert retry.status_code == 200, retry.text
    assert retry.json()["receipt"] == first.json()["receipt"]
    assert (
        await admin.post("/api/v1/leads", json={**body, "name": "Changed body"}, headers=headers)
    ).status_code == 409


async def test_quote_cannot_use_accessory_from_old_plan_service(admin, gateway):
    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "monthly", 10000)
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "accessory_ids": [a["id"]]},
        )
    ).json()
    current = (await admin.get("/api/v1/admin/plans/" + plan["id"])).json()
    updated = (
        await admin.put(
            "/api/v1/admin/plans/" + plan["id"],
            params={"expected_version": current["version"]},
            json={**current["payload"], "service": "camera"},
        )
    ).json()
    assert (
        await admin.post(
            "/api/v1/admin/plans/" + plan["id"] + "/publish",
            json={"expected_version": updated["version"]},
        )
    ).status_code == 200
    revision = (
        await gateway.rpc(
            "dispatch",
            {
                "command": {
                    "op": "pricing_data",
                    "plan_id": plan["id"],
                    "region_id": region["id"],
                    "billing_months": 6,
                }
            },
        )
    )["revision"]
    q.pop("quote_token", None)
    q["revision"] = revision
    import pytest

    from pagefpt.core.errors import DomainError

    with pytest.raises(DomainError) as error:
        await gateway.rpc("dispatch", {"command": {"op": "quote_save", "payload": q}})
    assert error.value.code == "QUOTE_STALE"
