import pytest

from tests.integration.test_measurement_registry import connection


async def test_measurement_page_has_complete_editors_and_safe_preview(admin):
    result = await admin.get("/admin/measurement")
    assert result.status_code == 200
    for id in (
        "ms-connections",
        "ms-configs",
        "ms-releases",
        "ms-connection-form",
        "ms-config-form",
        "ms-rules",
        "ms-simulation",
        "ms-credentials-form",
    ):
        assert f'id="{id}"' in result.text
    assert "admin-measurement.css" in result.text and "admin/measurement.js" in result.text
    assert 'type="password"' in result.text
    assert "pagefpt-google-config" not in result.text


async def test_unauthenticated_measurement_editor_redirects(client):
    result = await client.get("/admin/measurement")
    assert result.status_code == 303 and result.headers["location"] == "/admin/login"


@pytest.mark.parametrize("origin", ["", "https://example.test", "https://example.test/"])
async def test_guide_callback_matches_the_actual_oauth_redirect(admin, origin):
    admin._transport.app.state.settings.public_origin = origin
    created = await admin.post("/api/v1/admin/measurement/connections", json=connection())
    assert created.status_code == 201
    id = created.json()["id"]
    saved = await admin.post(
        f"/api/v1/admin/measurement/connections/{id}/credentials",
        json={
            "expected_version": 1,
            "values": {"client_id": "synthetic-client", "client_secret": "synthetic-secret"},
        },
    )
    assert saved.status_code == 200
    start = await admin.post(f"/api/v1/admin/measurement/connections/{id}/oauth/start")
    assert start.status_code == 200
    page = await admin.get("/admin/measurement")
    assert page.status_code == 200
    assert f'id="ms-guide-callback">{start.json()["redirect_uri"]}</code>' in page.text
