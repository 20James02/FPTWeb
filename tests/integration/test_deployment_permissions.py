import json
from uuid import uuid4

import psycopg
import pytest


@pytest.mark.asyncio
async def test_real_service_role_intake_queue_and_worker(client, gateway):
    r = await client.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert r.status_code == 201
    with psycopg.connect(gateway.dsn) as db:
        db.execute("SET ROLE service_role")
        claimed = db.execute(
            "SELECT api.claim_jobs(%s::jsonb)", [json.dumps({"queue": "lead_local", "limit": 1})]
        ).fetchone()[0]
        assert len(claimed["jobs"]) == 1
        job = claimed["jobs"][0]
        r = db.execute(
            "SELECT api.fail_job(%s::jsonb)",
            [
                json.dumps(
                    {
                        "id": job["id"],
                        "fence": job["fence"],
                        "delay": 1,
                        "permanent": False,
                        "code": "TEST",
                    }
                )
            ],
        ).fetchone()[0]
        assert r["updated"]


@pytest.mark.asyncio
async def test_fit_boolean_and_terminal_capacity(admin, gateway):
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    with psycopg.connect(gateway.dsn) as db:
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    assert (
        await admin.post(
            f"/api/v1/admin/leads/{id}/observations",
            json={"field": "infrastructure", "value": True, "evidence_ref": "staff-test"},
        )
    ).status_code == 200
    await admin.post(
        "/internal/jobs/process", json={"queue": "lead_local"}, headers={"X-Job-Secret": "j" * 32}
    )
    assert (await admin.get(f"/api/v1/admin/leads/{id}")).json()["scores"]["fit"] == 100
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            'UPDATE private.memberships SET shift=\'{"weekdays":[0,1,2,3,4,5,6],"start":"00:00","end":"23:59"}\''
        )
    version = (await admin.get(f"/api/v1/admin/leads/{id}")).json()["version"]
    assigned = await admin.post(
        f"/api/v1/admin/leads/{id}/assignments", json={"expected_version": version}
    )
    rejected = await admin.post(
        f"/api/v1/admin/leads/{id}/transitions",
        json={
            "expected_version": assigned.json()["version"],
            "status": "rejected",
            "reason": "synthetic",
        },
    )
    assert rejected.status_code == 200, rejected.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT sum(active_leads) FROM private.memberships").fetchone()[0] == 0
