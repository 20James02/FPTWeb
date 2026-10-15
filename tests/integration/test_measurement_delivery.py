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
