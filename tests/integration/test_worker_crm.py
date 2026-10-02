from uuid import uuid4

import pytest


async def lead(admin, gateway):
    r = await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert r.status_code == 201, r.text
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        return str(db.execute("SELECT id FROM private.leads").fetchone()[0])


@pytest.mark.asyncio
async def test_worker_enriches_and_repeated_wake_safe(admin, gateway):
    id = await lead(admin, gateway)
    for _ in range(2):
        response = await admin.post(
            "/internal/jobs/process",
            headers={"X-Job-Secret": "j" * 32},
            json={"queue": "lead_local"},
        )
        assert response.status_code == 200, response.text
    detail = await admin.get("/api/v1/admin/leads/" + id)
    assert detail.status_code == 200, detail.text
    assert detail.json()["scores"]["contact_confidence"] == 20
    assert "phone_ciphertext" not in detail.text
    assert "pii_ciphertext" not in detail.text


@pytest.mark.asyncio
async def test_fencing_and_queue_claim_once(admin, gateway):
    await lead(admin, gateway)
    result = await gateway.rpc(
        "claim_jobs", {"command": {"queue": "lead_local", "limit": 10, "lease_seconds": 60}}
    )
    assert len(result["jobs"]) == 1
    assert (
        await gateway.rpc(
            "claim_jobs", {"command": {"queue": "lead_local", "limit": 10, "lease_seconds": 60}}
        )
    )["jobs"] == []
    job = result["jobs"][0]
    stale = await gateway.rpc(
        "complete_job", {"command": {"id": job["id"], "fence": job["fence"] - 1, "result": {}}}
    )
    assert not stale["completed"]


@pytest.mark.asyncio
async def test_crm_version_transition_and_assignment(admin, gateway):
    id = await lead(admin, gateway)
    assigned = await admin.post(
        "/api/v1/admin/leads/" + id + "/assignments", json={"expected_version": 1}
    )
    assert assigned.status_code == 200, assigned.text
    stale = await admin.post(
        "/api/v1/admin/leads/" + id + "/transitions",
        json={"expected_version": 1, "status": "contacting"},
    )
    assert stale.status_code == 409
    installed = await admin.post(
        "/api/v1/admin/leads/" + id + "/transitions",
        json={"expected_version": 2, "status": "installed"},
    )
    assert installed.status_code == 409
    resync = await admin.get("/api/v1/admin/changes")
    assert resync.status_code == 200
    assert all("phone" not in str(x) for x in resync.json()["items"])
