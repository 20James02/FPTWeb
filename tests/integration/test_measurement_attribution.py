import psycopg


async def test_campaign_ids_are_strings_and_repeated_or_direct_touch_does_not_replace_source(
    client, gateway
):
    session = (
        await client.post(
            "/api/v1/sessions",
            json={"analytics": True, "marketing": True, "consent_version": "test"},
        )
    ).json()["session_token"]
    data = {
        "session_token": session,
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "camera_october",
        "utm_content": "video_a",
        "campaign_id": "12345678901234567890",
        "adgroup_id": "98765432109876543210",
        "ad_id": "55555555555555555555",
        "landing_path": "/camera-sale",
        "click_id": "opaque-click",
        "click_id_type": "gclid",
        "platform": "google",
    }
    first = await client.post("/api/v1/touches", json=data)
    assert first.status_code == 200, first.text
    assert (await client.post("/api/v1/touches", json=data)).status_code == 200
    assert (
        await client.post("/api/v1/touches", json={"session_token": session})
    ).status_code == 200
    with psycopg.connect(gateway.dsn) as db:
        rows = db.execute("SELECT payload FROM private.touches").fetchall()
        assert len(rows) == 1
        assert (
            rows[0][0]["campaign_id"] == data["campaign_id"]
            and rows[0][0]["click_id_type"] == "gclid"
        )
        assert "opaque-click" not in str(rows[0][0])


async def test_new_advertising_permission_not_implied_by_legacy_marketing(client, gateway):
    result = await client.post(
        "/api/v1/sessions", json={"analytics": True, "marketing": True, "consent_version": "old"}
    )
    assert result.status_code == 201
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT advertising,personalization FROM private.sessions"
        ).fetchone() == (False, False)
    token = result.json()["session_token"]
    result = await client.put(
        "/api/v1/consent",
        json={
            "session_token": token,
            "analytics": True,
            "marketing": True,
            "advertising": True,
            "personalization": False,
            "consent_version": "new",
        },
    )
    assert result.status_code == 200, result.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT advertising,personalization FROM private.sessions"
        ).fetchone() == (True, False)


async def test_resume_session_respects_current_server_consent(admin):
    token = (
        await admin.post(
            "/api/v1/sessions",
            json={
                "analytics": True,
                "marketing": True,
                "advertising": True,
                "consent_version": "v3",
            },
        )
    ).json()["session_token"]
    response = await admin.post("/api/v1/sessions/resume", json={"session_token": token})
    assert response.status_code == 200 and response.json()["advertising"] is True, response.text
    await admin.put(
        "/api/v1/consent",
        json={
            "session_token": token,
            "analytics": False,
            "marketing": False,
            "consent_version": "v3",
        },
    )
    response = await admin.post("/api/v1/sessions/resume", json={"session_token": token})
    assert response.status_code == 200 and response.json()["analytics"] is False, response.text


async def test_expired_session_proof_can_only_revoke_not_read_or_track(client, gateway):
    from datetime import UTC, datetime

    from pagefpt.core.crypto import Crypto

    crypt = Crypto("e" * 32, "m" * 32, "t" * 32)
    token = (
        await client.post(
            "/api/v1/sessions",
            json={
                "analytics": True,
                "marketing": True,
                "advertising": True,
                "consent_version": "v3",
            },
        )
    ).json()["session_token"]
    claims = crypt.verify(token, "session", datetime.now(UTC))
    expired = crypt.sign({**claims, "exp": 1})
    assert (
        await client.post("/api/v1/sessions/resume", json={"session_token": expired})
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/touches", json={"session_token": expired, "utm_source": "google"}
        )
    ).status_code == 403
    revoked = await client.post("/api/v1/consent/revoke", json={"session_token": expired})
    assert revoked.status_code == 200, revoked.text
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT analytics,marketing,advertising,personalization FROM private.sessions"
        ).fetchone() == (False, False, False, False)
    assert (
        await client.post("/api/v1/consent/revoke", json={"session_token": expired + "x"})
    ).status_code == 403
