from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest

from tests.integration.test_worker_crm import lead


@pytest.mark.asyncio
async def test_followup_future_and_withdrawal_prevent_delivery(admin, gateway):
    id = await lead(admin, gateway)
    followup = await admin.post(
        "/api/v1/admin/followups",
        json={
            "lead_id": id,
            "channel": "sms",
            "purpose": "service",
            "scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
        },
    )
    assert followup.status_code == 201, followup.text
    result = await gateway.rpc("claim_jobs", {"command": {"queue": "notifications", "limit": 10}})
    assert result["jobs"] == []
    await admin.put(
        f"/api/v1/admin/leads/{id}/preferences",
        json={"service_contact_allowed": False, "marketing_allowed": False},
    )
    data = await gateway.rpc(
        "dispatch", {"command": {"op": "delivery_prepare", "id": followup.json()["id"]}}
    )
    assert data["status"] == "cancelled"


@pytest.mark.asyncio
async def test_membership_scope_and_shift(admin, gateway):
    staff, branch = str(uuid4()), str(uuid4())
    command = {
        "user_id": staff,
        "branch_id": branch,
        "permissions": ["lead.read", "lead.write"],
        "capacity": 2,
        "active": True,
        "shift": {"weekdays": [], "start": "08:00", "end": "18:00"},
    }
    r = await admin.put("/api/v1/admin/memberships", json=command)
    assert r.status_code == 200, r.text
    assert (await admin.get("/api/v1/admin/memberships")).status_code == 200
    id = await lead(admin, gateway)
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            'UPDATE private.memberships SET shift=\'{"weekdays":[],"start":"08:00","end":"18:00"}\''
        )
    assignment = await admin.post(
        f"/api/v1/admin/leads/{id}/assignments", json={"expected_version": 1}
    )
    assert assignment.json()["status"] == "unassigned", assignment.text


@pytest.mark.asyncio
async def test_intake_session_attribution_and_metrics_rebuild(admin, gateway):
    session = await admin.post(
        "/api/v1/sessions", json={"analytics": True, "marketing": False, "consent_version": "v1"}
    )
    r = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "consent_version": "v1",
            "session_token": session.json()["session_token"],
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert r.status_code == 201, r.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT payload->>'session_id' FROM private.leads").fetchone()[0] is not None
        )
    for _ in range(2):
        r = await admin.post(
            "/api/v1/admin/reports/rebuild", json={"day": datetime.now(UTC).date().isoformat()}
        )
        assert r.status_code == 200, r.text
    metrics = await admin.get("/api/v1/admin/reports/daily")
    assert sum(item["payload"]["leads"] for item in metrics.json()["items"]) == 1
