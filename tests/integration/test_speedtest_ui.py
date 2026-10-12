import pytest


@pytest.mark.asyncio
async def test_speedtest_is_manual_with_home_prompt_instead_of_navbar(client):
    page = await client.get("/do-toc-do")
    assert page.status_code == 200
    assert 'id="speedtest-start"' in page.text
    assert 'id="speedtest-cancel"' in page.text
    assert 'id="speedtest-status"' in page.text
    assert 'id="speedtest-recommendations"' in page.text
    assert 'aria-live="polite"' in page.text
    assert "Cloudflare" in page.text
    assert "60 MB" in page.text
    assert "speedtest.js" in page.text
    assert "cloudflare-speedtest-1.14.1.js" not in page.text
    for path in ["/", "/khuyen-mai", "/san-pham/internet-gia-dinh"]:
        response = await client.get(path)
        assert response.status_code == 200
        assert 'href="/do-toc-do"' in response.text
        header = response.text.split('<nav class="main-nav-desktop"', 1)[1].split("</nav>", 1)[0]
        assert "/do-toc-do" not in header
        if path == "/":
            assert 'id="home-speedtest-prompt"' in response.text
        assert "speedtest.js" not in response.text


@pytest.mark.asyncio
async def test_speedtest_only_renders_published_catalog_and_escapes_content(admin):
    async def create(name, code):
        response = await admin.post(
            "/api/v1/admin/plans",
            json={
                "name": name,
                "code": code,
                "service": "internet",
                "speed_mbps": 300,
            },
        )
        assert response.status_code == 201
        return response.json()

    plan = await create("<script>sample</script> Public", "qa-speed-public")
    draft = await create("Secret Draft Package", "qa-speed-draft")
    response = await admin.post(
        f"/api/v1/admin/plans/{plan['id']}/publish", json={"expected_version": plan["version"]}
    )
    assert response.status_code == 200
    page = await admin.get("/do-toc-do")
    assert page.status_code == 200
    assert "Secret Draft Package" not in page.text
    assert draft["id"] not in page.text
    assert "<script>sample</script>" not in page.text
    assert plan["id"] in page.text
    assert "data-speed-plan" in page.text
    assert "Cần tư vấn" in page.text


@pytest.mark.asyncio
async def test_speed_cards_use_admin_labels_real_equipment_and_visible_image_fallback(admin):
    created = await admin.post(
        "/api/v1/admin/plans",
        json={
            "name": "Gói kiểm thử thẻ cao cấp",
            "code": "qa-speed-card-labels",
            "service": "internet",
            "speed_mbps": 300,
            "description": "Mô tả công bố <script>không chạy</script>",
            "equipment": ["Modem đã công bố", "Thiết bị thứ hai"],
            "card_labels": {
                "badge": "Nhãn riêng <b>Admin</b>",
                "speed": "Băng thông gói",
                "equipment": "Thiết bị theo gói",
                "register": "Tư vấn gói phù hợp",
                "details": "Xem thông tin gói",
            },
        },
    )
    assert created.status_code == 201
    plan = created.json()
    published = await admin.post(
        f"/api/v1/admin/plans/{plan['id']}/publish",
        json={"expected_version": plan["version"]},
    )
    assert published.status_code == 200
    page = await admin.get("/do-toc-do")
    card = page.text.split(f'data-speed-plan="{plan["id"]}"', 1)[1].split("</article>", 1)[0]
    assert "device-internet-3d.webp" in card
    assert "Nhãn riêng &lt;b&gt;Admin&lt;/b&gt;" in card
    assert "Băng thông gói" in card and "Thiết bị theo gói" in card
    assert "Tư vấn gói phù hợp" in card and "Xem thông tin gói" in card
    assert "Modem đã công bố" in card and "Thiết bị thứ hai" in card
    assert f'data-plan-detail="{plan["id"]}"' in card
    assert 'class="speed-plan-price-unit"' in card
    assert 'id="speed-recommend-result"' in page.text
    assert "speed_cards.js" in page.text
