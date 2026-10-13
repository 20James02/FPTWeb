import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

from tests.integration.test_accessories import product, setup


def campaign_body(**changes):
    now = datetime.now(UTC)
    values = dict(
        code="QA-VOUCHER",
        name="QA regional offer",
        label="Ưu đãi QA",
        terms="Địa chỉ phải được xác nhận.",
        start=(now - timedelta(days=1)).isoformat(),
        end=(now + timedelta(days=10)).isoformat(),
        quota=2,
        budget_vnd=1000000,
        rules=[dict(key="default", amount=100000)],
    )
    return {**values, **changes}


async def create(admin, **changes):
    r = await admin.post("/api/v1/admin/vouchers", json=campaign_body(**changes))
    assert r.status_code == 201, r.text
    v = r.json()
    r = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/publish", json={"expected_version": v["version"]}
    )
    assert r.status_code == 200, r.text
    return r.json()


async def intake(admin, gateway, plan, region, phone="0981234567", code="QA-VOUCHER"):
    r = await admin.post(
        "/api/v1/leads",
        headers={"Idempotency-Key": uuid4().hex},
        json=dict(
            phone=phone,
            plan_id=plan["id"],
            region_id=region["id"],
            installation_address="QA address",
            voucher_code=code,
            consent_version="qa",
        ),
    )
    assert r.status_code == 201, r.text
    with psycopg.connect(gateway.dsn) as db:
        return str(
            db.execute(
                "SELECT id FROM private.leads WHERE receipt=%s", [r.json()["receipt"]]
            ).fetchone()[0]
        )


async def confirm(gateway, lid, plan, region, status="quoted"):
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.leads SET status=%s,payload=payload||%s WHERE id=%s",
            [
                status,
                Jsonb(
                    {
                        "address_confirmation": {
                            "confirmed_by": str(uuid4()),
                            "confirmed_at": datetime.now(UTC).isoformat(),
                            "province_code": 1,
                            "ward_code": 2,
                        }
                    }
                ),
                lid,
            ],
        )


async def reserve(admin, lid):
    lead = (await admin.get("/api/v1/admin/leads/" + lid)).json()
    return await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/reserve",
        json=dict(expected_version=lead["version"], code="QA-VOUCHER", billing_months=6),
    )


async def test_voucher_draft_live_snapshot_quote_and_link_get_do_not_consume(admin, gateway):
    plan, region = await setup(admin, gateway)
    v = await create(admin)
    updated = await admin.put(
        "/api/v1/admin/vouchers/" + v["id"],
        json=dict(campaign_body(), name="Draft new", expected_version=v["version"]),
    )
    assert updated.status_code == 200, updated.text
    q = (
        await admin.post(
            "/api/v1/quotes",
            json=dict(plan_id=plan["id"], region_id=region["id"], voucher_code="QA-VOUCHER"),
        )
    ).json()
    assert q["voucher"]["name"] == "QA regional offer" and q["initial_total_vnd"] == 1220000
    link = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/links", json={"slug": "qa-offer", "channel": "zalo"}
    )
    assert link.status_code == 201, link.text
    opened = await admin.get("/s/qa-offer")
    assert opened.status_code == 302 and opened.headers["location"] == "/"
    assert "HttpOnly" in opened.headers["set-cookie"]
    q = (
        await admin.post("/api/v1/quotes", json=dict(plan_id=plan["id"], region_id=region["id"]))
    ).json()
    assert q["voucher"]["status"] == "eligible"
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.voucher_redemptions").fetchone()[0] == 0
    assert (
        await admin.post(
            f"/api/v1/admin/vouchers/{v['id']}/links",
            json={"slug": "bad-link", "target": "//evil.test"},
        )
    ).status_code == 422


async def test_intake_records_pending_voucher_even_bad_code_and_preserves_idempotency(
    admin, gateway
):
    plan, region = await setup(admin, gateway)
    await create(admin)
    body = dict(
        phone="0981234567",
        plan_id=plan["id"],
        region_id=region["id"],
        voucher_code="QA-VOUCHER",
        consent_version="qa",
    )
    headers = {"Idempotency-Key": uuid4().hex}
    first = await admin.post("/api/v1/leads", json=body, headers=headers)
    assert first.status_code == 201, first.text
    again = await admin.post("/api/v1/leads", json=body, headers=headers)
    assert again.json()["receipt"] == first.json()["receipt"]
    with psycopg.connect(gateway.dsn) as db:
        rows = db.execute("SELECT payload->'voucher_request' FROM private.leads").fetchall()
        assert len(rows) == 1 and rows[0][0]["status"] == "pending_address"
    lid = await intake(admin, gateway, plan, region, phone="0981234568", code="INVALID-CODE")
    state = (await admin.get(f"/api/v1/admin/leads/{lid}/voucher")).json()
    assert state["request"]["status"] == "unavailable"


