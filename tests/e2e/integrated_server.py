"""Offline browser fixture: real SQL/cookies, only external Auth HTTP is simulated.

Run on loopback only. All identities, credentials, prices and leads are synthetic.
No test-specific endpoints or bypasses are added to the production application.
"""

import json
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import jwt
import psycopg
from cryptography.hazmat.primitives.asymmetric import ec
from psycopg.types.json import Jsonb

from tests.e2e.server import _dsn, app

SUBJECT = str(uuid4())
FACTOR = str(uuid4())
PLAN = str(uuid4())
_key = ec.generate_private_key(ec.SECP256R1())
_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(_key.public_key()))
_jwk.update(kid="browser-test", alg="ES256")
app.state.settings.supabase_url = "https://offline.supabase.test"
app.state.settings.supabase_auth_key = "sb_publishable_offline_fixture"
app.state.settings.supabase_secret = __import__("pydantic").SecretStr("sb_secret_offline_fixture")
app.state.settings.telegram_enabled = True
app.state.settings.telegram_bot_token = __import__("pydantic").SecretStr("123456789:" + "a" * 35)
app.state.settings.telegram_chat_id = "-999999"
app.state.settings.telegram_recovery_accounts = {"qa-admin@example.test": "123456789"}
app.state.verifier.url = app.state.settings.supabase_url
app.state.verifier.keys = {"browser-test": _jwk}
app.state.verifier.expires = time.monotonic() + 3600


def token(aal):
    return jwt.encode(
        {
            "sub": SUBJECT,
            "iss": "https://offline.supabase.test/auth/v1",
            "aud": "authenticated",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(hours=1),
            "aal": aal,
        },
        _key,
        algorithm="ES256",
        headers={"kid": "browser-test"},
    )


def auth_http(request):
    data = json.loads(request.content or b"{}")
    path = request.url.path
    if path.endswith("/admin/generate_link"):
        return httpx.Response(
            200,
            json={
                "id": SUBJECT,
                "email": "qa-admin@example.test",
                "hashed_token": "a" * 64,
            },
        )
    if path.endswith("/recover"):
        return httpx.Response(200, json={})
    if path.endswith("/verify") and "/factors/" not in path:
        if data.get("type") != "recovery" or not (
            data.get("token") == "654321" or data.get("token_hash") == "a" * 64
        ):
            return httpx.Response(400, json={"error_code": "otp_expired"})
        return httpx.Response(
            200,
            json={
                "access_token": token("aal1"),
                "user": {
                    "id": SUBJECT,
                    "factors": [{"id": FACTOR, "factor_type": "totp", "status": "verified"}],
                },
            },
        )
    if path.endswith("/user") and request.method == "PUT":
        if not data.get("password"):
            return httpx.Response(400, json={"error_code": "weak_password"})
        return httpx.Response(200, json={"id": SUBJECT})
    if path.endswith("/token"):
        if (
            data.get("email") != "qa-admin@example.test"
            or data.get("password") != "qa-only-password"
        ):
            return httpx.Response(400, json={"error_code": "invalid_credentials"})
        return httpx.Response(
            200,
            json={
                "access_token": token("aal1"),
                "refresh_token": "offline-refresh-only",
                "user": {
                    "id": SUBJECT,
                    "factors": [{"id": FACTOR, "factor_type": "totp", "status": "verified"}],
                },
            },
        )
    if path.endswith("/challenge"):
        return httpx.Response(200, json={"id": "offline-challenge"})
    if path.endswith("/verify"):
        if data != {"challenge_id": "offline-challenge", "code": "123456"}:
            return httpx.Response(400, json={"error_code": "invalid_code"})
        return httpx.Response(
            200,
            json={
                "access_token": token("aal2"),
                "refresh_token": "offline-refresh-only",
                "user": {"id": SUBJECT},
            },
        )
    if path.endswith("/logout"):
        return httpx.Response(204)
    raise AssertionError("Unexpected external Auth path")


with psycopg.connect(_dsn, autocommit=True) as connection:
    connection.execute(
        "INSERT INTO private.memberships(user_id,branch_id,permissions,capacity,shift) "
        "VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['*'],100,"
        '\'{"weekdays":[0,1,2,3,4,5,6],"start":"00:00","end":"23:59"}\')',
        [SUBJECT],
    )
    payload = {"name": "QA Synthetic Plan", "service": "internet", "code": "qa-synthetic"}
    connection.execute(
        "INSERT INTO private.resources(id,kind,status,payload,published_payload,published_version) "
        "VALUES(%s,'plan','published',%s,%s,1)",
        [PLAN, Jsonb(payload), Jsonb(payload)],
    )

_original_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(instance):
    await instance.state.auth.client.aclose()
    instance.state.auth.client = httpx.AsyncClient(transport=httpx.MockTransport(auth_http))
    # Exercise the normal lead boundary and atomic intake when preparing pagination.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=instance), base_url="http://offline-fixture"
    ) as client:
        for index in range(35):
            response = await client.post(
                "/api/v1/leads",
                headers={"Idempotency-Key": str(uuid4())},
                json={
                    "phone": f"090700{index:04d}",
                    "consent_version": "qa-synthetic-v1",
                    "plan_id": PLAN,
                },
            )
            assert response.status_code == 201, response.status_code
    async with _original_lifespan(instance):
        yield


app.router.lifespan_context = lifespan
