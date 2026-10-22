from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse

from tests.integration.test_vouchers import campaign_body, create


class Tags(HTMLParser):
    def __init__(self, body):
        super().__init__()
        self.tags = {}
        self.feed(body)

    def handle_starttag(self, tag, attrs):
        if tag == "meta":
            values = dict(attrs)
            self.tags[values.get("property") or values.get("name")] = values.get("content")


async def test_live_link_redirects_with_intent_and_safe_benefit_context(admin):
    voucher = await create(admin)
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "acquisition-live", "target": "/"},
    )
    result = await admin.get("/s/acquisition-live", follow_redirects=False)
    assert result.status_code == 302
    assert parse_qs(urlparse(result.headers["location"]).query)["pf_offer"] == ["acquisition-live"]
    context = (await admin.get("/api/v1/vouchers/context")).json()["voucher"]
    assert context["benefits"][0]["amount"] == 100000
    assert context["benefits"][0]["region_name"] == "Toàn quốc"
    assert "cost_vnd" not in str(context) and "remaining_budget" not in str(context)


async def test_draft_link_reaches_target_without_setting_a_voucher_cookie(admin):
    voucher = (await admin.post("/api/v1/admin/vouchers", json=campaign_body())).json()
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "acquisition-draft", "target": "/"},
    )
    result = await admin.get("/s/acquisition-draft", follow_redirects=False)
    assert result.status_code == 302, result.text
    query = parse_qs(urlparse(result.headers["location"]).query)
    assert query["pf_offer"] == ["acquisition-draft"]
    assert query.get("pf_link_source"), (
        "Unavailable campaign still has legitimate public link source for general consultation"
    )
    context = (await admin.get("/api/v1/vouchers/context")).json()
    assert context["voucher"] is None
    assert not any(c.name == "pagefpt_voucher" for c in admin.cookies.jar)
    assert (await admin.get("/s/no-such-acquisition", follow_redirects=False)).status_code == 404
    await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "acquisition-draft", "target": "/", "active": False},
    )
    assert (await admin.get("/s/acquisition-draft", follow_redirects=False)).status_code == 404


async def test_link_preview_image_is_independent_editable_and_safe(admin, gateway):
    from html.parser import HTMLParser

    class Tags(HTMLParser):
        def __init__(self, body):
            super().__init__()
            self.tags = {}
            self.feed(body)

        def handle_starttag(self, tag, attrs):
            if tag == "meta":
                values = dict(attrs)
                self.tags[values.get("property") or values.get("name")] = values.get("content")

    voucher = await create(admin, name='Ưu đãi "Camera" <hấp dẫn>')
    endpoint = "/api/v1/admin/vouchers/" + voucher["id"] + "/links"
    image = "https://media.example.test/camera.webp"
    saved = await admin.post(endpoint, json={"slug": "preview-image", "preview_image_url": image})
    assert saved.status_code == 201, saved.text
    listing = (await admin.get("/api/v1/admin/vouchers")).json()["links"]
    assert next(x for x in listing if x["slug"] == "preview-image")["preview_image_url"] == image
    for ua in ("facebookexternalhit/1.1", "TelegramBot", "ZaloPreview/1.0", "Twitterbot"):
        response = await admin.get("/s/preview-image", headers={"User-Agent": ua})
        assert response.status_code == 200, response.text
        tags = Tags(response.text).tags
        assert tags["og:image"] == tags["twitter:image"] == image
        assert tags["og:title"] == voucher["payload"]["name"]
        assert tags["og:url"].endswith("/s/preview-image")
        assert "Set-Cookie" not in response.headers
        assert "user-agent" in response.headers["vary"].lower()
        assert '"Camera" <hấp dẫn>' not in response.text
    # Social fetches never count as customer clicks or consume offers.
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT coalesce(sum(raw_clicks-bot_clicks),0) FROM private.link_daily"
            ).fetchone()[0]
            == 0
        )
    opened = await admin.get("/s/preview-image", follow_redirects=False)
    assert opened.status_code == 302 and opened.headers["location"] == "/?pf_offer=preview-image"
    # Older clients that omit the optional image must not erase a saved image.
    await admin.post(endpoint, json={"slug": "preview-image", "channel": "facebook"})
    response = await admin.get("/s/preview-image", headers={"User-Agent": "facebookexternalhit"})
    assert Tags(response.text).tags["og:image"] == image
    await admin.post(endpoint, json={"slug": "preview-image", "preview_image_url": ""})
    response = await admin.get("/s/preview-image", headers={"User-Agent": "facebookexternalhit"})
    assert Tags(response.text).tags["og:image"] != image
    for bad in (
        "javascript:alert(1)",
        "//evil.test/image.png",
        "https://user:password@example.test/a.png",
        "/admin/account",
        "https://example.test/a\n.png",
    ):
        result = await admin.post(
            endpoint, json={"slug": "preview-image", "preview_image_url": bad}
        )
        assert result.status_code == 422, result.text
    await admin.post(endpoint, json={"slug": "preview-image", "active": False})
    assert (
        await admin.get("/s/preview-image", headers={"User-Agent": "TelegramBot"})
    ).status_code == 404