async def test_address_gate_last_slot_concurrency_retry_and_customer_limit(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin, quota=1)
    a = await intake(admin, gateway, plan, region)
    b = await intake(admin, gateway, plan, region, phone="0981234568")
    assert (await reserve(admin, a)).status_code == 422
    await confirm(gateway, a, plan, region)
    await confirm(gateway, b, plan, region)
    results = await asyncio.gather(reserve(admin, a), reserve(admin, b))
    assert sorted(r.status_code for r in results) == [200, 409], [
        (r.status_code, r.text) for r in results
    ]
    winner = a if results[0].status_code == 200 else b
    retry = await reserve(admin, winner)
    assert retry.status_code == 200 and retry.json()["replayed"] is True
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.voucher_redemptions WHERE state='held'"
            ).fetchone()[0]
            == 1
        )


async def test_release_expiry_redeem_scope_and_snapshot(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    previous_quote = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "voucher_code": ""},
        )
    ).json()
    assert previous_quote["status"] == "confirmed"
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET quote=%s WHERE id=%s", [Jsonb(previous_quote), lid])
    hold = await reserve(admin, lid)
    assert hold.status_code == 200, hold.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT snapshot FROM private.quote_history WHERE lead_id=%s ORDER BY created_at DESC LIMIT 1",
                [lid],
            ).fetchone()[0]
            == previous_quote
        )
    record = hold.json()
    r = await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/redeem",
        json={"expected_version": record["version"], "reason": "QA delivered"},
    )
    assert r.status_code == 422
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='installed' WHERE id=%s", [lid])
    r = await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/redeem",
        json={"expected_version": record["version"], "reason": "QA delivered"},
    )
    assert r.status_code == 200, r.text
    again = await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/redeem",
        json={"expected_version": record["version"], "reason": "QA delivered"},
    )
    assert again.status_code == 200 and again.json()["replayed"]
    report = (await admin.get("/api/v1/admin/vouchers/report")).json()
    assert report["totals"]["redeemed"] == 1 and report["totals"]["cost_vnd"] == 100000
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['lead.read','lead.write'] WHERE user_id=%s",
            [actor],
        )
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET assignee_id=NULL WHERE id=%s", [lid])
    assert (await admin.get(f"/api/v1/admin/leads/{lid}/voucher")).status_code == 403


async def test_gift_inventory_budget_and_expired_slot_returns_capacity(admin, gateway):
    plan, region = await setup(admin, gateway)
    gift = await product(admin, plan, "one_time", 500000)
    inv = await admin.put(
        "/api/v1/admin/vouchers/inventory",
        json={"product_id": gift["id"], "stock": 1, "cost_vnd": 350000},
    )
    assert inv.status_code == 200, inv.text
    await create(admin, rules=[{"key": "default", "amount": 100000, "gift_product_id": gift["id"]}])
    a = await intake(admin, gateway, plan, region)
    b = await intake(admin, gateway, plan, region, phone="0981234568")
    await confirm(gateway, a, plan, region)
    await confirm(gateway, b, plan, region)
    ra = await reserve(admin, a)
    assert ra.status_code == 200, ra.text
    rb = await reserve(admin, b)
    assert rb.status_code == 409
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.voucher_redemptions SET expires_at=now()-interval '1 second' WHERE lead_id=%s",
            [a],
        )
    rb = await reserve(admin, b)
    assert rb.status_code == 200, rb.text
    assert rb.json()["snapshot"]["voucher"]["gift"]["name"] == "QA device"
    with psycopg.connect(gateway.dsn) as db:
        for table in ("vouchers", "voucher_links", "voucher_redemptions", "voucher_inventory"):
            for role in ("anon", "authenticated"):
                assert not db.execute(
                    "SELECT has_table_privilege(%s,%s,'SELECT')", [role, "private." + table]
                ).fetchone()[0]


