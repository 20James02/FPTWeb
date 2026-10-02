from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest


@pytest.mark.asyncio
async def test_abandoned_delivery_is_unknown_and_requires_reconciliation(admin, gateway):
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    with psycopg.connect(gateway.dsn) as db:
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    r = await admin.post(
        "/api/v1/admin/followups",
        json={
            "lead_id": id,
            "channel": "sms",
            "scheduled_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    fid = r.json()["id"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "INSERT INTO private.deliveries(platform,event_id,account_id,state) VALUES('notification',%s,'sms','sending')",
            [fid],
        )
    result = await gateway.rpc("dispatch", {"command": {"op": "delivery_prepare", "id": fid}})
    assert result["status"] == "unknown"
    reconciliation = await admin.post(
        f"/api/v1/admin/followups/{fid}/reconcile",
        json={"state": "retry", "evidence_ref": "gateway-confirmed-not-sent"},
    )
    assert reconciliation.status_code == 200, reconciliation.text
