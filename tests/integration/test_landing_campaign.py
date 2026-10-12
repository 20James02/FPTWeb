from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from tests.integration.test_accessories import setup
from tests.integration.test_telecom_landing import body


async def campaign(admin, plan, **settings):
    now = datetime.now(UTC)
    config = dict(
        plan_ids=[plan["id"]],
        campaign=dict(
            enabled=True,
            title="Camera campaign",
            start=(now - timedelta(days=1)).isoformat(),
            end=(now + timedelta(days=1)).isoformat(),
            conditions="Confirmed after installation",
        ),
        plan_presentations=[
            dict(plan_id=plan["id"], campaign_prices=[dict(billing_months=6, monthly_vnd=180000)])
        ],
    )
    config.update(settings)
    r = await admin.post("/api/v1/admin/pages", json=body(**config))
    assert r.status_code == 201, r.text
    page = r.json()
    r = await admin.post(
        f"/api/v1/admin/pages/{page['id']}/publish", json={"expected_version": page["version"]}
    )
    assert r.status_code == 200, r.text
    return r.json()


async def test_landing_price_is_authoritative_and_independent(admin, gateway):
    plan, region = await setup(admin, gateway)
    page = await campaign(admin, plan)
    data = dict(plan_id=plan["id"], region_id=region["id"], billing_months=6)
    normal = (await admin.post("/api/v1/quotes", json=data)).json()
    r = await admin.post("/api/v1/quotes", json={**data, "landing_slug": "qa-telecom"})
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["monthly_vnd"] == 180000
    assert q["initial_total_vnd"] == 1188000  # fixture excludes 10% VAT
    assert q["landing"]["id"] == page["id"]
    assert q["landing"]["version"] == page["version"]
    assert q["quote_token"]
    assert (
        next(x for x in q["billing_options"] if x["billing_months"] == 6)["monthly_vnd"] == 180000
    )
    assert (await admin.post("/api/v1/quotes", json=data)).json()["monthly_vnd"] == normal[
        "monthly_vnd"
    ]
    assert (
        await admin.post(
            "/api/v1/quotes", json={**data, "monthly_vnd": 1, "landing_slug": "qa-telecom"}
        )
    ).status_code == 422


@pytest.mark.parametrize(
    "config",
    [
        {"contact_phone": "not-phone"},
        {"messenger_url": "javascript:alert(1)"},
        {"footer_groups": [{"title": "Bad", "links": [{"label": "x", "href": "//evil.test"}]}]},
        {"campaign": {"enabled": True, "start": "2026-01-01", "end": "2026-02-01"}},
        {"campaign": {"stock_total": 3, "stock_remaining": 4}},
        {
            "plan_presentations": [
                {
                    "plan_id": str(uuid4()),
                    "campaign_prices": [{"billing_months": 3, "monthly_vnd": 1}],
                }
            ]
        },
    ],
)
async def test_campaign_invalid_configuration(admin, config):
    assert (await admin.post("/api/v1/admin/pages", json=body(**config))).status_code == 422


@pytest.mark.parametrize("state", ["ended", "scheduled", "sold_out"])
async def test_inactive_campaign_uses_regular_price(admin, gateway, state):
    plan, region = await setup(admin, gateway)
    now = datetime.now(UTC)
    cfg = {
        "enabled": True,
        "conditions": "Confirmed at installation",
        "start": (now - timedelta(days=1)).isoformat(),
        "end": (now + timedelta(days=1)).isoformat(),
    }
    if state == "ended":
        cfg.update(
            start=(now - timedelta(days=2)).isoformat(), end=(now - timedelta(days=1)).isoformat()
        )
    if state == "scheduled":
        cfg.update(start=(now + timedelta(hours=1)).isoformat())
    if state == "sold_out":
        cfg.update(stock_total=5, stock_remaining=0)
    await campaign(admin, plan, campaign=cfg)
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={
                "plan_id": plan["id"],
                "region_id": region["id"],
                "billing_months": 6,
                "landing_slug": "qa-telecom",
            },
        )
    ).json()
    assert q["monthly_vnd"] == 200000
    assert not q["landing"]["price_overridden"]
    assert q["landing"]["state"] == state