async def test_budget_regional_limit_contact_limit_and_release(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin, quota=10, budget_vnd=150000)
    a = await intake(admin, gateway, plan, region)
    b = await intake(admin, gateway, plan, region, phone="0981234568")
    await confirm(gateway, a, plan, region)
    await confirm(gateway, b, plan, region)
    ra = await reserve(admin, a)
    assert ra.status_code == 200, ra.text
    rb = await reserve(admin, b)
    assert rb.status_code == 409 and rb.json()["code"] == "VOUCHER_BUDGET_EXCEEDED", rb.text
    rel = await admin.post(
        f"/api/v1/admin/leads/{a}/voucher/release",
        json={"expected_version": ra.json()["version"], "reason": "QA cancelled"},
    )
    assert rel.status_code == 200, rel.text
    assert (await reserve(admin, b)).status_code == 200
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.vouchers SET published_payload=jsonb_set(published_payload,'{budget_vnd}','1000000')"
        )
    same = await intake(admin, gateway, plan, region, phone="0981234568")
    await confirm(gateway, same, plan, region)
    same_r = await reserve(admin, same)
    assert same_r.status_code == 409 and same_r.json()["code"] == "VOUCHER_CUSTOMER_LIMIT"


async def test_held_snapshot_survives_pause_but_scope_edits_are_blocked(admin, gateway):
    plan, region = await setup(admin, gateway)
    v = await create(admin)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    hold = await reserve(admin, lid)
    assert hold.status_code == 200
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    import pytest

    from pagefpt.core.errors import DomainError

    with pytest.raises(DomainError, match="VOUCHER_RELEASE_BEFORE_EDIT"):
        await gateway.rpc("dispatch", {"op": "lead_profile_update", "actor": actor, "id": lid})
    paused = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/pause", json={"expected_version": v["version"]}
    )
    assert paused.status_code == 200
    assert (await reserve(admin, lid)).json()["replayed"] is True
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET status='installed' WHERE id=%s", [lid])
    used = await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/redeem",
        json={"expected_version": hold.json()["version"], "reason": "QA delivered"},
    )
    assert used.status_code == 200 and used.json()["snapshot"]["voucher"]["discount_vnd"] == 100000


async def test_qr_and_safe_landing_target_and_public_payload(admin, gateway):
    await setup(admin, gateway)
    v = await create(admin)
    r = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/links",
        json={"slug": "qa-share", "target": "/qa-landing"},
    )
    assert r.status_code == 201, r.text
    qr = await admin.get("/api/v1/admin/vouchers/links/qa-share/qr")
    assert qr.status_code == 200 and "image/svg+xml" in qr.headers["content-type"], qr.text
    for target in ("/admin", "/api", "/static", "/s", "https://evil.test", "/qa?x=1"):
        assert (
            await admin.post(
                f"/api/v1/admin/vouchers/{v['id']}/links", json={"slug": "qa-bad", "target": target}
            )
        ).status_code == 422
    await admin.get("/s/qa-share")
    context = (await admin.get("/api/v1/vouchers/context")).json()["voucher"]
    assert context["code"] == "QA-VOUCHER" and "budget_vnd" not in context
    assert "remaining_budget_vnd" not in context
    assert "rules" not in context


async def test_geography_options_authorized_schema(admin):
    response = await admin.get("/api/v1/admin/vouchers/options")
    assert response.status_code == 200, response.text
    p = response.json()["provinces"][0]
    assert p["id"] and p["wards"][0]["id"]


async def test_cancelled_and_expired_voucher_quotes_require_confirmation(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    r = (await reserve(admin, lid)).json()
    await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/release",
        json={"expected_version": r["version"], "reason": "QA cancelled"},
    )
    lead = (await admin.get(f"/api/v1/admin/leads/{lid}")).json()
    assert lead["quote_status"] == "needs_confirmation"
    assert lead["quote"]["voucher"]["status"] == "released"
    assert (await reserve(admin, lid)).status_code == 200
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.voucher_redemptions SET expires_at=now()-interval '1 second' WHERE lead_id=%s AND state='held'",
            [lid],
        )
    lead = (await admin.get(f"/api/v1/admin/leads/{lid}")).json()
    assert lead["quote_status"] == "needs_confirmation"
    assert lead["quote"]["voucher"]["status"] == "expired"


async def test_billing_cannot_change_held_plan_or_term(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    assert (await reserve(admin, lid)).status_code == 200
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    import pytest

    from pagefpt.core.errors import DomainError

    with pytest.raises(DomainError, match="VOUCHER_RELEASE_BEFORE_EDIT"):
        await gateway.rpc(
            "dispatch",
            {
                "op": "billing_save",
                "actor": actor,
                "id": lid,
                "payload": {"plan_id": plan["id"], "billing_months": 12, "expected_version": 0},
            },
        )
    good = await gateway.rpc(
        "dispatch",
        {
            "op": "billing_save",
            "actor": actor,
            "id": lid,
            "payload": {"plan_id": plan["id"], "billing_months": 6, "expected_version": 0},
        },
    )
    assert good["deal"]["billing_months"] == 6


async def test_confirm_quote_cannot_replace_a_held_voucher_snapshot(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    assert (await reserve(admin, lid)).status_code == 200
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={"plan_id": plan["id"], "region_id": region["id"], "voucher_code": ""},
        )
    ).json()
    lead = (await admin.get(f"/api/v1/admin/leads/{lid}")).json()
    r = await admin.post(
        f"/api/v1/admin/leads/{lid}/quotes/confirm",
        json={"expected_version": lead["version"], "quote_token": q["quote_token"]},
    )
    assert r.status_code == 409 and r.json()["code"] == "VOUCHER_RELEASE_BEFORE_EDIT", r.text


