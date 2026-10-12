from uuid import uuid4

import httpx
import pytest


def body(**landing):
    return {
        "title": "QA Telecom",
        "slug": "qa-telecom",
        "blocks": [],
        "template": "telecom",
        "landing": {"hero_title": "QA hero", **landing},
    }


async def test_telecom_preview_and_published_render_share_template(admin, client):
    row = await admin.post("/api/v1/admin/pages", json=body())
    assert row.status_code == 201, row.text
    row = row.json()
    draft = await admin.get(f"/admin/pages/{row['id']}/preview")
    assert draft.status_code == 200 and "lp-hero" in draft.text and "QA hero" in draft.text
    assert 'data-landing-preview="true"' in draft.text
    assert '"preview": true' in draft.text
    live = await client.get("/qa-telecom")
    assert live.status_code == 404
    assert (
        await admin.post(
            f"/api/v1/admin/pages/{row['id']}/publish", json={"expected_version": row["version"]}
        )
    ).status_code == 200
    live = await client.get("/qa-telecom")
    assert live.status_code == 200 and "lp-hero" in live.text
    assert "1900 6600" not in live.text and "1.200.000" not in live.text
    assert 'data-landing-preview="false"' in live.text
    assert '"consent_mode": "advanced"' in live.text
    assert '"preview": false' in live.text
    assert (await admin.get("/admin/landing-pages")).status_code == 200


async def test_unsaved_preview_is_guarded_and_does_not_save(admin, client):
    async with httpx.AsyncClient(transport=client._transport, base_url="http://test") as guest:
        assert (await guest.post("/api/v1/admin/landing-preview", json=body())).status_code == 401
    response = await admin.post("/api/v1/admin/landing-preview", json=body())
    assert response.status_code == 200, response.text
    assert "QA hero" in response.text and "noindex" in response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert (await client.get("/qa-telecom")).status_code == 404


@pytest.mark.parametrize(
    "settings",
    [
        {"plan_ids": [str(uuid4())] * 2},
        {"nav_items": [{"label": "Bad", "href": "javascript:alert(1)"}]},
        {"desktop_columns": 12},
        {"billing_months": 3},
        {"hero_image_url": "https://evil.test/x"},
        {"reviews": [{"name": "QA", "quote": "QA", "rating": 7}]},
    ],
)
async def test_landing_rejects_invalid_configuration(admin, settings):
    assert (await admin.post("/api/v1/admin/pages", json=body(**settings))).status_code == 422


async def test_landing_selected_plans_and_media_ready_guard(admin, gateway):
    from tests.integration.test_client_release_images import ready_asset

    admin._transport.app.state.settings.media_domain = "https://media.example.test"
    created = []
    for n in range(4):
        row = (
            await admin.post(
                "/api/v1/admin/plans",
                json={
                    "name": f"LP Plan {n}",
                    "code": f"lp-{n}",
                    "service": "internet",
                    "speed_mbps": 300,
                },
            )
        ).json()
        await admin.post(
            f"/api/v1/admin/plans/{row['id']}/publish", json={"expected_version": row["version"]}
        )
        created.append(row["id"])
    image = ready_asset(gateway)
    response = await admin.post(
        "/api/v1/admin/landing-preview",
        json=body(
            plan_ids=created[:3], hero_image_id=image, hero_title="<script>alert(1)</script>Safe"
        ),
    )
    assert response.status_code == 200, response.text
    assert response.text.count('class="lp-plan-card') == 3
    assert 'data-plan-name="LP Plan 3"' not in response.text
    assert "media.example.test/images/" in response.text
    assert "<script>alert(1)</script>" not in response.text
    bad = ready_asset(gateway, "pending")
    assert (
        await admin.post("/api/v1/admin/pages", json=body(hero_image_id=bad))
    ).status_code == 422


@pytest.mark.parametrize(
    "contact, expected",
    [
        ({}, "https://zalo.me/0868247625"),
        ({"contact_phone": "0912345678"}, "https://zalo.me/0912345678"),
        (
            {"contact_phone": "0912345678", "zalo_url": "https://zalo.me/custom-contact"},
            "https://zalo.me/custom-contact",
        ),
    ],
)
async def test_landing_zalo_follows_contact_and_keeps_admin_override(admin, contact, expected):
    from html.parser import HTMLParser

    class ZaloLinks(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links = []

        def handle_starttag(self, tag, attrs):
            attributes = dict(attrs)
            if tag == "a" and attributes.get("href", "").startswith("https://zalo.me/"):
                self.links.append(attributes)

    response = await admin.post("/api/v1/admin/landing-preview", json=body(**contact))
    assert response.status_code == 200, response.text
    links = ZaloLinks()
    links.feed(response.text)
    assert len(links.links) == 4  # Footer, popup, mobile bar, receipt.
    assert all(link["href"] == expected for link in links.links)
    assert all(
        link.get("target") == "_blank" and "noopener" in link.get("rel", "") for link in links.links
    )


async def test_two_landings_keep_independent_contact_settings(admin, client):
    pages = [
        ("qa-contact-a", "0912345678", "https://zalo.me/contact-a", "https://m.me/contact-a"),
        ("qa-contact-b", "0981234567", "https://zalo.me/contact-b", "https://m.me/contact-b"),
    ]
    for slug, phone, zalo, messenger in pages:
        data = body(contact_phone=phone, zalo_url=zalo, messenger_url=messenger)
        data["slug"] = slug
        row = (await admin.post("/api/v1/admin/pages", json=data)).json()
        published = await admin.post(
            f"/api/v1/admin/pages/{row['id']}/publish", json={"expected_version": row["version"]}
        )
        assert published.status_code == 200, published.text
    for slug, phone, zalo, messenger in pages:
        response = await client.get("/" + slug)
        assert response.status_code == 200
        assert f'href="tel:{phone}"' in response.text
        assert response.text.count(f'href="{zalo}"') == 4
        assert f'href="{messenger}"' in response.text
        other = next(item for item in pages if item[0] != slug)
        assert other[2] not in response.text and other[3] not in response.text
    homepage = (await client.get("/")).text
    assert 'href="https://zalo.me/0868247625"' in homepage
    assert all(item[2] not in homepage for item in pages)
