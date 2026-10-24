"""Integration test for the Vũng Tàu cloned landing page and lead submission."""

import pytest


@pytest.mark.asyncio
async def test_main_site_home_page_remains_unaffected(client):
    """The main website at / must continue serving the standard PageFPT home page."""
    response = await client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Lắp Mạng FPT" in response.text
    # Should not contain the cloned Vũng Tàu custom modal
    assert "vt-lead-modal" not in response.text


@pytest.mark.asyncio
async def test_vungtau_direct_paths_render_cloned_page(client):
    """Accessing /vungtau or /dang-ky-thong-tin directly serves the Vũng Tàu page."""
    for path in ["/vungtau", "/dang-ky-thong-tin"]:
        response = await client.get(path)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "FPT Vũng Tàu" in response.text
        assert "0947 803 111" in response.text
        assert "vt-lead-modal" in response.text
        assert "/static/js/client/vungtau-lead.js" in response.text


@pytest.mark.asyncio
async def test_vungtau_custom_domain_routing(client):
    """Accessing / with Host header for fptvungtau.com renders the cloned page."""
    for host in ["fptvungtau.com", "www.fptvungtau.com", "vungtau.pagefpt.vn"]:
        response = await client.get("/", headers={"host": host})
        assert response.status_code == 200
        assert "FPT Vũng Tàu" in response.text
        assert "vt-lead-modal" in response.text


@pytest.mark.asyncio
async def test_vungtau_preview_query_routing(client):
    """Accessing / with ?site=vungtau or ?preview_site=vungtau allows instant preview."""
    for param in ["?site=vungtau", "?preview_site=vungtau"]:
        response = await client.get(f"/{param}")
        assert response.status_code == 200
        assert "FPT Vũng Tàu" in response.text
        assert "vt-lead-modal" in response.text


@pytest.mark.asyncio
async def test_vungtau_lead_submission(client):
    """A lead submitted from Vũng Tàu page posts to /api/v1/leads and succeeds."""
    payload = {
        "phone": "0947803111",
        "name": "Anh Nguyễn Văn B",
        "installation_address": "186 Trương Công Định, Phường 3, TP. Vũng Tàu",
        "notes": "Gói cước: Gói SKY (1 Gbps) | Nguồn: fptvungtau.com | Thiết bị: Mobile | UTM: utm_source=google_ads",
        "measurement_path": "/vungtau",
        "consent_version": "2026.1",
    }
    response = await client.post(
        "/api/v1/leads",
        json=payload,
        headers={"Idempotency-Key": "test-vungtau-lead-00000001"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["event_id"]
    assert data["receipt"]
