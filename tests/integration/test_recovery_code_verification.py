"""Step two checks the real challenge; final reset still owns one-time consumption."""

import asyncio
from uuid import uuid4

import psycopg
import pytest
import respx

from tests.integration import test_password_recovery as base


@pytest.fixture
async def backend(admin, gateway):
    return await base.recovery_backend.__wrapped__(admin, gateway)


def proof(payload):
    return {key: payload[key] for key in ("email", "challenge_id", "otp")}


def wrong_code(payload):
    return "000000" if payload["otp"] != "000000" else "000001"


@respx.mock
async def test_wrong_six_digits_are_rejected_before_password_entry(backend, gateway):
    client, _, _ = backend
    payload = await base.issue(backend, gateway)
    calls = len(respx.calls)
    response = await client.post(
        "/api/v1/auth/recovery/verify", json={**proof(payload), "otp": wrong_code(payload)}
    )
    assert response.status_code == 401 and not response.json().get("verified")
    assert len(respx.calls) == calls
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT state,attempts FROM private.telegram_recovery").fetchone() == (
            "ready",
            1,
        )


@respx.mock
async def test_valid_check_does_not_consume_code_or_expose_provider_proof(backend, gateway):
    client, token, subject = backend
    payload = await base.issue(backend, gateway)
    calls = len(respx.calls)
    for _ in range(2):
        response = await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
        assert response.status_code == 200 and response.json() == {"verified": True}
    assert len(respx.calls) == calls
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT state,attempts,proof_ciphertext<>'' FROM private.telegram_recovery"
        ).fetchone() == ("ready", 0, True)
    update, _ = base.reset_provider(token, subject)
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 200
    assert update.call_count == 1
    assert (
        await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
    ).status_code == 401


@pytest.mark.parametrize(
    "condition", ["expired", "inactive", "banned", "chat", "challenge", "email"]
)
@respx.mock
async def test_stale_or_revoked_proof_never_verifies(backend, gateway, condition):
    client, _, subject = backend
    payload = await base.issue(backend, gateway)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        if condition == "expired":
            db.execute("UPDATE private.telegram_recovery SET expires_at=now()-interval '1 second'")
        elif condition == "inactive":
            db.execute("UPDATE private.memberships SET active=false")
        elif condition == "banned":
            db.execute(
                "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=%s", [subject]
            )
    if condition == "chat":
        client._transport.app.state.settings.telegram_recovery_chat_id = "999999999"
    elif condition == "challenge":
        payload["challenge_id"] = str(uuid4())
    elif condition == "email":
        payload["email"] = "other@example.test"
    calls = len(respx.calls)
    response = await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
    assert response.status_code == 401 and not response.json().get("verified")
    assert len(respx.calls) == calls


@respx.mock
async def test_verify_and_reset_share_the_five_failure_limit(backend, gateway):
    client, _, _ = backend
    payload = await base.issue(backend, gateway)
    wrong = {**payload, "otp": wrong_code(payload)}
    for path in ["verify", "verify", "reset", "reset", "reset"]:
        body = proof(wrong) if path == "verify" else wrong
        assert (await client.post("/api/v1/auth/recovery/" + path, json=body)).status_code == 401
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT state,attempts,code_hash,code_ciphertext,proof_ciphertext FROM private.telegram_recovery"
        ).fetchone() == ("blocked", 5, "", "", "")
    assert (
        await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
    ).status_code == 401
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401


@respx.mock
async def test_concurrent_wrong_checks_are_counted_atomically(backend, gateway):
    client, _, _ = backend
    payload = await base.issue(backend, gateway)
    replies = await asyncio.gather(
        *[
            client.post(
                "/api/v1/auth/recovery/verify", json={**proof(payload), "otp": wrong_code(payload)}
            )
            for _ in range(5)
        ]
    )
    assert all(r.status_code == 401 for r in replies)
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT state,attempts FROM private.telegram_recovery").fetchone() == (
            "blocked",
            5,
        )


@respx.mock
async def test_successful_check_does_not_reset_previous_failures(backend, gateway):
    client, _, _ = backend
    payload = await base.issue(backend, gateway)
    for _ in range(3):
        assert (
            await client.post(
                "/api/v1/auth/recovery/verify", json={**proof(payload), "otp": wrong_code(payload)}
            )
        ).status_code == 401
    assert (
        await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
    ).status_code == 200
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT attempts FROM private.telegram_recovery").fetchone()[0] == 3


@respx.mock
async def test_same_origin_is_required_for_verification(backend, gateway):
    client, _, _ = backend
    payload = await base.issue(backend, gateway)
    assert (
        await client.post(
            "/api/v1/auth/recovery/verify",
            json=proof(payload),
            headers={"Origin": "https://attacker.example"},
        )
    ).status_code == 403


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_verification_function_remains_server_only(gateway, role):
    with psycopg.connect(gateway.dsn) as db:
        assert not db.execute(
            "SELECT has_function_privilege(%s,'private.telegram_recovery_verify(jsonb)','EXECUTE')",
            [role],
        ).fetchone()[0]


@pytest.mark.parametrize("otp", ["12345", "1234567", "abcdef", "１２３４５６"])
@respx.mock
async def test_verification_rejects_invalid_code_shape_without_provider_calls(backend, otp):
    client, _, _ = backend
    response = await client.post(
        "/api/v1/auth/recovery/verify",
        json={"email": base.EMAIL, "challenge_id": str(uuid4()), "otp": otp},
    )
    assert response.status_code == 422 and not respx.calls


@respx.mock
async def test_final_reset_rechecks_code_even_after_successful_verification(backend, gateway):
    client, token, subject = backend
    payload = await base.issue(backend, gateway)
    assert (
        await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
    ).status_code == 200
    calls = len(respx.calls)
    wrong = {**payload, "otp": wrong_code(payload)}
    assert (await client.post("/api/v1/auth/recovery/reset", json=wrong)).status_code == 401
    assert len(respx.calls) == calls
    update, _ = base.reset_provider(token, subject)
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 200
    assert update.call_count == 1


@respx.mock
async def test_code_expiring_after_verification_cannot_reset_password(backend, gateway):
    client, _, _ = backend
    payload = await base.issue(backend, gateway)
    assert (
        await client.post("/api/v1/auth/recovery/verify", json=proof(payload))
    ).status_code == 200
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("UPDATE private.telegram_recovery SET expires_at=now()-interval '1 second'")
    calls = len(respx.calls)
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401
    assert len(respx.calls) == calls
