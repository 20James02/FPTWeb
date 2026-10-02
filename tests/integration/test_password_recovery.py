"""Recovery operates through provider proof, never through an admin bypass."""

import json

import httpx
import psycopg
import pytest
import respx


@pytest.fixture
async def recovery_backend(admin):
    app = admin._transport.app
    app.state.settings.supabase_url = "https://test.supabase.co"
    app.state.settings.supabase_auth_key = "sb_publishable_test"
    token = admin.headers.pop("Authorization")[7:]
    return admin, token


PAYLOAD = {
    "email": "admin@example.com",
    "otp": "123456",
    "password": "QA-new-password-123",
    "totp": "",
}


@respx.mock
async def test_recovery_request_waits_for_provider_and_does_not_enumerate(recovery_backend):
    client, _ = recovery_backend

    def provider(request):
        assert json.loads(request.content) == {"email": "missing@example.com"}
        return httpx.Response(200, json={})

    respx.post("https://test.supabase.co/auth/v1/recover").mock(side_effect=provider)
    result = await client.post("/api/v1/auth/recovery", json={"email": "missing@example.com"})
    assert result.status_code == 202
    assert result.json() == {"accepted": True}
    assert not client.cookies


@respx.mock
async def test_recovery_reset_changes_password_and_revokes_local_sessions(
    recovery_backend, gateway
):
    client, token = recovery_backend
    pair = {
        "access_token": token,
        "refresh_token": "private-provider-refresh",
        "user": {"factors": []},
    }
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json=pair)
    )
    assert (
        await client.post(
            "/api/v1/auth/session", json={"email": PAYLOAD["email"], "password": "old"}
        )
    ).status_code == 200

    def verified(request):
        assert json.loads(request.content) == {
            "email": PAYLOAD["email"],
            "token": PAYLOAD["otp"],
            "type": "recovery",
        }
        return httpx.Response(200, json=pair)

    def updated(request):
        assert request.headers["Authorization"] == "Bearer " + token
        assert json.loads(request.content) == {"password": PAYLOAD["password"]}
        import jwt

        return httpx.Response(
            200, json={"id": jwt.decode(token, options={"verify_signature": False})["sub"]}
        )

    respx.post("https://test.supabase.co/auth/v1/verify").mock(side_effect=verified)
    respx.put("https://test.supabase.co/auth/v1/user").mock(side_effect=updated)
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(204))
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 200
    assert result.json()["changed"] is True
    assert token not in result.text and PAYLOAD["password"] not in result.text
    assert (await client.get("/api/v1/admin/me")).status_code == 401
    with psycopg.connect(gateway.dsn) as connection:
        assert connection.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0
        assert (
            connection.execute(
                "SELECT count(*) FROM private.audit WHERE action='auth.password_recovered'"
            ).fetchone()[0]
            == 1
        )


@respx.mock
@pytest.mark.parametrize("provider_status,expected", [(400, 401), (429, 429), (500, 503)])
async def test_recovery_invalid_expired_or_limited_code_never_changes_password(
    recovery_backend, provider_status, expected
):
    client, _ = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(provider_status, json={"error_code": "otp_expired"})
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == expected
    assert not result.json().get("changed")
    assert not client.cookies


@respx.mock
async def test_recovery_mfa_required_without_password_write(recovery_backend):
    client, token = recovery_backend
    pair = {
        "access_token": token,
        "user": {
            "factors": [
                {
                    "id": "e69808c7-760e-4e1a-9a1b-bee4ea891443",
                    "factor_type": "totp",
                    "status": "verified",
                }
            ]
        },
    }
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 403 and result.json()["code"] == "MFA_REQUIRED"


@respx.mock
async def test_recovery_cross_origin_and_bad_input_rejected(recovery_backend):
    client, _ = recovery_backend
    assert (
        await client.post(
            "/api/v1/auth/recovery",
            json={"email": PAYLOAD["email"]},
            headers={"Origin": "https://evil.example"},
        )
    ).status_code == 403
    assert (
        await client.post("/api/v1/auth/recovery/reset", json={**PAYLOAD, "otp": "abcdef"})
    ).status_code == 422
    assert (
        await client.post("/api/v1/auth/recovery/reset", json={**PAYLOAD, "password": "short"})
    ).status_code == 422


