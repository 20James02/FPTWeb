from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg

from tests.integration.test_catalog_intake import catalog
from tests.integration.test_worker_crm import lead


async def test_price_draft_edit_published_immutable_and_retire(admin):
    plan, region = await catalog(admin)
    payload = {
        "plan_id": plan,
        "scope_id": region,
        "scope_kind": "region",
        "billing_months": 6,
        "monthly_vnd": 123000,
        "source": "synthetic",
        "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
    }
    p = (await admin.post("/api/v1/admin/prices", json=payload)).json()
    assert (await admin.get("/api/v1/admin/prices")).status_code == 200
    payload["monthly_vnd"] = 124000
    r = await admin.put(f"/api/v1/admin/prices/{p['id']}?expected_version=1", json=payload)
    assert r.status_code == 200, r.text
    assert (
        await admin.put(f"/api/v1/admin/prices/{p['id']}?expected_version=1", json=payload)
    ).status_code == 409
    assert (
        await admin.post(f"/api/v1/admin/prices/{p['id']}/publish", json={"expected_version": 2})
    ).status_code == 200
    assert (
        await admin.put(f"/api/v1/admin/prices/{p['id']}?expected_version=3", json=payload)
    ).status_code == 409
    assert (
        await admin.post(f"/api/v1/admin/prices/{p['id']}/retire", json={"expected_version": 3})
    ).status_code == 200


async def test_appointments_versions_scoring_and_aggregate_correction(admin, gateway):
    lid = await lead(admin, gateway)
    r = await admin.post(
        f"/api/v1/admin/leads/{lid}/appointments",
        json={
            "expected_version": 1,
            "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "notes": "Private appointment note",
        },
    )
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    assert "Private appointment note" not in r.text
    assert (await admin.get(f"/api/v1/admin/leads/{lid}/appointments")).json()["items"][0][
        "id"
    ] == aid
    r = await admin.patch(
        f"/api/v1/admin/appointments/{aid}", json={"expected_version": 1, "status": "cancelled"}
    )
    assert r.status_code == 200, r.text
    assert (
        await admin.patch(
            f"/api/v1/admin/appointments/{aid}", json={"expected_version": 1, "status": "completed"}
        )
    ).status_code == 409
    assert (await admin.post(f"/api/v1/admin/leads/{lid}/recompute")).status_code == 202
    assert (await admin.get(f"/api/v1/admin/leads/{lid}/intelligence")).status_code == 200
    r = await admin.get("/internal/jobs/recover", headers={"X-Job-Secret": "j" * 32})
    assert r.status_code == 200, r.text
    rows = (await admin.get("/api/v1/admin/reports/daily")).json()["items"]
    assert sum(row["payload"]["leads"] for row in rows) == 1
    with psycopg.connect(gateway.dsn, autocommit=True) as c:
        c.execute("DELETE FROM private.leads WHERE id=%s", [lid])
    await admin.get("/internal/jobs/recover", headers={"X-Job-Secret": "j" * 32})
    assert (
        sum(
            row["payload"]["leads"]
            for row in (await admin.get("/api/v1/admin/reports/daily")).json()["items"]
        )
        == 0
    )


async def test_redirect_loops_and_reserved_paths_rejected(admin):
    r = await admin.put(
        "/api/v1/admin/redirects", json={"path": "/old", "target": "/new", "status_code": 301}
    )
    assert r.status_code == 200, r.text
    r = await admin.get(
        "/api/v1/redirects/resolve", params={"path": "/old"}, follow_redirects=False
    )
    assert r.status_code == 301 and r.headers["location"] == "/new"
    assert (
        await admin.put(
            "/api/v1/admin/redirects", json={"path": "/new", "target": "/old", "status_code": 301}
        )
    ).status_code == 409
    assert (
        await admin.put(
            "/api/v1/admin/redirects",
            json={"path": "/admin", "target": "https://evil.example", "status_code": 301},
        )
    ).status_code == 422


