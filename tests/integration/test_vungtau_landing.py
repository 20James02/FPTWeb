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


@pytest.mark.asyncio
async def test_admin_vungtau_page_renders(admin):
    """Admin page /admin/vungtau renders the dedicated configuration interface."""
    response = await admin.get("/admin/vungtau")
    assert response.status_code == 200
    assert "Cấu hình FPT Vũng Tàu" in response.text
    assert "fpt-vungtau.com" in response.text
    assert "vt-hotline" in response.text
    assert "Quản lý Slide Banner Đầu Trang" in response.text


@pytest.mark.asyncio
async def test_vungtau_slide_configuration_save_and_render(admin, client):
    """Admin can save custom slides and contact info, which immediately updates the Vũng Tàu landing page."""
    current_settings = (await admin.get("/api/v1/system/display-settings")).json()
    version = current_settings.get("version", 0)

    custom_slide_url = "https://custom-cdn.example/banner-khuyen-mai-moi.jpg"
    save_resp = await admin.post(
        "/api/v1/system/display-settings",
        json={
            "expected_version": version,
            "vungtau": {
                "hotline": "0988 123 456",
                "hero_slides": [
                    {
                        "image_url": custom_slide_url,
                        "href": "#dang-ky",
                        "alt": "Banner Khuyến Mãi Mới",
                    }
                ],
            },
        },
    )
    assert save_resp.status_code == 200

    page_resp = await client.get("/vungtau")
    assert page_resp.status_code == 200
    assert custom_slide_url in page_resp.text
    assert "0988 123 456" in page_resp.text


@pytest.mark.asyncio
async def test_vungtau_full_configuration_render(admin, client):
    """All custom configuration parameters (SEO, tracking, promo, contact) render accurately."""
    current_settings = (await admin.get("/api/v1/system/display-settings")).json()
    version = current_settings.get("version", 0)

    save_resp = await admin.post(
        "/api/v1/system/display-settings",
        json={
            "expected_version": version,
            "vungtau": {
                "brand_name": "FPT Vũng Tàu Chi Nhánh Mới",
                "brand_title": "FPT Vũng Tàu - Đăng Ký Siêu Tốc 2026",
                "meta_desc": "Mô tả SEO FPT Vũng Tàu ưu đãi đặc biệt hôm nay.",
                "hotline": "0999 888 777",
                "hotline_cs": "1900 8888",
                "zalo_link": "https://zalo.me/0999888777",
                "address": "999 Đường 3 Tháng 2, Phường 8, TP. Vũng Tàu",
                "promo_notice": "Tặng 3 tháng cước + Modem WiFi 7 độc quyền",
                "google_ads_id": "AW-999999999",
                "google_ads_conversion": "ConvTestLabel123",
                "ga4_id": "G-VTTEST999",
                "facebook_pixel_id": "987654321098765",
                "quick_plans": ["Gói VIP Doanh Nghiệp (500M)", "Gói Gia Đình Ultra"],
            },
        },
    )
    assert save_resp.status_code == 200

    page_resp = await client.get("/vungtau")
    assert page_resp.status_code == 200
    text = page_resp.text
    assert "FPT Vũng Tàu Chi Nhánh Mới" in text
    assert "FPT Vũng Tàu - Đăng Ký Siêu Tốc 2026" in text
    assert "Mô tả SEO FPT Vũng Tàu ưu đãi đặc biệt hôm nay." in text
    assert "0999 888 777" in text
    assert "1900 8888" in text
    assert "https://zalo.me/0999888777" in text
    assert "999 Đường 3 Tháng 2, Phường 8, TP. Vũng Tàu" in text
    assert "Tặng 3 tháng cước + Modem WiFi 7 độc quyền" in text
    assert "AW-999999999" in text
    assert "987654321098765" in text
    assert "Gói VIP Doanh Nghiệp (500M)" in text


@pytest.mark.asyncio
async def test_vungtau_chat_widget_and_advisor_config(admin, client):
    """The floating popup chat widget renders with configured advisor name and avatar, and submits leads."""
    current_settings = (await admin.get("/api/v1/system/display-settings")).json()
    version = current_settings.get("version", 0)

    save_resp = await admin.post(
        "/api/v1/system/display-settings",
        json={
            "expected_version": version,
            "vungtau": {
                "advisor_name": "Thu Hồng FPT",
                "advisor_avatar": "https://cdn.example/thuhong-avatar.jpg",
                "hotline": "0911 222 333",
            },
        },
    )
    assert save_resp.status_code == 200

    page_resp = await client.get("/vungtau")
    assert page_resp.status_code == 200
    text = page_resp.text

    # Chat widget markup & configured advisor
    assert "id=\"vt-chat-widget\"" in text
    assert "id=\"vt-chat-toggle\"" in text
    assert "id=\"vt-chat-box\"" in text
    assert "Thu Hồng FPT" in text
    assert "https://cdn.example/thuhong-avatar.jpg" in text
    assert "Thông tin đăng ký" in text
    assert "id=\"vt-chat-form\"" in text
    assert "0911 222 333" in text

    # Chat lead submission via /api/v1/leads
    lead_payload = {
        "phone": "0911222333",
        "name": "Nguyễn Hoàng C",
        "installation_address": "45 Lê Hồng Phong, Vũng Tàu",
        "notes": "[Tư vấn trực tuyến: Thu Hồng FPT] | Nội dung: Cần lắp mạng gấp | Nguồn: fpt-vungtau.com",
        "measurement_path": "/vungtau",
        "consent_version": "2026.1",
    }
    lead_resp = await client.post(
        "/api/v1/leads",
        json=lead_payload,
        headers={"Idempotency-Key": "test-chat-lead-00000002"},
    )
    assert lead_resp.status_code == 201
    assert lead_resp.json()["receipt"]

