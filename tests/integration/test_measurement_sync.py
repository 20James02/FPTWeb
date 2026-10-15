from urllib.parse import parse_qs, urlparse

import httpx
import respx

from tests.integration.test_measurement_registry import connection


@respx.mock
async def test_connection_check_requires_real_provider_match(admin):
    c = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                settings={"measurement_id": "G-QA123", "property_id": "123", "stream_id": "456"}
            ),
        )
    ).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={"expected_version": 1, "values": {"access_token": "synthetic-access"}},
    )
    respx.get("https://analyticsadmin.googleapis.com/v1beta/properties/123/dataStreams/456").mock(
        return_value=httpx.Response(200, json={"webStreamData": {"measurementId": "G-QA123"}})
    )
    result = await admin.post("/api/v1/admin/measurement/connections/" + c["id"] + "/check")
    assert result.status_code == 200 and result.json()["state"] == "connected", result.text


async def test_google_oauth_state_bound_to_actor_and_replay_safe(admin):
    c = (await admin.post("/api/v1/admin/measurement/connections", json=connection())).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {"client_id": "synthetic-client", "client_secret": "synthetic-secret"},
        },
    )
    r = await admin.post("/api/v1/admin/measurement/connections/" + c["id"] + "/oauth/start")
    assert r.status_code == 200, r.text
    query = parse_qs(urlparse(r.json()["authorization_url"]).query)
    assert query["redirect_uri"] == ["http://test/api/v1/admin/measurement/oauth/callback"]
    bad = await admin.get(
        "/api/v1/admin/measurement/oauth/callback",
        params={"state": query["state"][0] + "x", "code": "invalid"},
    )
    assert bad.status_code in (403, 422)


async def test_sync_and_external_write_capabilities_do_not_claim_connection(admin):
    result = await admin.get("/api/v1/admin/measurement/capabilities")
    assert result.status_code == 200
    assert result.json()["providers"]["google_ads"]["cost_sync"] is True
    assert result.json()["providers"]["meta"]["external_url_update"] is False


@respx.mock
async def test_google_parameter_write_requires_preview_and_exact_current_campaign(admin):
    c = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                provider="google_ads",
                settings={
                    "tag_id": "AW-123456",
                    "customer_id": "123456789",
                    "ads_api_version": "v22",
                },
            ),
        )
    ).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {"access_token": "synthetic-token", "developer_token": "synthetic-developer"},
        },
    )
    campaign = (
        await admin.post(
            "/api/v1/admin/campaigns",
            json={
                "name": "Google campaign",
                "platform": "google",
                "utm_campaign": "camera",
                "connection_id": c["id"],
                "external_campaign_id": "555",
            },
        )
    ).json()
    suffix = ""

    def read(request):
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "campaign": {
                            "id": "555",
                            "resourceName": "customers/123456789/campaigns/555",
                            "finalUrlSuffix": suffix,
                        }
                    }
                ]
            },
        )

    respx.post("https://googleads.googleapis.com/v22/customers/123456789/googleAds:search").mock(
        side_effect=read
    )
    preview = await admin.post(
        "/api/v1/admin/measurement/campaigns/" + campaign["id"] + "/sync-preview",
        json={"expected_version": 1},
    )
    assert preview.status_code == 200, preview.text
    import json

    def mutate(request):
        nonlocal suffix
        suffix = json.loads(request.content)["operations"][0]["update"]["finalUrlSuffix"]
        return httpx.Response(
            200, json={"results": [{"resourceName": "customers/123456789/campaigns/555"}]}
        )

    mutation = respx.post(
        "https://googleads.googleapis.com/v22/customers/123456789/campaigns:mutate"
    ).mock(side_effect=mutate)
    data = {"preview_token": preview.json()["preview_token"], "confirm": True}
    saved = await admin.post(
        "/api/v1/admin/measurement/campaigns/" + campaign["id"] + "/sync-apply", json=data
    )
    assert saved.status_code == 200 and saved.json()["verified"] is True, saved.text
    replay = await admin.post(
        "/api/v1/admin/measurement/campaigns/" + campaign["id"] + "/sync-apply", json=data
    )
    assert replay.status_code == 200 and mutation.call_count == 1


