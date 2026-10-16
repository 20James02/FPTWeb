import asyncio

import psycopg

from tests.integration.test_measurement_registry import connection


async def setup_config(admin, scope="global", scope_key="*", **changes):
    conn = (
        await admin.post("/api/v1/admin/measurement/connections", json=connection(enabled=True))
    ).json()
    payload = {
        "name": "Website",
        "scope": scope,
        "scope_key": scope_key,
        "environment": "test",
        "policy": {"ga4_connection_id": conn["id"]},
        **changes,
    }
    response = await admin.post("/api/v1/admin/measurement/configs", json=payload)
    assert response.status_code == 201, response.text
    return conn, response.json()


async def test_publish_simulate_public_restore_and_etag(admin):
    conn, draft = await setup_config(admin)
    base = "/api/v1/admin/measurement/configs/" + draft["id"]
    simulation = await admin.post(
        base + "/simulate",
        json={
            "expected_version": 1,
            "path": "/",
            "event": "lead",
            "analytics": True,
            "marketing": False,
        },
    )
    assert simulation.status_code == 200, simulation.text
    assert simulation.json()["public_config"]["measurement_id"] == "G-TEST123"
    result = await admin.post(base + "/publish", json={"expected_version": 1})
    assert result.status_code == 200, result.text
    release = result.json()
    public = await admin.get("/api/v1/measurement/config")
    assert public.status_code == 200 and public.json()["measurement_id"] == "G-TEST123"
    assert all(key not in public.text for key in ("ciphertext", "access_token", "api_secret"))
    assert (
        await admin.get(
            "/api/v1/measurement/config", headers={"If-None-Match": public.headers["etag"]}
        )
    ).status_code == 304
    conflict = await admin.post(base + "/publish", json={"expected_version": 1})
    assert conflict.status_code == 409
    restored = await admin.post(
        "/api/v1/admin/measurement/releases/" + release["release_id"] + "/restore",
        json={"expected_version": 2},
    )
    assert restored.status_code == 200 and restored.json()["release_id"] != release["release_id"]


async def test_disabled_connection_immediately_removed_from_public_config(admin):
    conn, draft = await setup_config(admin)
    assert (
        await admin.post(
            "/api/v1/admin/measurement/configs/" + draft["id"] + "/publish",
            json={"expected_version": 1},
        )
    ).status_code == 200
    result = await admin.post(
        "/api/v1/admin/measurement/connections/" + conn["id"] + "/disable",
        json={"expected_version": 1},
    )
    assert result.status_code == 200
    assert (await admin.get("/api/v1/measurement/config")).json()["measurement_id"] == ""


async def test_landing_override_and_parallel_publish(admin):
    _, global_draft = await setup_config(admin)
    await admin.post(
        "/api/v1/admin/measurement/configs/" + global_draft["id"] + "/publish",
        json={"expected_version": 1},
    )
    _, landing = await setup_config(
        admin, "landing", "/camera-sale", policy={"consent_mode": "basic"}
    )
    path = "/api/v1/admin/measurement/configs/" + landing["id"] + "/publish"
    results = await asyncio.gather(
        *(admin.post(path, json={"expected_version": 1}) for _ in range(2))
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    cfg = (await admin.get("/api/v1/measurement/config?path=/camera-sale")).json()
    assert cfg["consent_mode"] == "basic" and cfg["measurement_id"] == "G-TEST123"
    assert (await admin.get("/api/v1/measurement/config?path=/")).json()[
        "consent_mode"
    ] == "advanced"


async def test_invalid_reference_and_duplicate_primary_never_publish(admin):
    _, draft = await setup_config(
        admin, policy={"ga4_connection_id": "00000000-0000-0000-0000-000000000001"}
    )
    failed = await admin.post(
        "/api/v1/admin/measurement/configs/" + draft["id"] + "/publish",
        json={"expected_version": 1},
    )
    assert failed.status_code == 422
    rules = [
        {
            "event": "lead",
            "connection_id": "00000000-0000-0000-0000-000000000001",
            "primary": True,
            "provider_event": "Lead",
        }
    ] * 2
    bad = await admin.post(
        "/api/v1/admin/measurement/configs", json={**draft["payload"], "rules": rules}
    )
    assert bad.status_code == 422


async def test_release_history_cannot_mutate_account_identity(admin, gateway):
    conn, draft = await setup_config(admin)
    await admin.post(
        "/api/v1/admin/measurement/configs/" + draft["id"] + "/publish",
        json={"expected_version": 1},
    )
    r = await admin.put(
        "/api/v1/admin/measurement/connections/" + conn["id"],
        json={
            **connection(enabled=True, settings={"measurement_id": "G-OTHER123"}),
            "expected_version": 1,
        },
    )
    assert r.status_code == 409
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.measurement_releases").fetchone()[0] == 1


async def test_active_connection_edit_requires_publish_permission(admin, gateway):
    conn, draft = await setup_config(admin)
    await admin.post(
        "/api/v1/admin/measurement/configs/" + draft["id"] + "/publish",
        json={"expected_version": 1},
    )
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.memberships SET permissions=ARRAY['measurement.read','measurement.configure']"
        )
    response = await admin.put(
        "/api/v1/admin/measurement/connections/" + conn["id"],
        json={**conn["payload"], "enabled": False, "expected_version": 1},
    )
    assert response.status_code == 403, response.text
    assert (await admin.get("/api/v1/measurement/config")).json()["measurement_id"] == "G-TEST123"


