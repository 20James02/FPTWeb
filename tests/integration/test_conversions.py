from uuid import uuid4

import psycopg
import pytest


@pytest.mark.asyncio
async def test_conversion_requires_consent_and_disabled_is_not_sent(admin, gateway):
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
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "consent_version": "v1",
            "session_token": token,
            "marketing_opt_in": True,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    await admin.post(
        "/internal/jobs/process", json={"queue": "lead_local"}, headers={"X-Job-Secret": "j" * 32}
    )
    r = await admin.post(
        "/internal/jobs/process", json={"queue": "conversions"}, headers={"X-Job-Secret": "j" * 32}
    )
    assert r.status_code == 200, r.text
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT state FROM private.deliveries WHERE platform='conversion'"
            ).fetchone()[0]
            == "disabled"
        )
        id = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    await admin.put(
        "/api/v1/consent",
        json={
            "session_token": token,
            "analytics": False,
            "marketing": False,
            "consent_version": "v2",
        },
    )
    result = await gateway.rpc("dispatch", {"command": {"op": "conversion_prepare", "id": id}})
    assert result["status"] == "consent_denied"


async def test_conversion_click_id_is_private_until_consented_delivery(admin, gateway):
    from pagefpt.api.dependencies import crypto
    from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState
    from pagefpt.modules.workflow.worker import Worker

    session = (
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
            "session_token": session,
            "platform": "meta",
            "utm_source": "meta",
            "click_id": "synthetic-click",
        },
    )
    await admin.post(
        "/api/v1/leads",
        json={
            "phone": "0901234567",
            "consent_version": "v1",
            "session_token": session,
            "marketing_opt_in": True,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    with psycopg.connect(gateway.dsn) as db:
        lid = str(db.execute("SELECT id FROM private.leads").fetchone()[0])
    captured = []

    class Adapter:
        async def deliver(self, event):
            captured.append(event)
            return DeliveryResult(DeliveryState.ACCEPTED, "ACCEPTED")

    from starlette.requests import Request

    request = Request({"type": "http", "app": admin._transport.app})
    worker = Worker(gateway, crypto(request), conversions=Adapter())
    await worker.handle({"kind": "conversion", "entity_id": lid, "job_command": {}})
    assert captured[0]["attribution"]["last_touch"]["click_id"] == "synthetic-click"
    detail = await admin.get("/api/v1/admin/leads/" + lid)
    assert "synthetic-click" not in detail.text and "click_id_ciphertext" not in detail.text
    await admin.put(
        "/api/v1/consent",
        json={
            "session_token": session,
            "analytics": True,
            "marketing": False,
            "consent_version": "v2",
        },
    )
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT click_id_ciphertext FROM private.leads WHERE id=%s", [lid]
            ).fetchone()[0]
            is None
        )
