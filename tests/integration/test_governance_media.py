from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_reports_rebuild_and_delete(admin, gateway):
    response = await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1", "notes": "Private note"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    report = await admin.get("/api/v1/admin/reports")
    assert report.status_code == 200, report.text
    assert report.json()["funnel"]["leads"] == 1
    assert report.json()["funnel"]["installed"] == 0
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    deletion = await admin.post(
        "/api/v1/admin/privacy/requests",
        json={"lead_id": id, "action": "delete", "reason": "Synthetic deletion test"},
    )
    assert deletion.status_code == 201, deletion.text
    approved = await admin.post(
        "/api/v1/admin/privacy/requests/" + deletion.json()["id"] + "/execute"
    )
    assert approved.status_code == 200, approved.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.contacts").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM private.leads").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM private.tombstones").fetchone()[0] == 1
    assert (
        await admin.post(
            "/api/v1/leads",
            json={"phone": "0901234567", "consent_version": "v1"},
            headers={"Idempotency-Key": str(uuid4())},
        )
    ).status_code == 201


@pytest.mark.asyncio
async def test_r2_disabled_and_export_permissions(admin, client):
    upload = await admin.post(
        "/api/v1/admin/media/upload-intents",
        json={"filename": "test.jpg", "content_type": "image/jpeg", "size_bytes": 100},
    )
    assert upload.status_code == 503, upload.text
    client.headers.pop("Authorization", None)
    denied = await client.post("/api/v1/admin/exports", json={"format": "csv"})
    assert denied.status_code == 401, denied.text