@respx.mock
async def test_recovery_revoked_member_cannot_change_password(recovery_backend, gateway):
    client, token = recovery_backend
    with psycopg.connect(gateway.dsn, autocommit=True) as connection:
        connection.execute("UPDATE private.memberships SET active=false")
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json={"access_token": token, "user": {"factors": []}})
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 403


def provider_pair(token, mfa=False):
    factors = (
        [
            {
                "id": "e69808c7-760e-4e1a-9a1b-bee4ea891443",
                "factor_type": "totp",
                "status": "verified",
            }
        ]
        if mfa
        else []
    )
    return {"access_token": token, "user": {"factors": factors}}


def provider_user(token):
    import jwt

    return {"id": jwt.decode(token, options={"verify_signature": False})["sub"]}


@respx.mock
@pytest.mark.parametrize("code,expected", [("123456", 200), ("654321", 401)])
async def test_recovery_verifies_totp_before_writing_password(recovery_backend, code, expected):
    client, token = recovery_backend
    pair = provider_pair(token, mfa=True)
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    factor = "https://test.supabase.co/auth/v1/factors/e69808c7-760e-4e1a-9a1b-bee4ea891443"
    respx.post(factor + "/challenge").mock(
        return_value=httpx.Response(200, json={"id": "challenge"})
    )

    def verified(request):
        assert json.loads(request.content) == {"challenge_id": "challenge", "code": code}
        return (
            httpx.Response(200, json=pair)
            if code == "123456"
            else httpx.Response(400, json={"error_code": "invalid_code"})
        )

    respx.post(factor + "/verify").mock(side_effect=verified)
    update = respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json=provider_user(token))
    )
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(204))
    result = await client.post("/api/v1/auth/recovery/reset", json={**PAYLOAD, "totp": code})
    assert result.status_code == expected
    assert update.call_count == (1 if expected == 200 else 0)
    assert bool(result.json().get("changed")) == (expected == 200)


@respx.mock
async def test_recovery_requires_elevated_aal_after_mfa(recovery_backend, monkeypatch):
    client, token = recovery_backend
    verifier = client._transport.app.state.verifier
    original = verifier.verify

    async def low_aal(value):
        return {**await original(value), "aal": "aal1"}

    monkeypatch.setattr(verifier, "verify", low_aal)
    pair = provider_pair(token, mfa=True)
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    factor = "https://test.supabase.co/auth/v1/factors/e69808c7-760e-4e1a-9a1b-bee4ea891443"
    respx.post(factor + "/challenge").mock(
        return_value=httpx.Response(200, json={"id": "challenge"})
    )
    respx.post(factor + "/verify").mock(return_value=httpx.Response(200, json=pair))
    result = await client.post("/api/v1/auth/recovery/reset", json={**PAYLOAD, "totp": "123456"})
    assert result.status_code == 403 and result.json()["code"] == "MFA_REQUIRED"


@respx.mock
@pytest.mark.parametrize("error", ["weak_password", "same_password", "password_too_short"])
async def test_recovery_password_policy_failure_never_reports_success(
    recovery_backend, gateway, error
):
    client, token = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=provider_pair(token))
    )
    respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(422, json={"error_code": error})
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 422 and result.json()["code"] == "PASSWORD_REJECTED"
    with psycopg.connect(gateway.dsn) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM private.audit WHERE action='auth.password_recovered'"
            ).fetchone()[0]
            == 0
        )


@respx.mock
@pytest.mark.parametrize(
    "pair", [{}, [], {"access_token": 123, "user": {}}, {"user": None}, {"user": {"factors": None}}]
)
async def test_recovery_malformed_verify_payload_never_writes_password(recovery_backend, pair):
    client, _ = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 503 and not result.json().get("changed")


