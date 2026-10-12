import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import psycopg
import respx
from pydantic import SecretStr

from pagefpt.core.crypto import Crypto
from pagefpt.modules.workflow.worker import Worker

BOT_TOKEN = "123456789:" + "a" * 35
ENDPOINT = "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage"


def enable_telegram(admin):
    settings = admin._transport.app.state.settings
    settings.telegram_enabled = True
    settings.telegram_bot_token = SecretStr(BOT_TOKEN)
    settings.telegram_chat_id = "123456789"
    settings.public_origin = "https://test"
    return admin._transport.app


@respx.mock
async def test_new_lead_telegram_job_is_atomic_deduplicated_and_excludes_pii(admin, gateway):
    app = enable_telegram(admin)
    payload = {
        "name": "QA Secret Customer",
        "phone": "0901234567",
        "installation_address": "QA Private Address",
        "consent_version": "v1",
    }
    key = str(uuid4())
    first = await admin.post("/api/v1/leads", json=payload, headers={"Idempotency-Key": key})
    assert first.status_code == 201, first.text
    assert (
        await admin.post("/api/v1/leads", json=payload, headers={"Idempotency-Key": key})
    ).json()["receipt"] == first.json()["receipt"]
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT count(*) FROM private.jobs WHERE kind='admin_notice'").fetchone()[0]
            == 1
        )
    sent = []

    def provider(request):
        value = json.loads(request.content)
        sent.append(value)
        assert value["chat_id"] == "123456789"
        assert first.json()["receipt"] in value["text"]
        for pii in [payload["name"], payload["phone"], payload["installation_address"]]:
            assert pii not in request.content.decode()
        assert value["reply_markup"]["inline_keyboard"][0][0]["url"].startswith(
            "https://test/admin/leads/detail?id="
        )
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 123}})

    respx.post(ENDPOINT).mock(side_effect=provider)
    worker = Worker(gateway, Crypto("e" * 32, "m" * 32, "t" * 32), telegram=app.state.telegram)
    result = await worker.process("notifications")
    assert result["completed"] == 1
    assert len(sent) == 1
    assert (await worker.process("notifications"))["claimed"] == 0


@respx.mock
async def test_telegram_failure_keeps_saved_lead_and_retries_queued_notice(admin, gateway):
    app = enable_telegram(admin)
    response = await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    respx.post(ENDPOINT).mock(return_value=httpx.Response(503, json={"ok": False}))
    worker = Worker(gateway, Crypto("e" * 32, "m" * 32, "t" * 32), telegram=app.state.telegram)
    assert (await worker.process("notifications"))["retried"] == 1
    assert len((await admin.get("/api/v1/admin/leads")).json()["items"]) == 1
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute("SELECT state FROM private.jobs WHERE kind='admin_notice'").fetchone()[0]
            == "pending"
        )


@respx.mock
async def test_telegram_ambiguous_timeout_is_recorded_without_automatic_replay(admin, gateway):
    app = enable_telegram(admin)
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    respx.post(ENDPOINT).mock(side_effect=httpx.ReadTimeout("Synthetic timeout"))
    worker = Worker(gateway, Crypto("e" * 32, "m" * 32, "t" * 32), telegram=app.state.telegram)
    assert (await worker.process("notifications"))["completed"] == 1
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT state FROM private.deliveries WHERE platform='admin_telegram'"
            ).fetchone()[0]
            == "unknown"
        )
    assert (await worker.process("notifications"))["claimed"] == 0


@respx.mock
async def test_recovery_notice_contains_no_email_code_password_or_link(admin, gateway):
    app = enable_telegram(admin)
    await gateway.rpc(
        "dispatch", {"command": {"op": "admin_notice_enqueue_recovery", "event_id": str(uuid4())}}
    )

    def provider(request):
        payload = json.loads(request.content)
        assert "khôi phục" in payload["text"]
        assert "qa@example.test" not in request.content.decode()
        assert "token" not in request.content.decode()
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 124}})

    respx.post(ENDPOINT).mock(side_effect=provider)
    worker = Worker(gateway, Crypto("e" * 32, "m" * 32, "t" * 32), telegram=app.state.telegram)
    assert (await worker.process("notifications"))["completed"] == 1


@respx.mock
async def test_telegram_rate_limit_waits_for_provider_retry_after(admin, gateway):
    app = enable_telegram(admin)
    await admin.post(
        "/api/v1/leads",
        json={"phone": "0901234567", "consent_version": "v1"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    respx.post(ENDPOINT).mock(
        return_value=httpx.Response(429, json={"ok": False, "parameters": {"retry_after": 45}})
    )
    worker = Worker(gateway, Crypto("e" * 32, "m" * 32, "t" * 32), telegram=app.state.telegram)
    assert (await worker.process("notifications"))["retried"] == 1
    with psycopg.connect(gateway.dsn) as db:
        retry_at = db.execute(
            "SELECT next_attempt_at FROM private.jobs WHERE kind='admin_notice'"
        ).fetchone()[0]
    assert (retry_at - datetime.now(UTC)).total_seconds() >= 43
