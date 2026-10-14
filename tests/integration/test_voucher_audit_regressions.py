"""Deep voucher regression coverage using disposable PostgreSQL only."""

import asyncio
from uuid import uuid4

import psycopg

from tests.integration.test_accessories import product, setup
from tests.integration.test_landing_campaign import campaign
from tests.integration.test_vouchers import campaign_body, confirm, create, intake, reserve


async def test_expired_hold_can_be_reserved_again(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin, quota=1)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    first = (await reserve(admin, lid)).json()
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.voucher_redemptions SET expires_at=now()-interval '1 second' WHERE lead_id=%s",
            [lid],
        )
    again = await reserve(admin, lid)
    assert again.status_code == 200, again.text
    assert again.json()["id"] != first["id"]
    assert not again.json().get("replayed")


async def test_gift_changed_to_monthly_cannot_be_reserved(admin, gateway):
    plan, region = await setup(admin, gateway)
    gift = await product(admin, plan, "one_time", 500000)
    await admin.put(
        "/api/v1/admin/vouchers/inventory",
        json={"product_id": gift["id"], "stock": 2, "cost_vnd": 350000},
    )
    await create(admin, rules=[{"key": "default", "amount": 100000, "gift_product_id": gift["id"]}])
    changed = await admin.put(
        "/api/v1/admin/products/" + gift["id"] + "?expected_version=" + str(gift["version"]),
        json={**gift["payload"], "billing_mode": "monthly"},
    )
    assert changed.status_code == 200, changed.text
    published = await admin.post(
        "/api/v1/admin/products/" + gift["id"] + "/publish",
        json={"expected_version": changed.json()["version"]},
    )
    assert published.status_code == 200, published.text
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    result = await reserve(admin, lid)
    print("GIFT_BILLING_MODE", result.status_code, result.json().get("state"))
    assert result.status_code in (409, 422), "Recurring product was accepted as a one-time gift"


async def test_privacy_erasure_does_not_replenish_used_gift_and_budget(admin, gateway):
    plan, region = await setup(admin, gateway)
    gift = await product(admin, plan, "one_time", 500000)
    await admin.put(
        "/api/v1/admin/vouchers/inventory",
        json={"product_id": gift["id"], "stock": 1, "cost_vnd": 350000},
    )
    await create(
        admin, quota=1, rules=[{"key": "default", "amount": 100000, "gift_product_id": gift["id"]}]
    )
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region, status="installed")
    held = (await reserve(admin, lid)).json()
    used = await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/redeem",
        json={"expected_version": held["version"], "reason": "Synthetic gift delivered"},
    )
    assert used.status_code == 200, used.text
    request = await admin.post(
        "/api/v1/admin/privacy/requests",
        json={"lead_id": lid, "action": "delete", "reason": "Synthetic privacy erasure"},
    )
    assert request.status_code == 201, request.text
    erased = await admin.post("/api/v1/admin/privacy/requests/" + request.json()["id"] + "/execute")
    assert erased.status_code == 200, erased.text
    other = await intake(admin, gateway, plan, region, phone="0981234568")
    await confirm(gateway, other, plan, region)
    result = await reserve(admin, other)
    report = (await admin.get("/api/v1/admin/vouchers/report")).json()
    print("PRIVACY_CAPACITY", result.status_code, "report_cost", report["totals"]["cost_vnd"])
    assert result.status_code == 409, (
        "Delivered gift, quota and spent budget were replenished by deleting PII"
    )
    assert report["totals"]["cost_vnd"] == 450000
    assert report["totals"]["redeemed"] == 1
    with psycopg.connect(gateway.dsn) as db:
        row = db.execute(
            "SELECT lead_id,contact_id,link_slug,reason,snapshot,state FROM private.voucher_redemptions WHERE id=%s",
            [held["id"]],
        ).fetchone()
        assert row[:4] == (None, None, None, None)
        assert row[4] == {"anonymized": True, "installed": True}
        assert row[5] == "redeemed"