@respx.mock
@pytest.mark.parametrize("user", [{}, [], {"id": "wrong-subject"}])
async def test_recovery_malformed_password_update_does_not_claim_completion(recovery_backend, user):
    client, token = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=provider_pair(token))
    )
    respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json=user)
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 503 and not result.json().get("changed")


@respx.mock
async def test_recovery_provider_timeout_does_not_advance_success(recovery_backend):
    client, _ = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/recover").mock(
        side_effect=httpx.ReadTimeout("provider deadline")
    )
    result = await client.post("/api/v1/auth/recovery", json={"email": PAYLOAD["email"]})
    assert result.status_code == 503 and not result.json().get("accepted")


@respx.mock
async def test_recovery_provider_rejects_used_email_code(recovery_backend):
    client, token = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        side_effect=[
            httpx.Response(200, json=provider_pair(token)),
            httpx.Response(400, json={"error_code": "otp_expired"}),
        ]
    )
    update = respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json=provider_user(token))
    )
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(204))
    assert (await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)).status_code == 200
    second = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert second.status_code == 401 and update.call_count == 1


@respx.mock
@pytest.mark.parametrize(
    "factors", [None, {}, [None], [{"status": "verified", "factor_type": "totp", "id": "bad-uuid"}]]
)
async def test_recovery_malformed_mfa_metadata_fails_closed(recovery_backend, factors):
    client, token = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json={"access_token": token, "user": {"factors": factors}})
    )
    result = await client.post("/api/v1/auth/recovery/reset", json={**PAYLOAD, "totp": "123456"})
    assert result.status_code == 503 and not result.json().get("changed")


@respx.mock
async def test_recovery_malformed_error_response_fails_closed(recovery_backend):
    client, token = recovery_backend
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=provider_pair(token))
    )
    respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(422, json=[])
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 503


@respx.mock
@pytest.mark.parametrize(
    "failed_operation,update_count",
    [("auth_recovery_revoke_sessions", 0), ("auth_recovery_complete", 1)],
)
async def test_recovery_database_failure_never_leaves_changed_password_with_live_sessions(
    recovery_backend, gateway, monkeypatch, failed_operation, update_count
):
    from pagefpt.core.errors import DomainError

    client, token = recovery_backend
    pair = provider_pair(token)
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json={**pair, "refresh_token": "private-refresh"})
    )
    assert (
        await client.post(
            "/api/v1/auth/session", json={"email": PAYLOAD["email"], "password": "old"}
        )
    ).status_code == 200
    original = gateway.rpc

    async def failing(name, payload, actor_token=None):
        if payload.get("command", payload).get("op") == failed_operation:
            raise DomainError("DATABASE_UNAVAILABLE", 503)
        return await original(name, payload, actor_token)

    monkeypatch.setattr(gateway, "rpc", failing)
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    update = respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json=provider_user(token))
    )
    logout = respx.post("https://test.supabase.co/auth/v1/logout").mock(
        return_value=httpx.Response(204)
    )
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 503 and update.call_count == update_count
    if update_count:
        assert logout.call_count == 1
        assert (await client.get("/api/v1/admin/me")).status_code == 401
        with psycopg.connect(gateway.dsn) as connection:
            assert (
                connection.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0
            )


@respx.mock
async def test_recovery_provider_logout_failure_still_revokes_all_bff_sessions(
    recovery_backend, gateway
):
    client, token = recovery_backend
    pair = provider_pair(token)
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json={**pair, "refresh_token": "private-refresh"})
    )
    assert (
        await client.post(
            "/api/v1/auth/session", json={"email": PAYLOAD["email"], "password": "old"}
        )
    ).status_code == 200
    respx.post("https://test.supabase.co/auth/v1/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json=provider_user(token))
    )
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(503))
    result = await client.post("/api/v1/auth/recovery/reset", json=PAYLOAD)
    assert result.status_code == 200 and result.json() == {
        "changed": True,
        "provider_revoked": False,
    }
    assert (await client.get("/api/v1/admin/me")).status_code == 401