@respx.mock
async def test_expired_google_token_refreshes_server_side_once(admin):
    c = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                settings={"measurement_id": "G-QA123", "property_id": "123", "stream_id": "456"}
            ),
        )
    ).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {
                "access_token": "expired-token",
                "refresh_token": "synthetic-refresh",
                "client_id": "synthetic-client",
                "client_secret": "synthetic-secret",
            },
            "expires_at": "2020-01-01T00:00:00Z",
        },
    )
    refresh = respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=httpx.Response(
            200, json={"access_token": "refreshed-token", "expires_in": 3600}
        )
    )
    respx.get("https://analyticsadmin.googleapis.com/v1beta/properties/123/dataStreams/456").mock(
        return_value=httpx.Response(200, json={"webStreamData": {"measurementId": "G-QA123"}})
    )
    for _ in range(2):
        result = await admin.post("/api/v1/admin/measurement/connections/" + c["id"] + "/check")
        assert result.status_code == 200, result.text
    assert refresh.call_count == 1


@respx.mock
async def test_oauth_callback_uses_nonce_bound_bridge_when_strict_session_cookie_absent(admin):
    app = admin._transport.app
    app.state.settings.supabase_url = "https://test.supabase.co"
    app.state.settings.supabase_auth_key = "sb_publishable_test"
    c = (await admin.post("/api/v1/admin/measurement/connections", json=connection())).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {"client_id": "synthetic-client", "client_secret": "synthetic-secret"},
        },
    )
    token = admin.headers.pop("Authorization")[7:]
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": token,
                "refresh_token": "private-refresh",
                "user": {"factors": []},
            },
        )
    )
    login = await admin.post(
        "/api/v1/auth/session", json={"email": "admin@example.test", "password": "password"}
    )
    assert login.status_code == 200, login.text
    admin.headers["X-CSRF-Token"] = admin.cookies["pagefpt_csrf"]
    start = await admin.post("/api/v1/admin/measurement/connections/" + c["id"] + "/oauth/start")
    assert start.status_code == 200, start.text
    state = parse_qs(urlparse(start.json()["authorization_url"]).query)["state"][0]
    # SameSite=Strict cookies are absent on Google's top-level callback, Lax bridge survives.
    admin.cookies.delete("pagefpt_admin_session")
    admin.cookies.delete("pagefpt_csrf")
    exchange = respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": "synthetic-access",
                "refresh_token": "synthetic-refresh",
                "expires_in": 3600,
            },
        )
    )
    callback = await admin.get(
        "/api/v1/admin/measurement/oauth/callback",
        params={"state": state, "code": "synthetic-code"},
    )
    assert callback.status_code == 303, callback.text
    replay = await admin.get(
        "/api/v1/admin/measurement/oauth/callback",
        params={"state": state, "code": "synthetic-code"},
    )
    assert replay.status_code in (401, 403), replay.text
    assert exchange.call_count == 1


@respx.mock
async def test_queued_google_cost_sync_runs_real_worker_and_repeated_tick_is_bounded(
    admin, gateway
):
    import psycopg

    from pagefpt.modules.measurement.sync import process

    app = admin._transport.app
    from pagefpt.core.crypto import Crypto

    crypt = Crypto("e" * 32, "m" * 32, "t" * 32)
    c = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                enabled=True,
                provider="google_ads",
                settings={
                    "tag_id": "AW-123456",
                    "customer_id": "123456789",
                    "ads_api_version": "v22",
                    "sync_interval_minutes": 60,
                    "sync_lookback_days": 3,
                },
            ),
        )
    ).json()
    assert "id" in c, c
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {"access_token": "synthetic-token", "developer_token": "synthetic-developer"},
        },
    )
    for _ in range(2):
        await gateway.rpc("dispatch", {"command": {"op": "schedule_tick"}})
    with psycopg.connect(gateway.dsn) as db:
        jobs = db.execute("SELECT id,payload FROM private.measurement_sync_jobs").fetchall()
        assert len(jobs) == 1
    day = jobs[0][1]["end"]
    respx.post("https://googleads.googleapis.com/v22/customers/123456789/googleAds:search").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "customer": {"currencyCode": "VND", "timeZone": "Asia/Ho_Chi_Minh"},
                        "campaign": {"id": "555"},
                        "segments": {"date": day},
                        "metrics": {"costMicros": "123000000", "clicks": "2", "impressions": "10"},
                    }
                ]
            },
        )
    )
    result = await process(gateway, crypt, app.state.provider_http, {"entity_id": str(jobs[0][0])})
    assert result["rows"] == 1
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT state FROM private.measurement_sync_jobs").fetchone()[0]
            == "completed"
        )
        assert db.execute("SELECT cost_vnd FROM private.measurement_costs").fetchone()[0] == 123


