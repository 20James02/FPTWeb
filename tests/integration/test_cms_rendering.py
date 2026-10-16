from xml.etree import ElementTree

import httpx
import pytest

from pagefpt.web.service_pages import SERVICE_PAGES


async def test_sitemap_includes_static_pages_and_uses_configured_origin(client):
    client._transport.app.state.settings.public_origin = "https://public.example.test/"
    response = await client.get("/sitemap.xml")
    assert response.status_code == 200
    locations = [node.text for node in ElementTree.fromstring(response.text).iter("{*}loc")]
    # ElementTree's iter does not expand wildcard namespaces.
    locations = [
        node.text for node in ElementTree.fromstring(response.text).findall("{*}url/{*}loc")
    ]
    expected_paths = {"/", "/khuyen-mai", "/do-toc-do", "/chinh-sach-bao-mat"} | {
        "/san-pham/" + slug for slug in SERVICE_PAGES
    }
    assert set(locations) == {"https://public.example.test" + path for path in expected_paths}
    assert len(locations) == len(expected_paths)
    for path in expected_paths:
        assert (await client.get(path)).status_code == 200
    robots = await client.get("/robots.txt")
    assert "Sitemap: https://public.example.test/sitemap.xml" in robots.text
    assert "Disallow: /admin" in robots.text and "Disallow: /api/" in robots.text


async def page(admin, slug="qa-landing"):
    r = await admin.post(
        "/api/v1/admin/pages",
        json={
            "title": "QA CMS",
            "slug": slug,
            "description": "QA description",
            "blocks": [
                {"type": "heading", "text": "QA heading"},
                {"type": "text", "text": "<script>evil()</script> Safe"},
                {"type": "cta", "text": "Nhận tư vấn", "url": "/#plans-section"},
                {"type": "pricing"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_published_cms_page_has_html_canonical_and_preview_auth(admin, client):
    row = await page(admin)
    assert (await client.get("/qa-landing")).status_code == 404
    preview = await admin.get("/admin/pages/" + row["id"] + "/preview")
    assert preview.status_code == 200 and "noindex" in preview.text
    async with httpx.AsyncClient(transport=client._transport, base_url="http://test") as guest:
        assert (await guest.get("/admin/pages/" + row["id"] + "/preview")).status_code in {303, 401}
    r = await admin.post(
        "/api/v1/admin/pages/" + row["id"] + "/publish", json={"expected_version": row["version"]}
    )
    assert r.status_code == 200, r.text
    html = await client.get("/qa-landing")
    assert html.status_code == 200
    assert "QA heading" in html.text and "<script>evil()" not in html.text
    assert 'rel="canonical"' in html.text and "/qa-landing" in html.text
    assert "/qa-landing" in (await client.get("/sitemap.xml")).text
    assert (await client.get("/no-such-page")).status_code == 404


@pytest.mark.parametrize(
    "slug", ["do-toc-do", "khuyen-mai", "chinh-sach-bao-mat", "static", "san-pham"]
)
async def test_static_slugs_reserved(admin, slug):
    r = await admin.post("/api/v1/admin/pages", json={"title": "QA", "slug": slug, "blocks": []})
    assert r.status_code == 422


async def test_duplicate_slug_and_cross_path_canonical_rejected(admin):
    await page(admin)
    r = await admin.post(
        "/api/v1/admin/pages", json={"title": "QA duplicate", "slug": "qa-landing", "blocks": []}
    )
    assert r.status_code == 409, r.text
    r = await admin.post(
        "/api/v1/admin/pages",
        json={"title": "QA", "slug": "qa-other", "canonical_path": "/unrelated", "blocks": []},
    )
    assert r.status_code == 422


async def test_cms_media_block_resolves_ready_asset_and_rejects_unready(admin, gateway):
    from tests.integration.test_client_release_images import ready_asset

    admin._transport.app.state.settings.media_domain = "https://media.example.test"
    asset = ready_asset(gateway)
    body = {
        "title": "QA image",
        "slug": "qa-image-page",
        "blocks": [{"type": "image", "media_id": asset, "text": "QA illustration"}],
    }
    row = (await admin.post("/api/v1/admin/pages", json=body)).json()
    assert (
        await admin.post(
            "/api/v1/admin/pages/" + row["id"] + "/publish",
            json={"expected_version": row["version"]},
        )
    ).status_code == 200
    html = (await admin.get("/qa-image-page")).text
    assert "https://media.example.test/images/" in html
    unready = ready_asset(gateway, "pending")
    bad = await admin.post(
        "/api/v1/admin/pages",
        json={**body, "slug": "qa-bad-image", "blocks": [{"type": "image", "media_id": unready}]},
    )
    assert bad.status_code == 422
