from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from tests.integration.test_client_release_images import ready_asset


def categories(ids):
    return [
        {"name": "Gói gia đình", "short_name": "Gia đình", "plan_ids": ids},
        {"name": "Gói doanh nghiệp", "short_name": "Doanh nghiệp", "services": ["business"]},
        {"name": "Internet & TV", "short_name": "Combo", "services": ["combo", "play"]},
    ]


async def save(admin, payload):
    version = (await admin.get("/api/v1/system/display-settings")).json()["version"]
    return await admin.post(
        "/api/v1/system/display-settings", json={"expected_version": version, **payload}
    )


async def test_admin_slide_and_three_categories_render_actual_home_in_production(admin, gateway):
    app = admin._transport.app
    app.state.settings.media_domain = "https://media.example.test"
    asset = ready_asset(gateway)
    plan = (
        await admin.post(
            "/api/v1/admin/plans",
            json={"name": "QA Plan", "service": "internet", "code": "qa-home"},
        )
    ).json()
    now = datetime.now(UTC)
    slide = {
        "title": "Ưu đãi <QA>",
        "description": "Tư vấn theo địa bàn",
        "image_id": asset,
        "image_alt": "Ảnh QA",
        "enabled": True,
        "start": (now - timedelta(days=1)).isoformat(),
        "end": (now + timedelta(days=1)).isoformat(),
        "plan_id": plan["id"],
    }
    response = await save(
        admin, {"promo_slides": [slide], "plan_categories": categories([plan["id"]])}
    )
    assert response.status_code == 200, response.text
    configured = response.json()["settings"]
    assert configured["promo_slides"][0]["image_url"].startswith(
        "https://media.example.test/images/"
    )
    app.state.settings.environment = "production"
    try:
        html = (await admin.get("/")).text
        assert 'id="home-promo-slider"' in html
        assert "Ưu đãi &lt;QA&gt;" in html
        assert "Ảnh QA" in html
        assert html.count("data-plan-category=") == 3
        assert "data-category-plan-ids=" in html
        assert "footer-disclaimer-card" not in html
    finally:
        app.state.settings.environment = "test"


async def test_disabled_and_expired_slides_do_not_render(admin):
    now = datetime.now(UTC)
    r = await save(
        admin,
        {
            "promo_slides": [
                {"title": "Hidden QA", "enabled": False},
                {"title": "Expired QA", "end": (now - timedelta(seconds=1)).isoformat()},
            ]
        },
    )
    assert r.status_code == 200, r.text
    html = (await admin.get("/")).text
    assert "Hidden QA" not in html and "Expired QA" not in html
    assert 'id="home-promo-slider"' not in html


@pytest.mark.parametrize(
    "payload",
    [
        {"plan_categories": categories([])[:2]},
        {"plan_categories": [{"name": "X", "short_name": "X"}] * 3},
        {"promo_slides": [{"title": "QA", "image_url": "javascript:alert(1)"}]},
        {"promo_slides": [{"title": "QA", "start": "2026-10-08T10:00:00"}]},
    ],
)
async def test_invalid_merchandising_never_saves(admin, payload):
    before = (await admin.get("/api/v1/system/display-settings")).json()
    assert (await save(admin, payload)).status_code == 422
    assert (await admin.get("/api/v1/system/display-settings")).json() == before


async def test_unknown_package_and_quarantined_image_rejected(admin, gateway):
    assert (await save(admin, {"plan_categories": categories([str(uuid4())])})).status_code == 404
    assert (
        await save(
            admin,
            {"promo_slides": [{"title": "QA", "image_id": ready_asset(gateway, "quarantine")}]},
        )
    ).status_code == 422


async def test_merchandising_requires_admin_mfa(client):
    assert (
        await client.post(
            "/api/v1/system/display-settings", json={"expected_version": 0, "promo_slides": []}
        )
    ).status_code == 401


async def test_media_slide_has_click_destination_without_visible_copy(admin, gateway):
    admin._transport.app.state.settings.media_domain = "https://media.example.test"
    response = await save(
        admin,
        {
            "promo_slides": [
                {
                    "title": "Tên nội bộ QA",
                    "description": "Không phủ chữ lên ảnh",
                    "cta_label": "Không hiện nút",
                    "image_id": ready_asset(gateway),
                    "href": "/khuyen-mai",
                    "video_url": "https://media.example.test/offer.webm",
                }
            ]
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["settings"]["promo_slides"][0]["href"] == "/khuyen-mai"
    html = (await admin.get("/")).text
    slide = html.split('class="home-promo-slide"', 1)[1].split("</article>", 1)[0]
    assert 'href="/khuyen-mai"' in slide
    assert "<video" in slide and "playsinline" in slide
    assert "<h1" not in slide and "<p" not in slide and "<button" not in slide
    assert "Không phủ chữ lên ảnh" not in slide
    assert html.index('id="home-speedtest-prompt"') > html.index('id="home-promo-slider"')


@pytest.mark.parametrize(
    "field,value",
    [
        ("href", "javascript:alert(1)"),
        ("href", "//outside.test"),
        ("video_url", "http://outside.test/movie.mp4"),
        ("video_url", "https://outside.test/embed.html"),
        ("video_url", "https://user:password@outside.test/movie.mp4"),
    ],
)
async def test_slide_rejects_unsafe_links_and_non_video_urls(admin, field, value):
    assert (await save(admin, {"promo_slides": [{"title": "QA", field: value}]})).status_code == 422


async def test_legacy_speedtest_navigation_is_removed_but_prompt_remains(admin):
    response = await save(
        admin,
        {
            "navigation_items": [
                {
                    "id": "speedtest",
                    "preset": "speedtest",
                    "label": "Đo tốc độ",
                    "href": "/do-toc-do",
                },
                {
                    "id": "custom",
                    "label": "Liên kết khác",
                    "href": "/khuyen-mai",
                    "children": [
                        {"label": "Đo tốc độ", "href": "/do-toc-do?source=menu"},
                        {"label": "Ưu đãi", "href": "/khuyen-mai"},
                    ],
                },
            ]
        },
    )
    assert response.status_code == 200
    html = (await admin.get("/")).text
    desktop = html.split('<nav class="main-nav-desktop"', 1)[1].split("</nav>", 1)[0]
    mobile = html.split('<div class="mobile-nav-body">', 1)[1].split("<!-- Quick Action", 1)[0]
    assert "/do-toc-do" not in desktop and "/do-toc-do" not in mobile
    assert 'id="home-speedtest-prompt"' in html
