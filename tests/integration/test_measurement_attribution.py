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