async def test_unpublished_or_unselected_landing_cannot_supply_prices(admin, gateway):
    plan, region = await setup(admin, gateway)
    r = await admin.post("/api/v1/admin/pages", json=body(plan_ids=[plan["id"]]))
    assert r.status_code == 201
    data = {
        "plan_id": plan["id"],
        "region_id": region["id"],
        "billing_months": 6,
        "landing_slug": "qa-telecom",
    }
    assert (await admin.post("/api/v1/quotes", json=data)).status_code == 404
    page = r.json()
    await admin.post(
        f"/api/v1/admin/pages/{page['id']}/publish", json={"expected_version": page["version"]}
    )
    updated = {**body(plan_ids=[str(uuid4())])}
    page = (await admin.get(f"/api/v1/admin/pages/{page['id']}")).json()
    page = (
        await admin.put(
            f"/api/v1/admin/pages/{page['id']}?expected_version={page['version']}", json=updated
        )
    ).json()
    await admin.post(
        f"/api/v1/admin/pages/{page['id']}/publish", json={"expected_version": page["version"]}
    )
    assert (await admin.post("/api/v1/quotes", json=data)).status_code == 422


async def test_campaign_quote_keeps_accessories_and_checks_version(admin, gateway):
    import psycopg
    from psycopg.types.json import Jsonb

    from tests.integration.test_accessories import product

    plan, region = await setup(admin, gateway)
    a = await product(admin, plan, "monthly", 30000)
    page = await campaign(admin, plan)
    q = (
        await admin.post(
            "/api/v1/quotes",
            json={
                "plan_id": plan["id"],
                "region_id": region["id"],
                "billing_months": 6,
                "landing_slug": "qa-telecom",
                "accessory_ids": [a["id"]],
            },
        )
    ).json()
    assert q["monthly_vnd"] == 180000
    assert q["accessory_monthly_vnd"] == 30000
    assert q["initial_total_vnd"] == 1188000 + 30000 * 6
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        assert c.execute("select private.landing_quote_valid(%s)", [Jsonb(q)]).fetchone()[0]
    await admin.post(
        f"/api/v1/admin/pages/{page['id']}/retire", json={"expected_version": page["version"]}
    )
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        assert not c.execute("select private.landing_quote_valid(%s)", [Jsonb(q)]).fetchone()[0]


async def test_activity_is_aggregate_opt_in_deduplicated(admin, gateway):
    import psycopg
    from psycopg.types.json import Jsonb

    plan, region = await setup(admin, gateway)
    now = datetime.now(UTC)
    await campaign(
        admin,
        plan,
        campaign={
            "enabled": True,
            "show_activity": True,
            "end": (now + timedelta(days=1)).isoformat(),
            "conditions": "QA",
        },
    )
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        for consent in [True, True, True, False]:
            sid = uuid4()
            c.execute(
                "insert into private.sessions(id,analytics,marketing,consent_version) values(%s,%s,false,%s)",
                [sid, consent, "QA"],
            )
            for _ in range(2):
                c.execute(
                    "insert into private.events(id,session_id,name,payload) values(%s,%s,%s,%s)",
                    [uuid4(), sid, "view_landing", Jsonb({"landing_slug": "qa-telecom"})],
                )
    r = await admin.get("/api/v1/landing/qa-telecom/activity")
    assert r.status_code == 200
    assert r.json() == {"sessions": 3, "window_seconds": 300}
    assert "s-maxage=60" in r.headers["cache-control"]
    assert (await admin.get("/api/v1/landing/missing/activity")).status_code == 404


async def test_contact_and_footer_render_safely(admin):
    r = await admin.post(
        "/api/v1/admin/landing-preview",
        json=body(
            contact_phone="0868.247.625",
            messenger_url="https://m.me/pagefpt",
            zalo_url="https://zalo.me/0868247625",
            contact_icon="message",
            footer_groups=[
                {"title": "Thông tin", "links": [{"label": "Giới thiệu", "href": "/#lp-home"}]}
            ],
        ),
    )
    assert r.status_code == 200, r.text
    assert "tel:0868247625" in r.text
    assert "https://m.me/pagefpt" in r.text
    assert 'id="lp-contact-dialog"' in r.text
    assert "<h3>Thông tin</h3>" in r.text


async def test_campaign_price_requires_write_and_publish_even_when_scheduled(admin, gateway):
    import psycopg
    from psycopg.types.json import Jsonb

    plan, _ = await setup(admin, gateway)
    r = await admin.post(
        "/api/v1/admin/pages",
        json=body(
            plan_ids=[plan["id"]],
            plan_presentations=[
                dict(
                    plan_id=plan["id"], campaign_prices=[dict(billing_months=6, monthly_vnd=180000)]
                )
            ],
        ),
    )
    assert r.status_code == 201, r.text
    page = r.json()
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['content.write','content.publish'] WHERE user_id=%s",
            [actor],
        )
    assert (
        await admin.post(
            "/api/v1/admin/pages",
            json={**body(), "slug": "other-campaign", "landing": page["payload"]["landing"]},
        )
    ).status_code == 403
    assert (
        await admin.post(
            f"/api/v1/admin/pages/{page['id']}/publish", json={"expected_version": page["version"]}
        )
    ).status_code == 403
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("SET ROLE service_role")
        for op in ["page_schedule", "scheduled_publish"]:
            result = db.execute(
                "select api.dispatch(%s)",
                [
                    Jsonb(
                        dict(
                            op=op,
                            actor=actor,
                            id=page["id"],
                            expected_version=page["version"],
                            publish_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                        )
                    )
                ],
            ).fetchone()[0]
            assert result.get("error") == "PERMISSION_DENIED", (op, result)
        assert (
            db.execute("select status from private.resources where id=%s", [page["id"]]).fetchone()[
                0
            ]
            == "draft"
        )


