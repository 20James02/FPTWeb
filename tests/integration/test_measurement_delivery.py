import asyncio
from uuid import uuid4

import psycopg

from tests.integration.test_measurement_registry import connection


async def seeded(admin):
    conn = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                enabled=True,
                provider="meta",
                settings={"pixel_id": "123456789", "api_version": "v24.0", "server_enabled": True},
            ),
        )
    ).json()
    cfg = (
        await admin.post(
            "/api/v1/admin/measurement/configs",
            json={
                "name": "Conversions",
                "environment": "test",
                "policy": {},
                "rules": [
                    {
                        "event": "lead",
                        "connection_id": conn["id"],
                        "provider_event": "Lead",
                        "route": "server",
                    }
                ],
            },
        )
    ).json()
    assert (
        await admin.post(
            "/api/v1/admin/measurement/configs/" + cfg["id"] + "/publish",
            json={"expected_version": 1},
        )
    ).status_code == 200
    token = (
        await admin.post(
            "/api/v1/sessions",
            json={
                "analytics": True,
                "marketing": True,
                "advertising": True,
                "consent_version": "v3",
            },
        )
    ).json()["session_token"]
    await admin.post(
        "/api/v1/touches",
        json={
            "session_token": token,
            "utm_source": "meta",
            "utm_campaign": "camera",
            "campaign_id": "11111111111111111111",
            "platform": "meta",
            "click_id": "synthetic",
            "click_id_type": "fbclid",
        },
    )
    body = {
        "phone": "0901234567",
        "session_token": token,
        "analytics_opt_in": True,
        "marketing_opt_in": True,
        "consent_version": "v3",
    }
    key = str(uuid4())
    first = await admin.post("/api/v1/leads", json=body, headers={"Idempotency-Key": key})
    assert first.status_code == 201, first.text
    assert (
        await admin.post("/api/v1/leads", json=body, headers={"Idempotency-Key": key})
    ).status_code == 200
    return conn, token, first.json()


async def test_conversion_outbox_atomic_and_replay_does_not_duplicate(admin, gateway):
    conn, token, receipt = await seeded(admin)
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.measurement_occurrences").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM private.measurement_deliveries").fetchone()[0] == 1
        ledger = db.execute("SELECT id FROM private.measurement_deliveries").fetchone()[0]
    replies = await asyncio.gather(
        *(
            gateway.rpc(
                "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": str(ledger)}}
            )
            for _ in range(2)
        )
    )
    assert sum(r["status"] == "ready" for r in replies) == 1
    ready = next(r for r in replies if r["status"] == "ready")
    assert ready["event"]["event_id"] == receipt["event_id"]
    assert ready["event"]["source"]["campaign_id"] == "11111111111111111111"
    assert "0901234567" not in str(ready)


async def test_withdrawal_prevents_new_destination_send(admin, gateway):
    conn, token, _ = await seeded(admin)
    with psycopg.connect(gateway.dsn) as db:
        ledger = str(db.execute("SELECT id FROM private.measurement_deliveries").fetchone()[0])
    await admin.put(
        "/api/v1/consent",
        json={
            "session_token": token,
            "analytics": False,
            "marketing": False,
            "consent_version": "v3",
        },
    )
    result = await gateway.rpc(
        "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": ledger}}
    )
    assert result["status"] == "consent_denied"


async def test_delivery_fence_rejects_late_finish_and_connection_disable(admin, gateway):
    conn, _, _ = await seeded(admin)
    with psycopg.connect(gateway.dsn) as db:
        ledger = str(db.execute("SELECT id FROM private.measurement_deliveries").fetchone()[0])
    result = await gateway.rpc(
        "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": ledger}}
    )
    assert result["status"] == "ready"
    wrong = await gateway.rpc(
        "dispatch",
        {
            "command": {
                "op": "measurement_delivery_finish",
                "id": ledger,
                "lease_token": str(uuid4()),
                "state": "accepted",
            }
        },
    )
    assert wrong == {"saved": False}
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT state FROM private.measurement_deliveries").fetchone()[0]
            == "sending"
        )
    assert (
        await admin.post(
            "/api/v1/admin/measurement/connections/" + conn["id"] + "/disable",
            json={"expected_version": 1},
        )
    ).status_code == 200
    assert (
        await gateway.rpc(
            "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": ledger}}
        )
    )["status"] == "disabled"


