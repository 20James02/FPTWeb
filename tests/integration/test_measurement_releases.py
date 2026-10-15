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
