import httpx
import pytest
import respx

from tests.integration.test_measurement_registry import connection

BASE = "/api/v1/admin/measurement"


async def make_connection(admin, provider="ga4", settings=None, keys=None):
    created = await admin.post(
        BASE + "/connections",
        json=connection(
            provider=provider,
            enabled=True,
            settings=settings
            or {
                "measurement_id": "G-SETUP123",
                "property_id": "123",
                "stream_id": "456",
                "browser_enabled": True,
            },
        ),
    )
    assert created.status_code == 201, created.text
    row = created.json()
    if keys:
        saved = await admin.post(
            BASE + f"/connections/{row['id']}/credentials",
            json={"expected_version": row["version"], "values": keys},
        )
        assert saved.status_code == 200
        row = saved.json()
    return row


async def test_behavior_mapping_publish_and_simulate_without_counting_a_lead(admin, gateway):
    row = await make_connection(admin, "meta", {"pixel_id": "123456", "browser_enabled": True})
    created = await admin.post(
        BASE + "/configs",
        json={
            "name": "Behavior mapping",
            "environment": "test",
            "rules": [
                {
                    "event": "click_zalo",
                    "connection_id": row["id"],
                    "provider_event": "Contact",
                    "route": "browser",
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    draft = created.json()
    simulated = await admin.post(
        BASE + f"/configs/{draft['id']}/simulate",
        json={
            "expected_version": 1,
            "event": "click_zalo",
            "analytics": True,
            "marketing": True,
            "advertising": True,
        },
    )
    assert simulated.status_code == 200, simulated.text
    assert simulated.json()["routes"][0]["event"] == "Contact"
    published = await admin.post(
        BASE + f"/configs/{draft['id']}/publish", json={"expected_version": 1}
    )
    assert published.status_code == 200, published.text
    public = (await admin.get("/api/v1/measurement/config")).json()
    assert public["targets"][0]["event"] == "click_zalo"
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.measurement_occurrences").fetchone()[0] == 0


@pytest.mark.parametrize(
    "changes",
    [
        {"primary": True},
        {"value_vnd": 100},
        {"provider_event": "Purchase"},
        {"provider_event": "generate_lead"},
        {"route": "server"},
    ],
)
async def test_behavior_cannot_be_paid_primary_or_server_conversion(admin, changes):
    row = await make_connection(admin, "meta", {"pixel_id": "123456", "browser_enabled": True})
    draft = await admin.post(
        BASE + "/configs",
        json={
            "name": "Behavior",
            "environment": "test",
            "rules": [
                {
                    "event": "view_plan",
                    "connection_id": row["id"],
                    "provider_event": "ViewContent",
                    **changes,
                }
            ],
        },
    )
    if draft.status_code == 201:
        checked = await admin.post(
            BASE + f"/configs/{draft.json()['id']}/validate", json={"expected_version": 1}
        )
        assert checked.status_code == 422, checked.text
    else:
        assert draft.status_code == 422, draft.text


@respx.mock
async def test_diagnostics_read_ga4_and_report_permissions_without_sending_events(admin):
    row = await make_connection(admin, keys={"access_token": "synthetic-private-token"})
    stream = respx.get(
        "https://analyticsadmin.googleapis.com/v1beta/properties/123/dataStreams/456"
    ).mock(
        return_value=httpx.Response(200, json={"webStreamData": {"measurementId": "G-SETUP123"}})
    )
    report = respx.get("https://analyticsdata.googleapis.com/v1beta/properties/123/metadata").mock(
        return_value=httpx.Response(403, json={"error": {"message": "synthetic-private-token"}})
    )
    result = await admin.post(BASE + f"/connections/{row['id']}/diagnostics")
    assert result.status_code == 200, result.text
    assert stream.called and report.called
    data = result.json()
    assert data["delivery_verified"] is False
    assert any(c["key"] == "account" and c["status"] == "pass" for c in data["checks"])
    assert any(c["key"] == "reporting" and c["status"] == "fail" for c in data["checks"])
    assert "synthetic-private-token" not in result.text


@respx.mock
async def test_browser_configuration_does_not_claim_api_connected(admin):
    row = await make_connection(admin)
    result = await admin.post(BASE + f"/connections/{row['id']}/diagnostics")
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["state"] != "connected" and data["delivery_verified"] is False
    assert any(c["key"] == "browser" and c["status"] == "pass" for c in data["checks"])
    assert any(c["key"] == "credentials" and c["status"] == "warning" for c in data["checks"])
    assert len(respx.calls) == 0


async def test_diagnostics_requires_authenticated_admin(client):
    r = await client.post(BASE + "/connections/00000000-0000-0000-0000-000000000001/diagnostics")
    assert r.status_code == 401


@pytest.mark.parametrize("enabled,expected", [(True, True), (False, False)])
async def test_simulation_distinguishes_native_ga4_from_ads_consent_and_disabled_events(
    admin, enabled, expected
):
    row = await make_connection(admin)
    draft = await admin.post(
        BASE + "/configs",
        json={
            "name": "Native simulation",
            "environment": "test",
            "policy": {
                "ga4_connection_id": row["id"],
                "event_enabled": ["click_zalo"] if enabled else [],
            },
        },
    )
    assert draft.status_code == 201
    r = await admin.post(
        BASE + f"/configs/{draft.json()['id']}/simulate",
        json={
            "expected_version": 1,
            "event": "click_zalo",
            "analytics": True,
            "marketing": False,
            "advertising": False,
        },
    )
    assert r.status_code == 200
    assert len(r.json()["routes"]) == 1
    assert r.json()["routes"][0]["allowed"] is expected


@pytest.mark.parametrize("mode,allowed", [("advanced", True), ("basic", False)])
async def test_native_ga4_simulation_explains_limited_advanced_signals(admin, mode, allowed):
    row = await make_connection(admin)
    draft = await admin.post(
        BASE + "/configs",
        json={
            "name": "Consent mode",
            "environment": "test",
            "policy": {"ga4_connection_id": row["id"], "consent_mode": mode},
        },
    )
    result = await admin.post(
        BASE + f"/configs/{draft.json()['id']}/simulate",
        json={"expected_version": 1, "event": "page_view"},
    )
    assert result.status_code == 200
    route = result.json()["routes"][0]
    assert route["allowed"] is allowed
    assert route.get("limited", False) is allowed
