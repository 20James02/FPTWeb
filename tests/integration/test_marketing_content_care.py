from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_consent_event_dedup_and_optout(client, gateway):
    session = await client.post(
        "/api/v1/sessions", json={"analytics": True, "marketing": False, "consent_version": "v1"}
    )
    assert session.status_code == 201, session.text
    token = session.json()["session_token"]
    batch = {
        "session_token": token,
        "events": [{"id": str(uuid4()), "name": "view_plan", "plan_id": str(uuid4())}],
    }
    assert (await client.post("/api/v1/events/batch", json=batch)).json()["accepted"] == 1
    assert (await client.post("/api/v1/events/batch", json=batch)).json()["accepted"] == 0
    assert (
        await client.put(
            "/api/v1/consent",
            json={
                "session_token": token,
                "analytics": False,
                "marketing": False,
                "consent_version": "v2",
            },
        )
    ).status_code == 200
    batch["events"][0]["id"] = str(uuid4())
    assert (await client.post("/api/v1/events/batch", json=batch)).json()["accepted"] == 0
    batch["events"][0]["phone"] = "0901234567"
    assert (await client.post("/api/v1/events/batch", json=batch)).status_code == 422


@pytest.mark.asyncio
async def test_cms_draft_publish_and_unsafe_url(admin):
    r = await admin.post(
        "/api/v1/admin/pages",
        json={
            "title": "Synthetic",
            "slug": "test-page",
            "blocks": [{"type": "text", "text": "Hello"}],
        },
    )
    assert r.status_code == 201, r.text
    id = r.json()["id"]
    assert (await admin.get("/api/v1/pages/test-page")).status_code == 404
    assert (
        await admin.post(f"/api/v1/admin/pages/{id}/publish", json={"expected_version": 1})
    ).status_code == 200
    assert (await admin.get("/api/v1/pages/test-page")).json()["title"] == "Synthetic"
    assert "test-page" in (await admin.get("/sitemap.xml")).text
    bad = await admin.post(
        "/api/v1/admin/pages",
        json={
            "title": "Unsafe",
            "slug": "bad",
            "blocks": [{"type": "cta", "text": "x", "url": "javascript:alert(1)"}],
        },
    )
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_campaign_and_followup_preferences(admin, gateway):
    lead = await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert lead.status_code == 201
    import psycopg

    with psycopg.connect(gateway.dsn) as db:
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    campaign = await admin.post(
        "/api/v1/admin/campaigns",
        json={"name": "Synthetic", "platform": "google", "utm_campaign": "test"},
    )
    assert campaign.status_code == 201, campaign.text
    preference = await admin.put(
        f"/api/v1/admin/leads/{id}/preferences",
        json={"marketing_allowed": False, "service_contact_allowed": False},
    )
    assert preference.status_code == 200, preference.text
    followup = await admin.post(
        "/api/v1/admin/followups",
        json={
            "lead_id": id,
            "channel": "sms",
            "purpose": "marketing",
            "scheduled_at": "2026-10-01T01:00:00Z",
        },
    )
    assert followup.status_code == 409, followup.text