async def test_browser_crm_and_duplicate_ga4_lead_routes_cannot_publish(admin):
    conn, draft = await setup_config(admin)
    base = "/api/v1/admin/measurement/configs/" + draft["id"]
    for stage, route in [("closed", "browser"), ("lead", "server")]:
        r = await admin.put(
            base,
            json={
                **draft["payload"],
                "expected_version": draft["version"],
                "rules": [
                    {
                        "event": stage,
                        "connection_id": conn["id"],
                        "provider_event": "generate_lead" if stage == "lead" else "sale_closed",
                        "route": route,
                    }
                ],
            },
        )
        assert r.status_code == 200, r.text
        draft = r.json()
        invalid = await admin.post(base + "/publish", json={"expected_version": draft["version"]})
        assert invalid.status_code == 422, invalid.text


async def test_campaign_override_resolves_only_unique_owned_mapping(admin):
    ads = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                provider="google_ads",
                enabled=True,
                settings={"tag_id": "AW-123456", "customer_id": "123456789"},
            ),
        )
    ).json()
    campaign = (
        await admin.post(
            "/api/v1/admin/campaigns",
            json={
                "name": "Owned campaign",
                "platform": "google",
                "utm_campaign": "camera",
                "connection_id": ads["id"],
                "external_campaign_id": "555",
            },
        )
    ).json()
    _, cfg = await setup_config(admin, "campaign", campaign["id"], policy={"consent_mode": "basic"})
    assert (
        await admin.post(
            "/api/v1/admin/measurement/configs/" + cfg["id"] + "/publish",
            json={"expected_version": 1},
        )
    ).status_code == 200
    matched = await admin.get("/api/v1/measurement/config?path=/&campaign=555&platform=google")
    assert matched.status_code == 200 and matched.json()["consent_mode"] == "basic", matched.text
    assert (await admin.get("/api/v1/measurement/config?campaign=555&platform=meta")).json()[
        "consent_mode"
    ] == "advanced"


async def test_bulk_disable_reports_stale_item_without_reverting_success(admin):
    a = (
        await admin.post("/api/v1/admin/measurement/connections", json=connection(enabled=True))
    ).json()
    b = (
        await admin.post("/api/v1/admin/measurement/connections", json=connection(enabled=True))
    ).json()
    result = await admin.post(
        "/api/v1/admin/measurement/bulk",
        json={
            "action": "disable",
            "items": [
                {"id": a["id"], "expected_version": 1},
                {"id": b["id"], "expected_version": 999},
            ],
        },
    )
    assert result.status_code == 200, result.text
    assert [r["ok"] for r in result.json()["items"]] == [True, False]
    rows = (await admin.get("/api/v1/admin/measurement/connections")).json()["items"]
    assert next(c for c in rows if c["id"] == a["id"])["payload"]["enabled"] is False