async def test_reservation_preserves_landing_campaign_price(admin, gateway):
    plan, region = await setup(admin, gateway)
    await campaign(admin, plan)
    await create(admin, stackable=True)
    quoted = await admin.post(
        "/api/v1/quotes",
        json={
            "plan_id": plan["id"],
            "region_id": region["id"],
            "billing_months": 6,
            "landing_slug": "qa-telecom",
            "voucher_code": "QA-VOUCHER",
        },
    )
    assert quoted.status_code == 200, quoted.text
    q = quoted.json()
    response = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={
            "phone": "0981234567",
            "plan_id": plan["id"],
            "region_id": region["id"],
            "voucher_code": "QA-VOUCHER",
            "quote_token": q["quote_token"],
            "consent_version": "qa",
        },
    )
    assert response.status_code == 201, response.text
    with psycopg.connect(gateway.dsn) as db:
        lid = str(
            db.execute(
                "SELECT id FROM private.leads WHERE receipt=%s", [response.json()["receipt"]]
            ).fetchone()[0]
        )
    await confirm(gateway, lid, plan, region)
    result = await reserve(admin, lid)
    assert result.status_code == 200, result.text
    snapshot = result.json()["snapshot"]
    print(
        "LANDING_PRICE",
        q["initial_total_vnd"],
        snapshot["initial_total_vnd"],
        "landing_kept",
        "landing" in snapshot,
    )
    assert snapshot["initial_total_vnd"] == q["initial_total_vnd"], (
        "Holding voucher silently replaced landing campaign price"
    )
    assert snapshot.get("landing", {}).get("slug") == "qa-telecom"


async def test_link_target_must_exist(admin):
    v = await create(admin)
    result = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/links",
        json={"slug": "missing-target", "target": "/not-existing-landing"},
    )
    print("LINK_MISSING_TARGET", result.status_code)
    assert result.status_code == 422


async def wait_advisory_count(dsn, count):
    for _ in range(250):
        with psycopg.connect(dsn) as db:
            n = db.execute(
                "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=771900 AND NOT granted"
            ).fetchone()[0]
        if n >= count:
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Audit race barrier was not reached")


async def test_same_slug_created_concurrently_cannot_overwrite_other_campaign(admin, gateway):
    a = await create(admin, code="QA-FIRST")
    b = await create(admin, code="QA-SECOND")
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "CREATE FUNCTION private.audit_link_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(771900); RETURN NEW; END $$"
        )
        db.execute(
            "CREATE TRIGGER audit_link_barrier BEFORE INSERT ON private.voucher_links FOR EACH ROW EXECUTE FUNCTION private.audit_link_barrier()"
        )
    tasks = []
    try:
        with psycopg.connect(gateway.dsn) as blocker:
            blocker.execute("SELECT pg_advisory_xact_lock(771900)")
            for record, channel in [(a, "first"), (b, "second")]:
                tasks.append(
                    asyncio.create_task(
                        admin.post(
                            f"/api/v1/admin/vouchers/{record['id']}/links",
                            json={"slug": "shared-race", "channel": channel},
                        )
                    )
                )
            await wait_advisory_count(gateway.dsn, 2)
            blocker.commit()
            responses = await asyncio.gather(*tasks)
        print(
            "LINK_RACE",
            [
                (r.status_code, r.json().get("voucher_id"), r.json().get("channel"))
                for r in responses
            ],
        )
        assert sorted(r.status_code for r in responses) == [201, 409]
    finally:
        await asyncio.gather(*tasks, return_exceptions=True)
        with psycopg.connect(gateway.dsn) as db:
            db.execute("DROP TRIGGER IF EXISTS audit_link_barrier ON private.voucher_links")
            db.execute("DROP FUNCTION private.audit_link_barrier()")