async def test_preview_does_not_expose_unpublished_voucher_content(admin):
    voucher = (
        await admin.post(
            "/api/v1/admin/vouchers",
            json=campaign_body(name="DRAFT SECRET TITLE", terms="DRAFT SECRET TERMS"),
        )
    ).json()
    image = "/static/images/device-camera-3d.webp"
    result = await admin.post(
        "/api/v1/admin/vouchers/" + voucher["id"] + "/links",
        json={"slug": "draft-preview", "preview_image_url": image},
    )
    assert result.status_code == 201, result.text
    response = await admin.get("/s/draft-preview", headers={"User-Agent": "TelegramBot"})
    assert response.status_code == 200
    assert "DRAFT SECRET" not in response.text
    assert "http://test/static/images/device-camera-3d.webp" in response.text


async def test_voucher_link_social_meta_and_photo_mode(admin):
    voucher = await create(admin, name="Khuyến mại FPT 500k")
    endpoint = f"/api/v1/admin/vouchers/{voucher['id']}/links"
    image = "/static/images/device-camera-3d.webp"

    # 1. Custom title and domain
    r = await admin.post(
        endpoint,
        json={
            "slug": "custom-meta",
            "preview_image_url": image,
            "title": "TIÊU ĐỀ TÙY CHỈNH",
            "custom_domain": "fpt.vn",
            "hide_domain": False,
            "hide_title": False,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["title"] == "TIÊU ĐỀ TÙY CHỈNH"
    assert r.json()["custom_domain"] == "fpt.vn"

    resp = await admin.get("/s/custom-meta", headers={"User-Agent": "facebookexternalhit/1.1"})
    assert resp.status_code == 200
    tags = Tags(resp.text).tags
    assert tags["og:title"] == "TIÊU ĐỀ TÙY CHỈNH"
    assert tags["og:site_name"] == "fpt.vn"

    # 2. Photo mode (hide_title = True, hide_domain = True)
    r2 = await admin.post(
        endpoint,
        json={
            "slug": "photo-mode",
            "preview_image_url": image,
            "hide_title": True,
            "hide_domain": True,
        },
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["hide_title"] is True
    assert r2.json()["hide_domain"] is True

    resp2 = await admin.get("/s/photo-mode", headers={"User-Agent": "facebookexternalhit/1.1"})
    assert resp2.status_code == 200
    tags2 = Tags(resp2.text).tags
    assert tags2["og:title"] in ("", " ", "&#8203;", "\u200b")



async def test_preview_metadata_survives_redirect_without_a_recognized_crawler(admin, gateway):
    import psycopg

    from tests.integration.test_telecom_landing import body

    page = (await admin.post("/api/v1/admin/pages", json=body())).json()
    assert (
        await admin.post(
            "/api/v1/admin/pages/" + page["id"] + "/publish",
            json={"expected_version": page["version"]},
        )
    ).status_code == 200
    voucher = await create(admin)
    endpoint = "/api/v1/admin/vouchers/" + voucher["id"] + "/links"
    image = "https://media.example.test/social.webp"
    for target, slug in [("/", "generic-preview"), ("/qa-telecom", "landing-preview")]:
        assert (
            await admin.post(
                endpoint, json={"slug": slug, "target": target, "preview_image_url": image}
            )
        ).status_code == 201
        response = await admin.get(
            "/s/" + slug, headers={"User-Agent": "Zalo"}, follow_redirects=True
        )
        assert response.status_code == 200 and len(response.history) == 1
        assert 'property="og:image" content="' + image + '"' in response.text
        assert 'name="twitter:image" content="' + image + '"' in response.text
        assert 'property="og:url" content="http://test/s/' + slug + '"' in response.text
        # Rendering metadata again must not add a second click or create a session.
        with psycopg.connect(gateway.dsn) as db:
            before = db.execute(
                "SELECT coalesce(sum(raw_clicks),0) FROM private.link_daily"
            ).fetchone()[0]
        repeat = await admin.get(target + "?pf_offer=" + slug)
        assert repeat.status_code == 200 and image in repeat.text
        with psycopg.connect(gateway.dsn) as db:
            assert (
                db.execute("SELECT coalesce(sum(raw_clicks),0) FROM private.link_daily").fetchone()[
                    0
                ]
                == before
            )
    assert image not in (await admin.get("/do-toc-do?pf_offer=generic-preview")).text
    assert image not in (await admin.get("/admin/login?pf_offer=generic-preview")).text
    await admin.post(endpoint, json={"slug": "generic-preview", "active": False})
    assert image not in (await admin.get("/?pf_offer=generic-preview")).text


async def test_optional_share_metadata_failure_does_not_break_client_page(
    client, gateway, monkeypatch
):
    from pagefpt.core.errors import DomainError

    original = gateway.rpc

    async def failing(name, payload, actor_token=None):
        if payload.get("command", {}).get("op") == "voucher_link_metadata":
            raise DomainError("DATABASE_UNAVAILABLE", 503)
        return await original(name, payload, actor_token)

    monkeypatch.setattr(gateway, "rpc", failing)
    response = await client.get("/?pf_offer=valid-link")
    assert response.status_code == 200 and 'id="lead-intake-form"' in response.text
    assert 'property="og:image"' not in response.text
