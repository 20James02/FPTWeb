import httpx
import psycopg
import pytest
import respx


@pytest.fixture
async def auth_backend(admin):
    app = admin._transport.app
    app.state.settings.supabase_url = "https://test.supabase.co"
    app.state.settings.supabase_auth_key = "sb_publishable_test"
    return admin


@respx.mock
async def test_cookie_session_csrf_logout_and_no_token_exposure(auth_backend, gateway):
    client = auth_backend
    token = client.headers.pop("Authorization")[7:]
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": token,
                "refresh_token": "private-refresh-secret",
                "user": {"factors": []},
            },
        )
    )
    response = await client.post(
        "/api/v1/auth/session", json={"email": "admin@example.com", "password": "password"}
    )
    assert response.status_code == 200
    assert "access_token" not in response.text and "private-refresh-secret" not in response.text
    assert "HttpOnly" in response.headers.get_list("set-cookie")[0]
    assert (await client.get("/api/v1/admin/me")).status_code == 200
    assert (await client.delete("/api/v1/auth/session")).status_code == 403
    client.headers["X-CSRF-Token"] = client.cookies["pagefpt_csrf"]
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(204))
    assert (await client.delete("/api/v1/auth/session")).status_code == 200
    assert (await client.get("/api/v1/admin/me")).status_code == 401
    with psycopg.connect(gateway.dsn) as c:
        assert c.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0


@respx.mock
async def test_invalid_credentials_never_create_session(auth_backend):
    auth_backend.headers.pop("Authorization")
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(400, json={"error_code": "invalid_credentials"})
    )
    response = await auth_backend.post(
        "/api/v1/auth/session", json={"email": "admin@example.com", "password": "bad"}
    )
    assert response.status_code == 401
    assert not auth_backend.cookies


@respx.mock
async def test_mfa_required_before_session_created(auth_backend):
    token = auth_backend.headers.pop("Authorization")[7:]
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": token,
                "refresh_token": "refresh",
                "user": {
                    "factors": [
                        {
                            "id": "e69808c7-760e-4e1a-9a1b-bee4ea891443",
                            "factor_type": "totp",
                            "status": "verified",
                        }
                    ]
                },
            },
        )
    )
    r = await auth_backend.post(
        "/api/v1/auth/session", json={"email": "admin@example.com", "password": "password"}
    )
    assert r.status_code == 403 and r.json()["code"] == "MFA_REQUIRED"
    assert not auth_backend.cookies


@respx.mock
async def test_refresh_has_single_database_lease(auth_backend, gateway):
    import asyncio

    token = auth_backend.headers.pop("Authorization")[7:]
    pair = {"access_token": token, "refresh_token": "rotating-refresh", "user": {"factors": []}}
    route = respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json=pair)
    )
    assert (
        await auth_backend.post(
            "/api/v1/auth/session", json={"email": "admin@example.com", "password": "password"}
        )
    ).status_code == 200
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        c.execute("UPDATE private.admin_sessions SET access_expires_at=now()-interval '1 minute'")

    async def delayed(request):
        await asyncio.sleep(0.1)
        return httpx.Response(200, json={**pair, "refresh_token": "new-rotated-refresh"})

    route.mock(side_effect=delayed)
    results = await asyncio.gather(
        auth_backend.get("/api/v1/admin/me"), auth_backend.get("/api/v1/admin/me")
    )
    assert sorted(r.status_code for r in results) == [200, 503]
    assert route.call_count == 2  # login + one refresh
    assert (await auth_backend.get("/api/v1/admin/me")).status_code == 200
    with psycopg.connect(gateway.dsn) as c:
        row = c.execute(
            "SELECT version,tokens_ciphertext,refresh_lease FROM private.admin_sessions"
        ).fetchone()
        assert row[0] == 2 and "new-rotated-refresh" not in row[1] and row[2] is None


@respx.mock
async def test_mfa_verified_aal2_and_cross_origin_rejected(auth_backend):
    token = auth_backend.headers.pop("Authorization")[7:]
    fid = "e69808c7-760e-4e1a-9a1b-bee4ea891443"
    pair = {
        "access_token": token,
        "refresh_token": "refresh",
        "user": {"factors": [{"id": fid, "factor_type": "totp", "status": "verified"}]},
    }
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json=pair)
    )
    respx.post(f"https://test.supabase.co/auth/v1/factors/{fid}/challenge").mock(
        return_value=httpx.Response(200, json={"id": "challenge"})
    )
    respx.post(f"https://test.supabase.co/auth/v1/factors/{fid}/verify").mock(
        return_value=httpx.Response(200, json=pair)
    )
    payload = {"email": "admin@example.com", "password": "password", "otp": "123456"}
    assert (
        await auth_backend.post(
            "/api/v1/auth/session", json=payload, headers={"Origin": "https://evil.example"}
        )
    ).status_code == 403
    assert (await auth_backend.post("/api/v1/auth/session", json=payload)).json()["aal"] == "aal2"
