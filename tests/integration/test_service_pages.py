import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("slug", "service", "heading"),
    [
        ("internet-gia-dinh", "internet", "Internet Gia Đình"),
        ("internet-doanh-nghiep", "business", "Internet Doanh Nghiệp"),
        ("fpt-play", "play", "FPT Play"),
        ("combo-fpt-play", "combo", "Combo Internet &amp; FPT Play"),
        ("camera-fpt", "camera", "FPT Camera"),
    ],
)
async def test_service_page_empty_catalog_keeps_intake_context(client, slug, service, heading):
    response = await client.get(f"/san-pham/{slug}")
    assert response.status_code == 200
    assert heading in response.text
    assert f'data-consult-service="{service}"' in response.text
    assert 'id="home-province-select"' in response.text
    assert "Chưa có gói được công bố" in response.text
    assert 'data-service-plan="' not in response.text


@pytest.mark.asyncio
async def test_service_page_catalog_contains_only_its_service(admin):
    rows = []
    for service in ("internet", "combo", "camera", "business", "play"):
        created = await admin.post(
            "/api/v1/admin/plans",
            json={"name": f"QA service {service}", "code": f"qa-{service}", "service": service},
        )
        assert created.status_code == 201
        row = created.json()
        published = await admin.post(
            f"/api/v1/admin/plans/{row['id']}/publish",
            json={"expected_version": row["version"]},
        )
        assert published.status_code == 200
        rows.append((service, row["id"]))
    response = await admin.get("/san-pham/camera-fpt")
    for service, plan_id in rows:
        marker = f'data-service-plan="{plan_id}"'
        assert (marker in response.text) == (service == "camera")
    # Serialized catalog can include other services for the shared intake, but
    # generic service consultation must not silently choose the first plan.
    assert 'data-consult-service="camera"' in response.text
    assert "Giá theo địa bàn" in response.text


@pytest.mark.asyncio
async def test_unknown_service_does_not_impersonate_internet_page(client):
    response = await client.get("/san-pham/khong-ton-tai")
    assert response.status_code == 404
