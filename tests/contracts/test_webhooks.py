import hashlib
import hmac
import json
import time

import pytest
from pydantic import SecretStr


@pytest.mark.asyncio
async def test_gateway_signature_and_retry_deduplicate(client):
    client._transport.app.state.settings.incoming_webhook_secret = SecretStr("s" * 32)
    body = json.dumps(
        {
            "provider_event_id": "synthetic-1",
            "lead": {"phone": "0901234567", "consent_version": "v1"},
        }
    ).encode()
    timestamp = str(int(time.time()))
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature": hmac.new(
            b"s" * 32, b"crm." + timestamp.encode() + b"." + body, hashlib.sha256
        ).hexdigest(),
    }
    first = await client.post("/api/v1/webhooks/leads/crm", content=body, headers=headers)
    assert first.status_code == 200, first.text
    second = await client.post("/api/v1/webhooks/leads/crm", content=body, headers=headers)
    assert first.json()["receipt"] == second.json()["receipt"]
    assert (
        await client.post("/api/v1/webhooks/leads/meta", content=body, headers=headers)
    ).status_code == 401
    headers["X-Webhook-Signature"] = "tampered"
    assert (
        await client.post("/api/v1/webhooks/leads/crm", content=body, headers=headers)
    ).status_code == 401


async def test_durable_webhook_idempotency_survives_retention_and_privacy(admin, gateway):

    import psycopg

    admin._transport.app.state.settings.incoming_webhook_secret = SecretStr("s" * 32)
    body = json.dumps(
        {
            "provider_event_id": "durable-event",
            "lead": {"phone": "0901234567", "consent_version": "v1"},
        }
    ).encode()
    timestamp = str(int(time.time()))
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Signature": hmac.new(
            b"s" * 32, b"crm." + timestamp.encode() + b"." + body, hashlib.sha256
        ).hexdigest(),
    }
    first = await admin.post("/api/v1/webhooks/leads/crm", content=body, headers=headers)
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        lid = str(c.execute("SELECT id FROM private.leads").fetchone()[0])
        assert c.execute(
            "SELECT expires_at='infinity'::timestamptz FROM private.idempotency"
        ).fetchone()[0]
    privacy = await admin.post(
        "/api/v1/admin/privacy/requests",
        json={
            "lead_id": lid,
            "action": "delete",
            "reason": "Verified data subject request",
        },
    )
    assert privacy.status_code == 201, privacy.text
    erased = await admin.post(f"/api/v1/admin/privacy/requests/{privacy.json()['id']}/execute")
    assert erased.status_code == 200, erased.text
    replay = await admin.post("/api/v1/webhooks/leads/crm", content=body, headers=headers)
    assert replay.status_code == 200 and replay.json()["receipt"] == first.json()["receipt"]
    assert replay.json()["quote_status"] == "deleted"
    with psycopg.connect(gateway.dsn) as c:
        assert c.execute("SELECT count(*) FROM private.leads").fetchone()[0] == 0