async def test_delivery_uses_original_touch_identifiers_not_later_campaign(admin, gateway):
    _, token, _ = await seeded(admin)
    # Seeded lead has no fbc. A later campaign must not lend its identifiers to it.
    await admin.post(
        "/api/v1/touches",
        json={
            "session_token": token,
            "utm_source": "meta",
            "utm_campaign": "other",
            "campaign_id": "22222222222222222222",
            "platform": "meta",
            "fbc": "fb.1.1792038000000.CAMPAIGN_B",
        },
    )
    with psycopg.connect(gateway.dsn) as db:
        ledger = str(db.execute("SELECT id FROM private.measurement_deliveries").fetchone()[0])
    result = await gateway.rpc(
        "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": ledger}}
    )
    assert result["event"]["source"]["campaign_id"] == "11111111111111111111"
    assert not result.get("provider_ids_ciphertext"), result


async def test_crm_stage_keeps_intake_identifiers_and_ga4_import_has_outbox(admin, gateway):
    from psycopg.types.json import Jsonb

    _, token, _ = await seeded(admin)
    await admin.post(
        "/api/v1/touches",
        json={
            "session_token": token,
            "utm_source": "meta",
            "utm_campaign": "later",
            "platform": "meta",
            "fbc": "fb.1.1792038000000.LATER",
        },
    )
    ga = (
        await admin.post("/api/v1/admin/measurement/connections", json=connection(enabled=True))
    ).json()
    with psycopg.connect(gateway.dsn) as db:
        lead = db.execute("SELECT id FROM private.leads").fetchone()[0]
        db.execute(
            "UPDATE private.leads SET payload=jsonb_set(payload,'{measurement,rules}',%s) WHERE id=%s",
            [
                Jsonb(
                    [
                        {
                            "event": "qualified",
                            "route": "ga4_import",
                            "connection_id": ga["id"],
                            "provider_event": "qualified_lead",
                        }
                    ]
                ),
                lead,
            ],
        )
        db.execute("SELECT private.measurement_occurrence(%s,'qualified',now())", [lead])
        occurrences = db.execute(
            "SELECT stage,snapshot FROM private.measurement_occurrences ORDER BY created_at"
        ).fetchall()
        assert len(occurrences) == 2
        assert all(not snapshot.get("provider_ids_ciphertext") for _, snapshot in occurrences)
        assert db.execute("SELECT count(*) FROM private.measurement_deliveries").fetchone()[0] == 2


async def test_short_retention_bounds_clicks_and_client_context_before_cleanup(admin, gateway):
    conn, _, _ = await seeded(admin)
    cfg = (await admin.get("/api/v1/admin/measurement/configs")).json()["items"][0]
    saved = await admin.put(
        "/api/v1/admin/measurement/configs/" + cfg["id"],
        json={
            **cfg["payload"],
            "policy": {"retention_days": 1},
            "expected_version": cfg["version"],
        },
    )
    assert saved.status_code == 200, saved.text
    await admin.post(
        "/api/v1/admin/measurement/configs/" + cfg["id"] + "/publish",
        json={"expected_version": saved.json()["version"]},
    )
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.leads SET created_at=now()-interval '2 days'")
        ledger = str(db.execute("SELECT id FROM private.measurement_deliveries").fetchone()[0])
    ready = await gateway.rpc(
        "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": ledger}}
    )
    assert ready["status"] == "ready"
    assert (
        not ready.get("click_id_ciphertext")
        and not ready.get("provider_ids_ciphertext")
        and not ready.get("client_context_ciphertext")
    )
    await gateway.rpc("dispatch", {"command": {"op": "schedule_tick"}})
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT click_id_ciphertext FROM private.leads").fetchone()[0] is None


