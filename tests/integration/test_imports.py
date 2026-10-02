import pytest


@pytest.mark.asyncio
async def test_import_invalid_rows_never_apply(admin):
    r = await admin.post(
        "/api/v1/admin/prices/imports/preview", json={"csv": "plan_id,monthly_vnd\ninvalid,10\n"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["errors"]
    assert r.json()["approval_token"] is None
    assert (
        await admin.post(
            "/api/v1/admin/prices/imports/apply", json={"csv": "x", "approval_token": "invalid"}
        )
    ).status_code in {403, 422}


@pytest.mark.asyncio
async def test_scheduled_page_does_not_publish_early(admin, gateway):
    from datetime import UTC, datetime, timedelta

    page = await admin.post(
        "/api/v1/admin/pages", json={"title": "Schedule", "slug": "schedule-test", "blocks": []}
    )
    r = await admin.post(
        f"/api/v1/admin/pages/{page.json()['id']}/schedule",
        json={
            "expected_version": 1,
            "publish_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    await admin.post(
        "/internal/jobs/process", headers={"X-Job-Secret": "j" * 32}, json={"queue": "maintenance"}
    )
    assert (await admin.get("/api/v1/pages/schedule-test")).status_code == 404