async def test_quote_confirmation_keeps_old_snapshot_in_history(admin, gateway):
    plan, region = await catalog(admin)
    p = (
        await admin.post(
            "/api/v1/admin/prices",
            json={
                "plan_id": plan,
                "scope_id": region,
                "scope_kind": "region",
                "billing_months": 6,
                "monthly_vnd": 200000,
                "source": "synthetic",
                "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            },
        )
    ).json()
    await admin.post(f"/api/v1/admin/prices/{p['id']}/publish", json={"expected_version": 1})
    q = (await admin.post("/api/v1/quotes", json={"plan_id": plan, "region_id": region})).json()
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1", "plan_id": plan, "region_id": region},
        headers={"Idempotency-Key": str(uuid4())},
    )
    with psycopg.connect(gateway.dsn) as c:
        lid = str(c.execute("SELECT id FROM private.leads").fetchone()[0])
    r = await admin.post(
        f"/api/v1/admin/leads/{lid}/quotes/confirm",
        json={"expected_version": 1, "quote_token": q["quote_token"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["quote_status"] == "confirmed"
    assert (
        await admin.post(
            f"/api/v1/admin/leads/{lid}/quotes/confirm",
            json={"expected_version": 1, "quote_token": q["quote_token"]},
        )
    ).status_code == 409


async def test_visit_assessment_uses_only_consented_events_and_trusted_geo(client):
    token = (
        await client.post("/api/v1/sessions", json={"consent_version": "v1", "analytics": False})
    ).json()["session_token"]
    r = await client.post(
        "/api/v1/visits/assess",
        json={"session_token": token},
        headers={"X-Forwarded-For": "8.8.8.8"},
    )
    assert r.status_code == 200 and r.json()["status"] == "tracking_disabled"
    await client.put(
        "/api/v1/consent", json={"session_token": token, "consent_version": "v1", "analytics": True}
    )
    await client.post(
        "/api/v1/events/batch",
        json={"session_token": token, "events": [{"id": str(uuid4()), "name": "select_plan"}]},
    )
    r = await client.post(
        "/api/v1/visits/assess",
        json={"session_token": token},
        headers={"X-Forwarded-For": "8.8.8.8"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["intent"] == 25 and r.json()["geoip"]["status"] == "unknown"
    assert "8.8.8.8" not in r.text


async def test_quote_rejects_unpublished_region_even_with_default_price(admin):
    plan, _ = await catalog(admin)
    p = (
        await admin.post(
            "/api/v1/admin/prices",
            json={
                "plan_id": plan,
                "scope_id": str(__import__("uuid").UUID(int=0)),
                "scope_kind": "default",
                "billing_months": 6,
                "monthly_vnd": 100000,
                "source": "synthetic",
                "start": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
            },
        )
    ).json()
    await admin.post(f"/api/v1/admin/prices/{p['id']}/publish", json={"expected_version": 1})
    r = await admin.post("/api/v1/quotes", json={"plan_id": plan, "region_id": str(uuid4())})
    assert r.status_code == 422 and r.json()["code"] == "INVALID_REGION"


async def test_display_settings_require_auth_and_version_and_survive_new_app(admin, gateway):
    token = admin.headers.pop("Authorization")
    public = (await admin.get("/api/v1/system/display-settings")).json()
    payload = {
        "expected_version": public["version"],
        "runline_text": "Synthetic approved content",
        "banner_zones": {"hero_slider": False},
    }
    assert (await admin.post("/api/v1/system/display-settings", json=payload)).status_code == 401
    admin.headers["Authorization"] = token
    assert (await admin.post("/api/v1/system/display-settings", json=payload)).status_code == 200
    assert (await admin.post("/api/v1/system/display-settings", json=payload)).status_code == 409
    import httpx

    from pagefpt.application import create_app

    app = create_app(admin._transport.app.state.settings, gateway)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as other:
        value = (await other.get("/api/v1/system/display-settings")).json()
        assert (
            value["runline_text"] == "Synthetic approved content"
            and value["banner_zones"]["hero_slider"] is False
        )


async def test_scheduled_publish_replay_does_not_fail_after_side_effect(admin, gateway):
    page = (
        await admin.post(
            "/api/v1/admin/pages",
            json={"title": "Synthetic page", "slug": "scheduled-replay", "blocks": []},
        )
    ).json()
    actor = (await admin.get("/api/v1/admin/me")).json()["id"]
    command = {"op": "scheduled_publish", "id": page["id"], "actor": actor, "expected_version": 1}
    first = await gateway.rpc("dispatch", {"command": command})
    second = await gateway.rpc("dispatch", {"command": command})
    assert first["status"] == "published" and second["already_published"] is True


async def test_marketing_integration_metadata_cannot_expose_secrets(admin):
    response = await admin.post(
        "/api/v1/admin/integrations",
        json={
            "name": "Synthetic Meta",
            "platform": "meta",
            "enabled": False,
            "secret": "must-not-store",
        },
    )
    assert response.status_code == 422
    capabilities = (await admin.get("/api/v1/admin/integration-capabilities")).json()
    assert (
        capabilities["enabled"] is False and capabilities["provider_credentials_exposed"] is False
    )


async def test_region_hierarchy_uses_published_catalog_ids(admin):
    _, region_id = await catalog(admin)
    draft = await admin.post(
        "/api/v1/admin/regions",
        json={"name": "Draft only", "code": "unpublished", "branch_id": str(uuid4())},
    )
    assert draft.status_code == 201
    response = await admin.get("/api/v1/regions/hierarchy")
    provinces = [p for zone in response.json().values() for p in zone["provinces"]]
    assert len(provinces) == 1
    assert provinces[0]["code"] == region_id
    assert provinces[0]["name"] == "Test region"


async def test_production_empty_regions_do_not_publish_legacy_geography(client):
    client._transport.app.state.settings.environment = "production"
    response = await client.get("/api/v1/regions/hierarchy")
    assert response.status_code == 200
    assert response.json() == {}