async def test_duplicate_code_race_returns_conflict_not_internal_error(admin, gateway):
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "CREATE FUNCTION private.audit_campaign_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(771900); RETURN NEW; END $$"
        )
        db.execute(
            "CREATE TRIGGER audit_campaign_barrier BEFORE INSERT ON private.vouchers FOR EACH ROW EXECUTE FUNCTION private.audit_campaign_barrier()"
        )
    tasks = []
    try:
        with psycopg.connect(gateway.dsn) as blocker:
            blocker.execute("SELECT pg_advisory_xact_lock(771900)")
            tasks = [
                asyncio.create_task(admin.post("/api/v1/admin/vouchers", json=campaign_body()))
                for _ in range(2)
            ]
            await wait_advisory_count(gateway.dsn, 2)
            blocker.commit()
            responses = await asyncio.gather(*tasks)
        print("CODE_RACE", [(r.status_code, r.json().get("code")) for r in responses])
        assert sorted(r.status_code for r in responses) == [201, 409]
    finally:
        await asyncio.gather(*tasks, return_exceptions=True)
        with psycopg.connect(gateway.dsn) as db:
            db.execute("DROP TRIGGER IF EXISTS audit_campaign_barrier ON private.vouchers")
            db.execute("DROP FUNCTION private.audit_campaign_barrier()")


async def test_percent_zero_cap_cannot_publish_discount_only_campaign(admin):
    result = await admin.post(
        "/api/v1/admin/vouchers",
        json=campaign_body(
            rules=[{"key": "default", "discount_kind": "percent", "amount": 500, "cap_vnd": 0}]
        ),
    )
    if result.status_code == 201:
        row = result.json()
        result = await admin.post(
            f"/api/v1/admin/vouchers/{row['id']}/publish", json={"expected_version": row["version"]}
        )
    print("ZERO_BENEFIT_PUBLISH", result.status_code)
    assert result.status_code == 422


async def test_landing_publication_change_before_reserve_is_rejected(admin, gateway):
    plan, region = await setup(admin, gateway)
    await campaign(admin, plan)
    await create(admin, stackable=True)
    quoted = (
        await admin.post(
            "/api/v1/quotes",
            json={
                "plan_id": plan["id"],
                "region_id": region["id"],
                "billing_months": 6,
                "landing_slug": "qa-telecom",
                "voucher_code": "QA-VOUCHER",
            },
        )
    ).json()
    response = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json={
            "phone": "0981234567",
            "plan_id": plan["id"],
            "region_id": region["id"],
            "voucher_code": "QA-VOUCHER",
            "quote_token": quoted["quote_token"],
            "consent_version": "qa",
        },
    )
    assert response.status_code == 201, response.text
    with psycopg.connect(gateway.dsn) as db:
        lid = str(
            db.execute(
                "SELECT id FROM private.leads WHERE receipt=%s", [response.json()["receipt"]]
            ).fetchone()[0]
        )
    await confirm(gateway, lid, plan, region)
    original_rpc = gateway.rpc

    async def republish_before_reservation(name, payload, actor_token=None):
        if payload.get("command", {}).get("op") == "voucher_reserve":
            with psycopg.connect(gateway.dsn) as db:
                db.execute(
                    "UPDATE private.resources SET published_version=published_version+1 WHERE kind='page' AND published_payload->>'slug'='qa-telecom'"
                )
        return await original_rpc(name, payload, actor_token)

    gateway.rpc = republish_before_reservation
    try:
        result = await reserve(admin, lid)
        assert result.status_code == 409, result.text
        assert result.json()["code"] == "QUOTE_STALE"
    finally:
        gateway.rpc = original_rpc


async def test_period_previews_preserve_selected_gift_conflict(admin, gateway):
    plan, region = await setup(admin, gateway)
    gift = await product(admin, plan, "one_time", 500000)
    await admin.put(
        "/api/v1/admin/vouchers/inventory",
        json={"product_id": gift["id"], "stock": 2, "cost_vnd": 350000},
    )
    await create(admin, rules=[{"key": "default", "amount": 100000, "gift_product_id": gift["id"]}])
    response = await admin.post(
        "/api/v1/quotes",
        json={
            "plan_id": plan["id"],
            "region_id": region["id"],
            "billing_months": 6,
            "accessory_ids": [gift["id"]],
            "voucher_code": "QA-VOUCHER",
        },
    )
    assert response.status_code == 200, response.text
    quote = response.json()
    assert quote["voucher"]["status"] == "gift_selected"
    for option in quote["billing_options"]:
        assert option.get("accessory_ids") == [gift["id"]]
        if option["status"] == "confirmed":
            assert option["voucher"]["status"] == "gift_selected"
            assert option["accessory_once_vnd"] == 500000