async def wait_for_lock(dsn, pid):
    for _ in range(300):
        with psycopg.connect(dsn) as db:
            if db.execute(
                "SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=%s", [pid]
            ).fetchone()[0]:
                return
        await asyncio.sleep(0.01)
    raise AssertionError("Command did not block on the controlled database lock")


async def test_waiting_redeem_cannot_revive_expired_last_slot(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin, quota=1)
    a = await intake(admin, gateway, plan, region)
    b = await intake(admin, gateway, plan, region, phone="0981234568")
    await confirm(gateway, a, plan, region, status="installed")
    await confirm(gateway, b, plan, region)
    record = (await reserve(admin, a)).json()
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn) as blocker:
        blocker.execute("SELECT 1 FROM private.leads WHERE id=%s FOR UPDATE", [a])
        conn = await psycopg.AsyncConnection.connect(gateway.dsn)
        try:
            command = {
                "op": "voucher_redeem",
                "actor": actor,
                "id": a,
                "expected_version": record["version"],
                "reason": "QA received",
            }
            task = asyncio.create_task(
                conn.execute("SELECT private.voucher_dispatch(%s)", [Jsonb(command)])
            )
            await wait_for_lock(gateway.dsn, conn.info.backend_pid)
            with psycopg.connect(gateway.dsn) as db:
                db.execute(
                    "UPDATE private.voucher_redemptions SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE lead_id=%s",
                    [a],
                )
            assert (await reserve(admin, b)).status_code == 200
            blocker.commit()
            result = (await (await task).fetchone())[0]
            await conn.commit()
            assert result.get("error") == "VOUCHER_HOLD_EXPIRED", result
        finally:
            blocker.rollback()
            await conn.close()


async def test_catalog_publish_during_capacity_wait_invalidates_quote(admin, gateway):
    plan, region = await setup(admin, gateway)
    v = await create(admin)
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region)
    record = (await reserve(admin, lid)).json()
    await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/release",
        json={"expected_version": record["version"], "reason": "QA cancelled"},
    )
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    lead = (await admin.get(f"/api/v1/admin/leads/{lid}")).json()
    with psycopg.connect(gateway.dsn) as blocker:
        blocker.execute("SELECT 1 FROM private.vouchers WHERE id=%s FOR UPDATE", [v["id"]])
        conn = await psycopg.AsyncConnection.connect(gateway.dsn)
        try:
            command = {
                "op": "voucher_reserve",
                "actor": actor,
                "id": lid,
                "expected_version": lead["version"],
                "payload": record["snapshot"],
                "address_confirmation": lead["payload"]["address_confirmation"],
            }
            task = asyncio.create_task(
                conn.execute("SELECT private.voucher_dispatch(%s)", [Jsonb(command)])
            )
            await wait_for_lock(gateway.dsn, conn.info.backend_pid)
            with psycopg.connect(gateway.dsn) as db:
                db.execute("UPDATE private.catalog_revision SET version=version+1 WHERE id")
            blocker.commit()
            result = (await (await task).fetchone())[0]
            await conn.commit()
            assert result.get("error") == "QUOTE_STALE", result
        finally:
            blocker.rollback()
            await conn.close()


async def test_report_retains_source_and_complete_funnel(admin, gateway):
    plan, region = await setup(admin, gateway)
    v = await create(admin)
    await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/links", json={"slug": "qa-source", "channel": "zalo"}
    )
    await admin.get("/s/qa-source")
    lid = await intake(admin, gateway, plan, region)
    await confirm(gateway, lid, plan, region, status="installed")
    r = (await reserve(admin, lid)).json()
    await admin.post(
        f"/api/v1/admin/leads/{lid}/voucher/redeem",
        json={"expected_version": r["version"], "reason": "QA received"},
    )
    await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/links", json={"slug": "qa-source", "channel": "facebook"}
    )
    report = (await admin.get("/api/v1/admin/vouchers/report")).json()
    channel = next(x for x in report["channels"] if x["channel"] == "zalo")
    assert channel["requested"] == channel["redeemed"] == channel["installed"] == 1
    assert report["regions"][0]["requested"] == 1


