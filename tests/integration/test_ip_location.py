import pytest

EDGE = {
    "x-vercel-forwarded-for": "8.8.8.8",
    "x-vercel-ip-country": "VN",
    "x-vercel-ip-country-region": "SG",
    "x-vercel-ip-city": "Ho%20Chi%20Minh%20City",
}


@pytest.mark.asyncio
async def test_edge_suggestion_is_private_and_never_claims_a_ward(client):
    client._transport.app.state.settings.trusted_vercel_proxy = True
    response = await client.get("/api/v1/regions/location-suggestion", headers=EDGE)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "estimated"
    assert data["source"] == "vercel"
    assert data["province_name"] == "Thành phố Hồ Chí Minh"
    assert data["subdivision_code"] == "VN-SG"
    assert data["ward_id"] is None and data["address_confirmed"] is False
    assert "ip" not in data and "latitude" not in data
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.asyncio
@pytest.mark.parametrize("ip", ["garbage", "127.0.0.1", "10.0.0.1", ""])
async def test_missing_or_private_client_ip_cannot_be_used(client, ip):
    client._transport.app.state.settings.trusted_vercel_proxy = True
    response = await client.get(
        "/api/v1/regions/location-suggestion",
        headers={**EDGE, "x-vercel-forwarded-for": ip},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "unknown"
    assert response.json()["province_name"] is None


@pytest.mark.asyncio
async def test_direct_upstream_ignores_forged_location_and_query_ip(client):
    response = await client.get("/api/v1/regions/location-suggestion?ip=8.8.8.8", headers=EDGE)
    assert response.status_code == 200
    assert response.json()["status"] == "unknown"


@pytest.mark.asyncio
async def test_edge_country_is_not_overridden_by_city(client):
    client._transport.app.state.settings.trusted_vercel_proxy = True
    response = await client.get(
        "/api/v1/regions/location-suggestion",
        headers={**EDGE, "x-vercel-ip-country": "US"},
    )
    assert response.status_code == 200
    assert response.json()["province_name"] is None
    assert response.json()["country"] == "US"


@pytest.mark.asyncio
async def test_geoip_subdivision_fallback_without_edge_geo(client, monkeypatch):
    app = client._transport.app
    app.state.settings.trusted_vercel_proxy = True
    monkeypatch.setattr(
        app.state.geoip,
        "lookup",
        lambda ip: {
            "status": "inferred",
            "country": "VN",
            "province": "Đồng Nai",
            "city": "Biên Hòa",
            "accuracy_radius": 50,
        },
    )
    response = await client.get(
        "/api/v1/regions/location-suggestion",
        headers={"x-vercel-forwarded-for": "2001:4860:4860::8888"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "geoip" and data["province_name"] == "Đồng Nai"
    assert data["accuracy_radius_km"] == 50
    assert data["ward_id"] is None


@pytest.mark.asyncio
async def test_unmapped_iso_does_not_confuse_official_vietnam_codes(client):
    client._transport.app.state.settings.trusted_vercel_proxy = True
    response = await client.get(
        "/api/v1/regions/location-suggestion",
        headers={**EDGE, "x-vercel-ip-country-region": "79", "x-vercel-ip-city": ""},
    )
    assert response.status_code == 200
    assert response.json()["province_name"] is None


@pytest.mark.asyncio
async def test_hint_does_not_require_database_or_analytics_consent(client, monkeypatch):
    app = client._transport.app
    app.state.settings.trusted_vercel_proxy = True

    async def unavailable(*args, **kwargs):
        raise RuntimeError("Synthetic DB unavailable")

    monkeypatch.setattr(app.state.db, "rpc", unavailable)
    response = await client.get("/api/v1/regions/location-suggestion", headers=EDGE)
    assert response.status_code == 200
    assert response.json()["province_name"] == "Thành phố Hồ Chí Minh"


@pytest.mark.asyncio
async def test_published_hierarchy_includes_admin_location_aliases(admin):
    from tests.integration.test_regional_pricing import ZERO, resource

    row = await resource(
        admin,
        "regions",
        {
            "name": "Thành phố Hồ Chí Minh",
            "code": "vn2025-province-79",
            "branch_id": ZERO,
            "aliases": ["VN-SG", "Ho Chi Minh City"],
        },
    )
    tree = (await admin.get("/api/v1/regions/hierarchy")).json()
    province = next(p for z in tree.values() for p in z["provinces"] if p["code"] == row["id"])
    assert province["aliases"] == ["VN-SG", "Ho Chi Minh City"]
