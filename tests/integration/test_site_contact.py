from html.parser import HTMLParser

import pytest


class ContactLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.calls = []

    def handle_starttag(self, tag, attrs):
        href = dict(attrs).get("href", "")
        if tag == "a" and href.startswith("tel:"):
            self.calls.append(href)


async def test_contact_change_persists_and_updates_calls_on_every_public_page(admin):
    current = (await admin.get("/api/v1/system/display-settings")).json()
    saved = await admin.post(
        "/api/v1/system/display-settings",
        json={"expected_version": current["version"], "contact_phone": "+84 912.345.678"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["settings"]["contact_phone"] == "0912345678"
    assert (await admin.get("/api/v1/system/display-settings")).json()["contact_phone"] == (
        "0912345678"
    )
    for path in ("/", "/san-pham/internet-gia-dinh", "/khuyen-mai"):
        rendered = await admin.get(path)
        assert rendered.status_code == 200
        links = ContactLinks()
        links.feed(rendered.text)
        assert links.calls and set(links.calls) == {"tel:0912345678"}
        assert "0912.345.678" in rendered.text


@pytest.mark.parametrize(
    "value", ["", "abc", "0868247625,123", "javascript:alert(1)", "0868247625\n", "123"]
)
async def test_invalid_contact_cannot_change_the_persisted_dial_target(admin, value):
    current = (await admin.get("/api/v1/system/display-settings")).json()
    rejected = await admin.post(
        "/api/v1/system/display-settings",
        json={"expected_version": current["version"], "contact_phone": value},
    )
    assert rejected.status_code == 422
    assert (await admin.get("/api/v1/system/display-settings")).json() == current


async def test_privacy_link_opens_a_readable_data_notice_instead_of_the_sales_home(client):
    response = await client.get("/chinh-sach-bao-mat")
    assert response.status_code == 200
    assert "<h1>Thông tin về dữ liệu khách hàng</h1>" in response.text
    assert 'id="plans-section"' not in response.text
