"""A secret-protected readonly probe must never schedule or send messages."""

import psycopg
import pytest
import respx


@respx.mock
@pytest.mark.parametrize("header", ["X-Job-Secret", "Authorization"])
async def test_worker_status_is_readonly_and_accepts_scheduler_auth(client, gateway, header):
    secret = "j" * 32
    value = "Bearer " + secret if header == "Authorization" else secret
    response = await client.get("/internal/jobs/status", headers={header: value})
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {
        "ready": True,
        "telegram_enabled": False,
        "recovery_configured": False,
    }
    assert secret not in response.text
    assert not respx.calls
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0


@pytest.mark.parametrize("value", ["", "wrong-secret"])
async def test_worker_status_rejects_missing_or_wrong_secret(client, value):
    response = await client.get("/internal/jobs/status", headers={"X-Job-Secret": value})
    assert response.status_code == 401
