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
