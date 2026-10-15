from tests.integration.test_measurement_registry import connection


async def test_cost_preview_apply_is_idempotent_and_conflict_checked(admin):
    conn = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                provider="google_ads", settings={"tag_id": "AW-123456", "customer_id": "123456789"}
            ),
        )
    ).json()
    body = {
        "connection_id": conn["id"],
        "rows": [
            {
                "day": "2026-10-15",
                "campaign_id": "12345678901234567890",
                "cost_vnd": 123000,
                "clicks": 20,
                "impressions": 400,
            }
        ],
    }
    preview = await admin.post("/api/v1/admin/measurement/cost-imports/preview", json=body)
    assert preview.status_code == 200, preview.text
    assert preview.json()["total_cost_vnd"] == 123000
    data = {**body, "preview_token": preview.json()["preview_token"]}
    applied = await admin.post("/api/v1/admin/measurement/cost-imports/apply", json=data)
    assert applied.status_code == 200, applied.text
    repeated = await admin.post("/api/v1/admin/measurement/cost-imports/apply", json=data)
    assert repeated.status_code == 200 and repeated.json()["replayed"] is True
    report = await admin.get("/api/v1/admin/measurement/reports?start=2026-10-15&end=2026-10-15")
    assert report.status_code == 200, report.text
    assert report.json()["totals"]["cost_vnd"] == 123000
    assert report.json()["totals"]["forms"] == 0 and report.json()["totals"]["cpl_vnd"] is None
    changed = await admin.post(
        "/api/v1/admin/measurement/cost-imports/apply",
        json={**data, "rows": [{**body["rows"][0], "cost_vnd": 999999}]},
    )
    assert changed.status_code == 409


async def test_report_missing_cost_is_unknown_and_range_bounded(admin):
    result = await admin.get("/api/v1/admin/measurement/reports?start=2026-10-01&end=2026-10-15")
    assert result.status_code == 200
    assert result.json()["totals"]["cost_vnd"] is None
    assert result.json()["timezone"] == "Asia/Ho_Chi_Minh"
    assert (
        await admin.get("/api/v1/admin/measurement/reports?start=2025-01-01&end=2026-10-15")
    ).status_code == 422


async def test_cost_import_rejects_mixed_rollup_grains(admin):
    conn = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(provider="google_ads", settings={"tag_id": "AW-123456"}),
        )
    ).json()
    row = {"day": "2026-10-15", "campaign_id": "123", "cost_vnd": 100}
    result = await admin.post(
        "/api/v1/admin/measurement/cost-imports/preview",
        json={"connection_id": conn["id"], "rows": [row, {**row, "ad_id": "456"}]},
    )
    assert result.status_code == 422