async def test_manual_code_context_persists_and_is_clearable(admin, gateway):
    plan, region = await setup(admin, gateway)
    await create(admin)
    saved = await admin.post("/api/v1/vouchers/context", json={"code": "QA-VOUCHER"})
    assert saved.status_code == 200, saved.text
    assert "HttpOnly" in saved.headers["set-cookie"]
    assert (await admin.get("/api/v1/vouchers/context")).json()["voucher"]["code"] == "QA-VOUCHER"
    lid = await intake(admin, gateway, plan, region, code=None)
    assert (await admin.get(f"/api/v1/admin/leads/{lid}/voucher")).json()["request"][
        "code"
    ] == "QA-VOUCHER"
    await admin.delete("/api/v1/vouchers/context")
    assert (await admin.get("/api/v1/vouchers/context")).json()["voucher"] is None


async def test_new_share_link_overrides_existing_manual_context(admin, gateway):
    await setup(admin, gateway)
    await create(admin)
    b = await create(admin, code="QA-SECOND")
    await admin.post(
        f"/api/v1/admin/vouchers/{b['id']}/links", json={"slug": "qa-second", "channel": "zalo"}
    )
    await admin.post("/api/v1/vouchers/context", json={"code": "QA-VOUCHER"})
    opened = await admin.get("/s/qa-second")
    assert opened.status_code == 302, opened.text
    assert (await admin.get("/api/v1/vouchers/context")).json()["voucher"]["code"] == "QA-SECOND"


async def test_publish_cannot_lower_regional_limit_below_existing_holds(admin, gateway):
    plan, region = await setup(admin, gateway)
    v = await create(admin, rules=[{"key": "default", "amount": 100000, "quota": 2}])
    for phone in ("0981234567", "0981234568"):
        lid = await intake(admin, gateway, plan, region, phone=phone)
        await confirm(gateway, lid, plan, region)
        assert (await reserve(admin, lid)).status_code == 200
    r = await admin.put(
        "/api/v1/admin/vouchers/" + v["id"],
        json={
            **v["payload"],
            "expected_version": v["version"],
            "rules": [{"key": "default", "amount": 100000, "quota": 1}],
        },
    )
    assert r.status_code == 200, r.text
    published = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/publish", json={"expected_version": r.json()["version"]}
    )
    assert (
        published.status_code == 409 and published.json()["code"] == "VOUCHER_LIMIT_BELOW_COMMITTED"
    ), published.text


async def test_verified_ward_rule_limit_and_province_fallback(admin, gateway):
    from pagefpt.modules.catalog.geography import location_id

    plan, region = await setup(admin, gateway)
    await create(
        admin,
        quota=10,
        rules=[
            {"key": "default", "amount": 100000},
            {"key": "province", "region_id": location_id("province", 1), "amount": 150000},
            {"key": "ward", "region_id": location_id("ward", 2), "amount": 200000, "quota": 1},
        ],
    )
    a = await intake(admin, gateway, plan, region)
    b = await intake(admin, gateway, plan, region, phone="0981234568")
    await confirm(gateway, a, plan, region)
    await confirm(gateway, b, plan, region)
    rs = await asyncio.gather(reserve(admin, a), reserve(admin, b))
    assert sorted(r.status_code for r in rs) == [200, 409], [(r.status_code, r.text) for r in rs]
    good = next(r.json() for r in rs if r.status_code == 200)
    assert good["snapshot"]["voucher"]["rule_key"] == "ward"
    assert good["snapshot"]["voucher"]["discount_vnd"] == 200000
    c = await intake(admin, gateway, plan, region, phone="0981234569")
    await confirm(gateway, c, plan, region)
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.leads SET payload=jsonb_set(payload,'{address_confirmation,ward_code}','99') WHERE id=%s",
            [c],
        )
    fallback = await reserve(admin, c)
    assert fallback.status_code == 200, fallback.text
    assert fallback.json()["snapshot"]["voucher"]["rule_key"] == "province"


async def test_paused_published_campaign_cannot_be_deleted(admin):
    v = await create(admin)
    paused = await admin.post(
        f"/api/v1/admin/vouchers/{v['id']}/pause", json={"expected_version": v["version"]}
    )
    assert paused.status_code == 200, paused.text
    deleted = await admin.delete(
        f"/api/v1/admin/vouchers/{v['id']}",
        params={"expected_version": paused.json()["version"]},
    )
    assert deleted.status_code == 409, deleted.text
    assert deleted.json()["code"] == "VOUCHER_ARCHIVE_REQUIRED"