async def test_session_campaign_config_and_receipt_survive_direct_navigation(admin):
    from uuid import uuid4

    global_conn, global_cfg = await setup_config(admin)
    await admin.post(
        "/api/v1/admin/measurement/configs/" + global_cfg["id"] + "/publish",
        json={"expected_version": 1},
    )
    ads = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                enabled=True,
                provider="google_ads",
                settings={"tag_id": "AW-123456", "customer_id": "123456789"},
            ),
        )
    ).json()
    campaign = (
        await admin.post(
            "/api/v1/admin/campaigns",
            json={
                "name": "Persistent",
                "platform": "google",
                "utm_campaign": "camera",
                "connection_id": ads["id"],
                "external_campaign_id": "555",
            },
        )
    ).json()
    campaign_ga = (
        await admin.post(
            "/api/v1/admin/measurement/connections",
            json=connection(
                enabled=True, settings={"measurement_id": "G-CAMP123", "browser_enabled": True}
            ),
        )
    ).json()
    cfg = (
        await admin.post(
            "/api/v1/admin/measurement/configs",
            json={
                "name": "Campaign override",
                "scope": "campaign",
                "scope_key": campaign["id"],
                "environment": "test",
                "policy": {"ga4_connection_id": campaign_ga["id"]},
            },
        )
    ).json()
    simulation = await admin.post(
        "/api/v1/admin/measurement/configs/" + cfg["id"] + "/simulate", json={"expected_version": 1}
    )
    assert (
        simulation.status_code == 200
        and simulation.json()["public_config"]["measurement_id"] == "G-CAMP123"
    ), simulation.text
    await admin.post(
        "/api/v1/admin/measurement/configs/" + cfg["id"] + "/publish", json={"expected_version": 1}
    )
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
    await admin.post(
        "/api/v1/touches",
        json={
            "session_token": token,
            "utm_source": "google",
            "campaign_id": "555",
            "platform": "google",
        },
    )
    await admin.post("/api/v1/touches", json={"session_token": token, "landing_path": "/plans"})
    resolved = await admin.post(
        "/api/v1/measurement/config/session", json={"session_token": token, "path": "/plans"}
    )
    assert resolved.status_code == 200 and resolved.json()["measurement_id"] == "G-CAMP123", (
        resolved.text
    )
    assert resolved.headers["cache-control"] == "no-store"
    lead = await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "session_token": token,
            "analytics_opt_in": True,
            "marketing_opt_in": True,
            "consent_version": "v3",
            "measurement_path": "/plans",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert lead.status_code == 201, lead.text
    assert lead.json()["measurement"]["measurement_id"] == "G-CAMP123", lead.text
    assert "ciphertext" not in str(lead.json()["measurement"])


async def test_connection_browser_switch_disables_native_ga4(admin):
    conn, cfg = await setup_config(admin)
    await admin.post(
        "/api/v1/admin/measurement/configs/" + cfg["id"] + "/publish", json={"expected_version": 1}
    )
    changed = await admin.put(
        "/api/v1/admin/measurement/connections/" + conn["id"],
        json={
            **conn["payload"],
            "settings": {**conn["payload"]["settings"], "browser_enabled": False},
            "expected_version": 1,
        },
    )
    assert changed.status_code == 200, changed.text
    assert (await admin.get("/api/v1/measurement/config")).json()["measurement_id"] == ""


async def test_deployed_environment_must_match_the_published_ga4_config(client, gateway):
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        db.execute("SELECT private.measurement_bootstrap('production')")
    client._transport.app.state.settings.environment = "staging"
    wrong = (await client.get("/api/v1/measurement/config")).json()
    assert wrong["measurement_id"] == "" and wrong["versions"] == []
    client._transport.app.state.settings.environment = "production"
    configured = (await client.get("/api/v1/measurement/config")).json()
    assert configured["measurement_id"] == "G-D0J0XLJ891"
    assert len(configured["versions"]) == 1