async def test_auto_sync_scheduler_reaches_connections_after_first_ten(admin, gateway):
    import psycopg

    for n in range(11):
        result = await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                name=f"Connection {n}",
                enabled=True,
                settings={"measurement_id": f"G-QA{n:03}", "sync_interval_minutes": 15},
            ),
        )
        assert result.status_code == 201, result.text
    for _ in range(3):
        await gateway.rpc("dispatch", {"command": {"op": "schedule_tick"}})
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(DISTINCT connection_id) FROM private.measurement_sync_jobs"
            ).fetchone()[0]
            == 11
        )


@respx.mock
async def test_large_provider_page_is_processed_in_small_durable_chunks(admin, gateway):
    import psycopg

    from pagefpt.core.crypto import Crypto
    from pagefpt.modules.measurement.sync import process

    app = admin._transport.app
    c = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                enabled=True,
                provider="google_ads",
                settings={
                    "tag_id": "AW-123456",
                    "customer_id": "123456789",
                    "ads_api_version": "v22",
                },
            ),
        )
    ).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {"access_token": "synthetic-token", "developer_token": "synthetic-developer"},
        },
    )
    sync = (
        await admin.post(
            "/api/v1/admin/measurement/sync-jobs",
            json={"connection_id": c["id"], "start": "2026-10-15", "end": "2026-10-15"},
        )
    ).json()
    fetch = respx.post(
        "https://googleads.googleapis.com/v22/customers/123456789/googleAds:search"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "customer": {"currencyCode": "VND", "timeZone": "Asia/Ho_Chi_Minh"},
                        "campaign": {"id": str(1000 + n)},
                        "segments": {"date": "2026-10-15"},
                        "metrics": {"costMicros": "1000000", "clicks": "1", "impressions": "2"},
                    }
                    for n in range(120)
                ]
            },
        )
    )
    job = {"entity_id": sync["id"]}
    for expected, count in [(50, 50), (50, 100), (20, 120)]:
        result = await process(
            gateway, Crypto("e" * 32, "m" * 32, "t" * 32), app.state.provider_http, job
        )
        assert result["rows"] == expected, result
        with psycopg.connect(gateway.dsn) as db:
            assert (
                db.execute("SELECT count(*) FROM private.measurement_costs").fetchone()[0] == count
            )
    assert fetch.call_count == 1
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT state FROM private.measurement_sync_jobs").fetchone()[0]
            == "completed"
        )


@respx.mock
async def test_connection_source_identity_cannot_change_while_first_sync_fetches(admin, gateway):
    from pagefpt.core.crypto import Crypto
    from pagefpt.modules.measurement.sync import process

    app = admin._transport.app
    c = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                enabled=True,
                provider="google_ads",
                settings={"tag_id": "AW-123456", "customer_id": "111", "ads_api_version": "v22"},
            ),
        )
    ).json()
    await admin.post(
        "/api/v1/admin/measurement/connections/" + c["id"] + "/credentials",
        json={
            "expected_version": 1,
            "values": {"access_token": "synthetic-token", "developer_token": "synthetic-developer"},
        },
    )
    job = (
        await admin.post(
            "/api/v1/admin/measurement/sync-jobs",
            json={"connection_id": c["id"], "start": "2026-10-15", "end": "2026-10-15"},
        )
    ).json()

    async def fetch(request):
        changed = await admin.put(
            "/api/v1/admin/measurement/connections/" + c["id"],
            json={
                **c["payload"],
                "settings": {**c["payload"]["settings"], "customer_id": "222"},
                "expected_version": 2,
            },
        )
        assert changed.status_code == 409, changed.text
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "customer": {"currencyCode": "VND", "timeZone": "Asia/Ho_Chi_Minh"},
                        "campaign": {"id": "555"},
                        "segments": {"date": "2026-10-15"},
                        "metrics": {"costMicros": "123000000", "clicks": "1", "impressions": "2"},
                    }
                ]
            },
        )

    respx.post("https://googleads.googleapis.com/v22/customers/111/googleAds:search").mock(
        side_effect=fetch
    )
    assert (
        await process(
            gateway,
            Crypto("e" * 32, "m" * 32, "t" * 32),
            app.state.provider_http,
            {"entity_id": job["id"]},
        )
    )["rows"] == 1