async def test_publication_and_edit_use_same_lock_order(admin, gateway):
    import asyncio

    import psycopg
    from psycopg.types.json import Jsonb

    plan, _ = await setup(admin, gateway)
    r = await admin.post("/api/v1/admin/pages", json=body(plan_ids=[plan["id"]]))
    page = r.json()
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    async with (
        await psycopg.AsyncConnection.connect(gateway.dsn) as edit,
        await psycopg.AsyncConnection.connect(gateway.dsn) as publish,
        await psycopg.AsyncConnection.connect(gateway.dsn, autocommit=True) as control,
    ):
        await edit.execute("SET LOCAL statement_timeout='3s'")
        await edit.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended('page-slug:qa-telecom',0))"
        )
        await publish.execute("SET LOCAL statement_timeout='3s'")
        pid = (await (await publish.execute("select pg_backend_pid()")).fetchone())[0]
        task = asyncio.create_task(
            publish.execute(
                "select api.dispatch(%s)",
                [
                    Jsonb(
                        dict(
                            op="resource_publish",
                            kind="page",
                            id=page["id"],
                            actor=actor,
                            expected_version=page["version"],
                        )
                    )
                ],
            )
        )
        try:
            waiting = False
            for _ in range(100):
                row = await (
                    await control.execute(
                        "select wait_event from pg_stat_activity where pid=%s", [pid]
                    )
                ).fetchone()
                if row and row[0] == "advisory":
                    waiting = True
                    break
                await asyncio.sleep(0.01)
            assert waiting
            updated = await (
                await edit.execute(
                    "select api.dispatch(%s)",
                    [
                        Jsonb(
                            dict(
                                op="resource_update",
                                kind="page",
                                id=page["id"],
                                actor=actor,
                                expected_version=page["version"],
                                payload={**page["payload"], "title": "Edited concurrently"},
                            )
                        )
                    ],
                )
            ).fetchone()
            assert not updated[0].get("error"), updated
            await edit.commit()
            result = await (await task).fetchone()
            assert result[0].get("error") == "VERSION_CONFLICT", result
            await publish.commit()
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)


async def test_regular_period_keeps_promotions_when_only_six_month_price_overridden(admin, gateway):
    import psycopg
    from psycopg.types.json import Jsonb

    plan, region = await setup(admin, gateway)
    await campaign(admin, plan)
    now = datetime.now(UTC)
    created_response = await admin.post(
        "/api/v1/admin/prices",
        json=dict(
            plan_id=plan["id"],
            scope_id=region["id"],
            scope_kind="region",
            billing_months=12,
            monthly_vnd=200000,
            vat_included=False,
            vat_bps=1000,
            start=(now - timedelta(days=1)).isoformat(),
            source="QA",
        ),
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()
    assert (
        await admin.post(
            f"/api/v1/admin/prices/{created['id']}/publish",
            json={"expected_version": created["version"]},
        )
    ).status_code == 200
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "insert into private.resources(kind,payload,published_payload,status,published_version) values ('promotion',%s,%s,'published',1)",
            [
                Jsonb(
                    dict(
                        start=(now - timedelta(days=1)).isoformat(),
                        end=(now + timedelta(days=1)).isoformat(),
                        discount_vnd=50000,
                        priority=1,
                        plan_ids=[plan["id"]],
                    )
                ),
                Jsonb(
                    dict(
                        start=(now - timedelta(days=1)).isoformat(),
                        end=(now + timedelta(days=1)).isoformat(),
                        discount_vnd=50000,
                        priority=1,
                        plan_ids=[plan["id"]],
                    )
                ),
            ],
        )
    for months in (6, 12):
        r = await admin.post(
            "/api/v1/quotes",
            json=dict(
                plan_id=plan["id"],
                region_id=region["id"],
                billing_months=months,
                landing_slug="qa-telecom",
            ),
        )
        assert r.status_code == 200, r.text
        quote = r.json()
        assert quote["line_items"]["discount_vnd"] == (0 if months == 6 else 50000)
        assert (
            next(q for q in quote["billing_options"] if q["billing_months"] == 12)["line_items"][
                "discount_vnd"
            ]
            == 50000
        )
