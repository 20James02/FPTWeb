from datetime import UTC, datetime
from uuid import uuid4

import httpx
import psycopg
import pytest
import respx
from psycopg.types.json import Jsonb


@pytest.mark.asyncio
async def test_revoked_member_valid_jwt_denied(admin, gateway):
    assert (await admin.get("/api/v1/admin/me")).status_code == 200
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("UPDATE private.memberships SET active=false")
    assert (await admin.get("/api/v1/admin/me")).status_code == 403


@pytest.mark.asyncio
async def test_browser_roles_cannot_read_or_intake(gateway):
    for role in ["anon", "authenticated"]:
        with psycopg.connect(gateway.dsn) as db:
            db.execute("SET LOCAL ROLE " + role)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                db.execute("SELECT * FROM private.contacts")
        with psycopg.connect(gateway.dsn) as db:
            db.execute("SET LOCAL ROLE " + role)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                db.execute("SELECT api.submit_lead(%s)", [Jsonb({})])


@pytest.mark.asyncio
async def test_cross_branch_price_creation_denied(admin, gateway):
    uid = (await admin.get("/api/v1/admin/me")).json()["id"]
    foreign = str(uuid4())
    region = (
        await admin.post(
            "/api/v1/admin/regions",
            json={"name": "Foreign", "code": "foreign", "branch_id": foreign},
        )
    ).json()
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "Fixture", "service": "internet", "code": "fixture"},
        )
    ).json()
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.memberships SET branch_id=%s,permissions=ARRAY['pricing.write'] WHERE user_id=%s",
            [str(uuid4()), uid],
        )
    result = await admin.post(
        "/api/v1/admin/prices",
        json={
            "plan_id": plan["id"],
            "scope_id": region["id"],
            "scope_kind": "region",
            "billing_months": 6,
            "monthly_vnd": 1,
            "start": datetime.now(UTC).isoformat(),
            "source": "test",
        },
    )
    assert result.status_code == 403, result.text


@pytest.mark.asyncio
async def test_worker_lease_expired_blocks_completion(admin, gateway):
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    job = (
        await gateway.rpc(
            "claim_jobs", {"command": {"queue": "lead_local", "limit": 1, "lease_seconds": 60}}
        )
    )["jobs"][0]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE private.jobs SET lease_until=now()-interval '1 second' WHERE id=%s", [job["id"]]
        )
    result = await gateway.rpc(
        "complete_job", {"command": {"id": job["id"], "fence": job["fence"], "result": {}}}
    )
    assert result["completed"] is False


@pytest.mark.asyncio
async def test_postgrest_secret_key_header_and_isolation():
    from pagefpt.infrastructure.supabase import SupabaseGateway

    db = SupabaseGateway("https://example.supabase.co", "sb_secret_synthetic")
    with respx.mock() as mock:

        def check_header(request):
            assert request.headers["apikey"] == "sb_secret_synthetic"
            assert "Authorization" not in request.headers
            assert request.headers["content-profile"] == "api"
            return httpx.Response(200, json={"ready": True})

        mock.post("https://example.supabase.co/rest/v1/rpc/health").mock(side_effect=check_header)
        assert await db.rpc("health", {}) == {"ready": True}
    await db.close()


@pytest.mark.asyncio
async def test_published_content_stays_old_until_publish(admin):
    r = (
        await admin.post(
            "/api/v1/admin/pages", json={"title": "Old", "slug": "revision", "blocks": []}
        )
    ).json()
    await admin.post("/api/v1/admin/pages/" + r["id"] + "/publish", json={"expected_version": 1})
    change = await admin.put(
        "/api/v1/admin/pages/" + r["id"] + "?expected_version=2",
        json={"title": "New", "slug": "revision", "blocks": []},
    )
    assert change.status_code == 200, change.text
    assert (await admin.get("/api/v1/pages/revision")).json()["title"] == "Old"
    await admin.post("/api/v1/admin/pages/" + r["id"] + "/publish", json={"expected_version": 3})
    assert (await admin.get("/api/v1/pages/revision")).json()["title"] == "New"
