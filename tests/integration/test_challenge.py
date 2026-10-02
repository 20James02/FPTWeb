from uuid import uuid4

import httpx
import pytest
import respx
from pydantic import SecretStr


@pytest.mark.asyncio
async def test_challenge_verified_bound_and_single_use(client):
    app = client._transport.app
    app.state.settings.turnstile_secret = SecretStr("challenge-secret")
    app.state.settings.turnstile_hostnames = ["test.example"]
    session = (
        await client.post(
            "/api/v1/sessions",
            json={"analytics": False, "marketing": False, "consent_version": "v1"},
        )
    ).json()["session_token"]
    body = {
        "phone": "0901234567",
        "consent_version": "v1",
        "session_token": session,
        "website": "bot-field",
    }
    key = str(uuid4())
    initial = await client.post("/api/v1/leads", json=body, headers={"Idempotency-Key": key})
    assert initial.status_code == 403
    with respx.mock() as mock:
        mock.post("https://challenges.cloudflare.com/turnstile/v0/siteverify").mock(
            return_value=httpx.Response(
                200, json={"success": True, "hostname": "test.example", "action": "lead"}
            )
        )
        verify = await client.post(
            "/api/v1/leads/challenges/verify",
            json={
                "session_token": session,
                "phone": body["phone"],
                "provider_token": "verified-token",
            },
        )
    assert verify.status_code == 200, verify.text
    token = verify.json()["challenge_token"]
    retry = await client.post(
        "/api/v1/leads", json={**body, "challenge_token": token}, headers={"Idempotency-Key": key}
    )
    assert retry.status_code == 201, retry.text
    replay = await client.post(
        "/api/v1/leads", json={**body, "challenge_token": token}, headers={"Idempotency-Key": key}
    )
    assert replay.status_code == 200
    stolen = await client.post(
        "/api/v1/leads",
        json={**body, "challenge_token": token},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert stolen.status_code == 403
