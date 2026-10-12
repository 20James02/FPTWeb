"""Domain migration must keep only configured origins usable for admin recovery."""

import pytest
from pydantic import SecretStr


@pytest.fixture
async def domain_client(client):
    s = client._transport.app.state.settings
    s.environment = "staging"
    s.public_origin = "https://fpt-vungtau.com"
    s.allowed_origins = [
        "https://fpt-vungtau.com",
        "https://www.fpt-vungtau.com",
        "https://fpt-web-ten.vercel.app",
    ]
    s.telegram_enabled = True
    s.telegram_bot_token = SecretStr("123456789:" + "a" * 35)
    s.telegram_recovery_accounts = {"bound@example.test": "123456789"}
    return client


@pytest.mark.parametrize(
    "origin",
    ["https://fpt-vungtau.com", "https://www.fpt-vungtau.com", "https://fpt-web-ten.vercel.app"],
)
async def test_configured_site_alias_can_request_recovery(domain_client, origin):
    r = await domain_client.post(
        "/api/v1/auth/recovery",
        json={"email": "unbound@example.test"},
        headers={"Origin": origin, "Sec-Fetch-Site": "same-origin"},
    )
    assert r.status_code == 202
    assert r.json()["accepted"] is True


@pytest.mark.parametrize(
    "origin,site",
    [
        ("https://evil.example", "same-origin"),
        ("https://fpt-vungtau.com.evil.example", "same-origin"),
        ("http://fpt-vungtau.com", "same-origin"),
        ("https://fpt-vungtau.com", "cross-site"),
        ("https://www.fpt-vungtau.com", "cross-site"),
    ],
)
async def test_untrusted_or_cross_site_request_cannot_use_alias_configuration(
    domain_client, origin, site
):
    r = await domain_client.post(
        "/api/v1/auth/recovery",
        json={"email": "unbound@example.test"},
        headers={"Origin": origin, "Sec-Fetch-Site": site},
    )
    assert r.status_code == 403 and r.json()["code"] == "CSRF_FAILED"
