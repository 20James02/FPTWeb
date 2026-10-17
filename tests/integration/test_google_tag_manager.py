import re

import pytest

from tests.integration.test_telecom_landing import body

CONTAINER = "GTM-55F7ZTBZ"


def assert_installed(html):
    head = html.split("</head>", 1)[0]
    assert CONTAINER in head
    assert head.index('"analytics_storage": "denied"') < head.index("gtm.start")
    assert head.count("gtm.start") == 1
    assert "google_analytics.js" in head
    after_body = re.split(r"<body[^>]*>", html, maxsplit=1)[1].lstrip()
    assert after_body.startswith("<!-- Google Tag Manager (noscript) -->")
    assert after_body.count("https://www.googletagmanager.com/ns.html?id=" + CONTAINER) == 1


@pytest.mark.parametrize(
    "path", ["/", "/do-toc-do", "/san-pham/internet-gia-dinh", "/chinh-sach-bao-mat"]
)
async def test_public_pages_install_gtm_without_replacing_ga4(client, path):
    response = await client.get(path)
    assert response.status_code == 200
    assert_installed(response.text)


@pytest.mark.parametrize("template", ["telecom", "standard"])
async def test_gtm_covers_published_landings_but_excludes_previews(admin, client, template):
    payload = body()
    if template == "standard":
        payload.pop("template")
        payload.pop("landing")
    created = await admin.post("/api/v1/admin/pages", json=payload)
    assert created.status_code == 201, created.text
    row = created.json()
    preview = await admin.get(f"/admin/pages/{row['id']}/preview")
    assert preview.status_code == 200
    assert CONTAINER not in preview.text
    published = await admin.post(
        f"/api/v1/admin/pages/{row['id']}/publish", json={"expected_version": row["version"]}
    )
    assert published.status_code == 200
    live = await client.get("/qa-telecom")
    assert live.status_code == 200
    assert_installed(live.text)


async def test_gtm_is_absent_from_admin_and_unsaved_preview(admin, client):
    for path in ["/admin/login", "/admin/measurement"]:
        response = await admin.get(path)
        assert response.status_code == 200
        assert CONTAINER not in response.text
    preview = await admin.post("/api/v1/admin/landing-preview", json=body())
    assert preview.status_code == 200
    assert CONTAINER not in preview.text
