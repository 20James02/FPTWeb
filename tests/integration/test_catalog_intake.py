import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest


async def catalog(admin):
    branch = str(uuid4())
    region = (
        await admin.post(
            "/api/v1/admin/regions",
            json={"name": "Test region", "code": "test", "branch_id": branch},
        )
    ).json()
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={
                "name": "Test plan",
                "service": "internet",
                "code": "test",
                "description": "Synthetic fixture only",
            },
        )
    ).json()
    assert "id" in plan, plan
    for kind, item in [("regions", region), ("plans", plan)]:
        assert (
            await admin.post(
                f"/api/v1/admin/{kind}/{item['id']}/publish", json={"expected_version": 1}
            )
        ).status_code == 200
    return plan["id"], region["id"]


@pytest.mark.asyncio
async def test_price_publish_overlap_and_quote(admin):
    plan, region = await catalog(admin)
    now = datetime.now(UTC)
    payload = {
        "plan_id": plan,
        "scope_id": region,
        "scope_kind": "region",
        "billing_months": 6,
        "monthly_vnd": 200000,
        "source": "synthetic",
        "start": (now - timedelta(days=1)).isoformat(),
        "end": (now + timedelta(days=1)).isoformat(),
    }
    response = await admin.post("/api/v1/admin/prices", json=payload)
    assert response.status_code == 201, response.text
    p = response.json()
    assert (
        await admin.post(f"/api/v1/admin/prices/{p['id']}/publish", json={"expected_version": 1})
    ).status_code == 200
    q = await admin.post(
        "/api/v1/quotes", json={"plan_id": plan, "region_id": region, "billing_months": 6}
    )
    assert q.status_code == 200, q.text
    assert q.json()["initial_total_vnd"] == 1200000
    second = (await admin.post("/api/v1/admin/prices", json=payload)).json()
    overlap = await admin.post(
        f"/api/v1/admin/prices/{second['id']}/publish", json={"expected_version": 1}
    )
    assert overlap.status_code == 409, overlap.text


@pytest.mark.asyncio
async def test_concurrent_intake_replays_and_conflicts(admin, gateway):
    plan, region = await catalog(admin)
    payload = {
        "phone": "0901234567",
        "plan_id": plan,
        "region_id": region,
        "service_ids": ["internet"],
        "consent_version": "v1",
    }
    key = str(uuid4())
    results = await asyncio.gather(
        *[
            admin.post("/api/v1/leads", json=payload, headers={"Idempotency-Key": key})
            for _ in range(50)
        ]
    )
    assert all(r.status_code in (200, 201) for r in results), [r.text for r in results[:3]]
    assert len({r.json()["receipt"] for r in results}) == 1
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.leads").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 1
        assert (
            db.execute("SELECT phone_ciphertext FROM private.contacts").fetchone()[0]
            != "0901234567"
        )
    different = await admin.post(
        "/api/v1/leads", json={**payload, "name": "Other"}, headers={"Idempotency-Key": key}
    )
    assert different.status_code == 409
    other = await admin.post(
        "/api/v1/leads",
        json={**payload, "installation_address": "Other address"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert other.status_code == 201
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.contacts").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM private.leads").fetchone()[0] == 2


@pytest.mark.asyncio
async def test_invalid_phone_and_client_extra_denied(client):
    r = await client.post(
        "/api/v1/leads",
        json={"phone": "123", "consent_version": "v1"},
        headers={"Idempotency-Key": "invalid-test"},
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1", "score": 100},
        headers={"Idempotency-Key": "invalid-test"},
    )
    assert r.status_code == 422