async def test_legacy_gateway_does_not_bypass_advertising_permission(admin, gateway):
    token = (
        await admin.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": True, "consent_version": "legacy"},
        )
    ).json()["session_token"]
    lead = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "session_token": token,
            "marketing_opt_in": True,
            "consent_version": "legacy",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert lead.status_code == 201, lead.text
    with psycopg.connect(gateway.dsn) as db:
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    ready = await gateway.rpc("dispatch", {"command": {"op": "conversion_prepare", "id": id}})
    assert ready["status"] == "consent_denied", ready


async def test_legacy_prepare_rechecks_advertising_after_concurrent_revoke(admin, gateway):
    import asyncio

    token = (
        await admin.post(
            "/api/v1/sessions",
            json={
                "analytics": True,
                "marketing": True,
                "advertising": True,
                "consent_version": "v3",
            },
        )
    ).json()["session_token"]
    result = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "session_token": token,
            "marketing_opt_in": True,
            "consent_version": "v3",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert result.status_code == 201, result.text
    async with await psycopg.AsyncConnection.connect(gateway.dsn) as db:
        lead = (await (await db.execute("SELECT id FROM private.leads")).fetchone())[0]
        await db.execute("UPDATE private.sessions SET advertising=false")
        pending = asyncio.create_task(
            gateway.rpc("dispatch", {"command": {"op": "conversion_prepare", "id": str(lead)}})
        )
        try:
            for _ in range(200):
                await db.execute("SELECT pg_stat_clear_snapshot()")
                row = await (
                    await db.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND query LIKE 'SELECT api.dispatch(%%' AND wait_event_type='Lock'"
                    )
                ).fetchone()
                if row[0]:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError(
                    "Conversion preparation did not reach the concurrent consent lock"
                )
            await db.commit()
            prepared = await asyncio.wait_for(pending, 5)
            assert prepared["status"] == "consent_denied", prepared
        finally:
            await db.rollback()
            if not pending.done():
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)


async def test_managed_prepare_respects_concurrent_advertising_revocation(admin, gateway):
    await seeded(admin)
    async with await psycopg.AsyncConnection.connect(gateway.dsn) as db:
        delivery = (
            await (await db.execute("SELECT id FROM private.measurement_deliveries")).fetchone()
        )[0]
        await db.execute("UPDATE private.sessions SET advertising=false")
        pending = asyncio.create_task(
            gateway.rpc(
                "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": str(delivery)}}
            )
        )
        try:
            for _ in range(200):
                await db.execute("SELECT pg_stat_clear_snapshot()")
                row = await (
                    await db.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND query LIKE 'SELECT api.dispatch(%%' AND wait_event_type='Lock'"
                    )
                ).fetchone()
                if pending.done() or row[0]:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError("Managed preparation did not reach a result or consent lock")
            await db.commit()
            prepared = await asyncio.wait_for(pending, 5)
            assert prepared["status"] == "consent_denied", prepared
        finally:
            await db.rollback()
            if not pending.done():
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)


async def test_managed_prepare_does_not_block_privacy_erasure_cascade(admin, gateway):
    await seeded(admin)
    async with await psycopg.AsyncConnection.connect(gateway.dsn) as db:
        delivery = (
            await (await db.execute("SELECT id FROM private.measurement_deliveries")).fetchone()
        )[0]
        await db.execute("DELETE FROM private.sessions")
        pending = asyncio.create_task(
            gateway.rpc(
                "dispatch", {"command": {"op": "measurement_delivery_prepare", "id": str(delivery)}}
            )
        )
        try:
            for _ in range(200):
                await db.execute("SELECT pg_stat_clear_snapshot()")
                row = await (
                    await db.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND query LIKE 'SELECT api.dispatch(%%' AND wait_event_type='Lock'"
                    )
                ).fetchone()
                if row[0]:
                    break
                await asyncio.sleep(0.01)
            else:
                raise AssertionError("Preparation did not reach the concurrent privacy lock")
            await db.execute("SET LOCAL lock_timeout='500ms'")
            await db.execute("DELETE FROM private.leads")
            await db.commit()
            prepared = await asyncio.wait_for(pending, 5)
            assert prepared["status"] in {"not_found", "consent_denied"}, prepared
        finally:
            await db.rollback()
            if not pending.done():
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)
