"""Telegram recovery: real SQL, HTTP doubles only for Telegram and Supabase."""

import asyncio
import json
from uuid import uuid4

import httpx
import jwt
import psycopg
import pytest
import respx
from pydantic import SecretStr

from pagefpt.core.crypto import Crypto
from pagefpt.modules.workflow.worker import Worker

EMAIL = "admin@example.com"
BOT = "123456789:" + "a" * 35
URL = "https://test.supabase.co/auth/v1/"
CRYPT = Crypto("e" * 32, "m" * 32, "t" * 32)


@pytest.fixture
async def recovery_backend(admin, gateway):
    app = admin._transport.app
    s = app.state.settings
    s.supabase_url = "https://test.supabase.co"
    s.supabase_auth_key = "sb_publishable_test"
    s.supabase_secret = SecretStr("sb_secret_test")
    s.telegram_enabled = True
    s.telegram_bot_token = SecretStr(BOT)
    s.telegram_chat_id = "-999999"
    s.telegram_recovery_accounts = {EMAIL: "123456789"}
    token = admin.headers.pop("Authorization")[7:]
    subject = jwt.decode(token, options={"verify_signature": False})["sub"]
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("INSERT INTO auth.users(id,email) VALUES(%s,%s)", [subject, EMAIL])
    return admin, token, subject


def generate_response(subject):
    return {
        "id": subject,
        "email": EMAIL,
        "hashed_token": "a" * 64,
        "email_otp": "87654321",
        "action_link": URL + "verify?token=" + "a" * 64 + "&type=recovery",
        "verification_type": "recovery",
    }


async def issue(backend, gateway):
    client, _, subject = backend

    def generated(request):
        assert request.headers["Authorization"] == "Bearer sb_secret_test"
        assert json.loads(request.content) == {"type": "recovery", "email": EMAIL}
        return httpx.Response(200, json=generate_response(subject))

    respx.post(URL + "admin/generate_link").mock(side_effect=generated)
    r = await client.post("/api/v1/auth/recovery", json={"email": EMAIL})
    assert r.status_code == 202, r.text
    assert "challenge_id" in r.json(), (
        "Recovery must create a server challenge for the private Telegram code"
    )
    with psycopg.connect(gateway.dsn) as db:
        row = db.execute(
            "SELECT code_ciphertext FROM private.telegram_recovery WHERE id=%s",
            [r.json()["challenge_id"]],
        ).fetchone()
    return {
        "email": EMAIL,
        "challenge_id": r.json()["challenge_id"],
        "otp": CRYPT.decrypt(row[0]),
        "password": "QA-new-password-123",
        "totp": "",
    }


def reset_provider(token, subject, mfa=False):
    factors = (
        [
            {
                "id": "e69808c7-760e-4e1a-9a1b-bee4ea891443",
                "factor_type": "totp",
                "status": "verified",
            }
        ]
        if mfa
        else []
    )
    pair = {"access_token": token, "user": {"id": subject, "factors": factors}}

    def verify(request):
        assert json.loads(request.content) == {"token_hash": "a" * 64, "type": "recovery"}
        return httpx.Response(200, json=pair)

    respx.post(URL + "verify").mock(side_effect=verify)
    update = respx.put(URL + "user").mock(return_value=httpx.Response(200, json={"id": subject}))
    respx.post(URL + "logout").mock(return_value=httpx.Response(204))
    return update, pair


@respx.mock
async def test_code_delivered_only_to_bound_private_chat_without_link_or_provider_proof(
    recovery_backend, gateway
):
    payload = await issue(recovery_backend, gateway)
    client, _, _ = recovery_backend
    app = client._transport.app

    def sent(request):
        data = json.loads(request.content)
        assert data["chat_id"] == "123456789"
        assert (
            payload["otp"] in data["text"] and len(payload["otp"]) == 6 and payload["otp"].isascii()
        )
        assert "reply_markup" not in data and "http" not in data["text"]
        for secret in [EMAIL, "a" * 64, "87654321", payload["password"]]:
            assert secret not in request.content.decode()
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 123}})

    respx.post("https://api.telegram.org/bot" + BOT + "/sendMessage").mock(side_effect=sent)
    worker = Worker(gateway, CRYPT, telegram=app.state.telegram)
    assert (await worker.process("notifications"))["completed"] == 1
    with psycopg.connect(gateway.dsn) as db:
        jobs = db.execute("SELECT job_command,result FROM private.jobs").fetchall()
        row = db.execute("SELECT code_ciphertext FROM private.telegram_recovery").fetchone()
    assert payload["otp"] not in json.dumps(jobs, default=str)
    assert row[0] == ""  # clear ciphertext after delivery; HMAC remains for validation


@respx.mock
async def test_valid_code_changes_password_once_and_revokes_bff_sessions(recovery_backend, gateway):
    client, token, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    pair = {
        "access_token": token,
        "refresh_token": "private-refresh",
        "user": {"id": subject, "factors": []},
    }
    respx.post(URL + "token").mock(return_value=httpx.Response(200, json=pair))
    assert (
        await client.post("/api/v1/auth/session", json={"email": EMAIL, "password": "old"})
    ).status_code == 200
    update, _ = reset_provider(token, subject)
    r = await client.post("/api/v1/auth/recovery/reset", json=payload)
    assert r.status_code == 200, r.text
    assert r.json() == {"changed": True, "provider_revoked": True}
    assert (await client.get("/api/v1/admin/me")).status_code == 401
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401
    assert update.call_count == 1
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE action='auth.password_recovered'"
            ).fetchone()[0]
            == 1
        )
        assert db.execute(
            "SELECT proof_ciphertext,code_ciphertext FROM private.telegram_recovery"
        ).fetchone() == ("", "")


@respx.mock
async def test_five_wrong_codes_lock_challenge_even_when_correct_code_follows(
    recovery_backend, gateway
):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    wrong = "000000" if payload["otp"] != "000000" else "000001"
    for _ in range(5):
        assert (
            await client.post("/api/v1/auth/recovery/reset", json={**payload, "otp": wrong})
        ).status_code == 401
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401


@respx.mock
async def test_expired_code_and_expired_queue_job_cannot_be_used_or_sent(recovery_backend, gateway):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("UPDATE private.telegram_recovery SET expires_at=now()-interval '1 second'")
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401
    worker = Worker(gateway, CRYPT, telegram=client._transport.app.state.telegram)
    assert (await worker.process("notifications"))["completed"] == 1  # no outbound send


@respx.mock
async def test_resend_cooldown_and_old_challenge_invalidation(recovery_backend, gateway):
    client, _, _ = recovery_backend
    first = await issue(recovery_backend, gateway)
    assert (await client.post("/api/v1/auth/recovery", json={"email": EMAIL})).status_code == 429
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("UPDATE private.telegram_recovery SET created_at=now()-interval '61 seconds'")
        db.execute(
            "UPDATE private.rate_buckets SET updated_at=now()-interval '61 seconds' WHERE key LIKE 'telegram-recovery-send:%'"
        )
    second = await issue(recovery_backend, gateway)
    assert first["challenge_id"] != second["challenge_id"]
    assert (await client.post("/api/v1/auth/recovery/reset", json=first)).status_code == 401
    token, subject = recovery_backend[1:]
    reset_provider(token, subject)
    assert (await client.post("/api/v1/auth/recovery/reset", json=second)).status_code == 200


@respx.mock
async def test_concurrent_valid_resets_only_write_one_password(recovery_backend, gateway):
    client, token, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    update, _ = reset_provider(token, subject)
    results = await asyncio.gather(
        *[client.post("/api/v1/auth/recovery/reset", json=payload) for _ in range(2)]
    )
    assert sorted(r.status_code for r in results) == [200, 401]
    assert update.call_count == 1


@respx.mock
async def test_unknown_unbound_email_is_generic_and_sends_nothing(recovery_backend, gateway):
    client, _, _ = recovery_backend
    r = await client.post("/api/v1/auth/recovery", json={"email": "missing@example.test"})
    assert r.status_code == 202 and r.json()["accepted"] is True
    assert "challenge_id" in r.json()
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.telegram_recovery").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0
    assert not respx.calls


@pytest.mark.parametrize("condition", ["missing", "inactive", "deleted", "banned", "changed_email"])
@respx.mock
async def test_bound_ineligible_account_never_creates_provider_proof_or_code(
    recovery_backend, gateway, condition
):
    client, _, subject = recovery_backend
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        if condition == "missing":
            db.execute("DELETE FROM auth.users WHERE id=%s", [subject])
        elif condition == "inactive":
            db.execute("UPDATE private.memberships SET active=false WHERE user_id=%s", [subject])
        elif condition == "deleted":
            db.execute("UPDATE auth.users SET deleted_at=now() WHERE id=%s", [subject])
        elif condition == "banned":
            db.execute(
                "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=%s", [subject]
            )
        else:
            db.execute("UPDATE auth.users SET email='changed@example.test' WHERE id=%s", [subject])
    generated = respx.post(URL + "admin/generate_link").mock(
        return_value=httpx.Response(200, json=generate_response(subject))
    )
    response = await client.post("/api/v1/auth/recovery", json={"email": EMAIL})
    assert response.status_code == 202
    assert response.json()["accepted"] is True and response.json()["challenge_id"]
    assert not generated.called
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.telegram_recovery").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0


@respx.mock
async def test_generate_cannot_substitute_another_active_admin(recovery_backend, gateway):
    client, _, _ = recovery_backend
    other = str(uuid4())
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) "
            "VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['*'])",
            [other],
        )
    respx.post(URL + "admin/generate_link").mock(
        return_value=httpx.Response(200, json=generate_response(other))
    )
    response = await client.post("/api/v1/auth/recovery", json={"email": EMAIL})
    assert response.status_code == 503
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0


@respx.mock
async def test_account_banned_during_provider_call_never_queues_code(recovery_backend, gateway):
    client, _, subject = recovery_backend

    def generated(request):
        with psycopg.connect(gateway.dsn, autocommit=True) as db:
            db.execute(
                "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=%s", [subject]
            )
        return httpx.Response(200, json=generate_response(subject))

    respx.post(URL + "admin/generate_link").mock(side_effect=generated)
    response = await client.post("/api/v1/auth/recovery", json={"email": EMAIL})
    assert response.status_code == 202
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0
        assert db.execute(
            "SELECT state,code_ciphertext,proof_ciphertext FROM private.telegram_recovery"
        ).fetchone() == ("cancelled", "", "")


@pytest.mark.parametrize("condition", ["missing", "banned"])
@respx.mock
async def test_provider_account_revoked_after_issue_cannot_receive_or_use_code(
    recovery_backend, gateway, condition
):
    client, _, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        if condition == "missing":
            db.execute("DELETE FROM auth.users WHERE id=%s", [subject])
        else:
            db.execute(
                "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=%s", [subject]
            )
    calls = len(respx.calls)
    worker = Worker(gateway, CRYPT, telegram=client._transport.app.state.telegram)
    assert (await worker.process("notifications"))["completed"] == 1
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401
    assert len(respx.calls) == calls
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute(
            "SELECT state,code_ciphertext,proof_ciphertext FROM private.telegram_recovery"
        ).fetchone() == ("cancelled", "", "")


@respx.mock
async def test_banned_account_cannot_reset_even_before_delivery(recovery_backend, gateway):
    client, _, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute(
            "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=%s", [subject]
        )
    calls = len(respx.calls)
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401
    assert len(respx.calls) == calls


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_recovery_lookup_not_executable_by_browser_roles(gateway, role):
    with psycopg.connect(gateway.dsn) as db:
        for function in ["private.recovery_subject(text,uuid)", "api.dispatch(jsonb)"]:
            assert (
                db.execute(
                    "SELECT has_function_privilege(%s,%s,'EXECUTE')", [role, function]
                ).fetchone()[0]
                is False
            )
        assert (
            db.execute("SELECT has_table_privilege(%s,'auth.users','SELECT')", [role]).fetchone()[0]
            is False
        )


@respx.mock
async def test_challenge_cannot_be_used_for_another_email(recovery_backend, gateway):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    r = await client.post(
        "/api/v1/auth/recovery/reset", json={**payload, "email": "another@example.test"}
    )
    assert r.status_code == 401


@respx.mock
@pytest.mark.parametrize(
    "code",
    [
        "12345",
        "1234567",
        "12345678",
        "abcdef",
        "１２３４５６",
        "https://test.supabase.co/auth/v1/verify",
    ],
)
async def test_only_six_ascii_digits_are_accepted(recovery_backend, gateway, code):
    client, _, _ = recovery_backend
    r = await client.post(
        "/api/v1/auth/recovery/reset",
        json={
            "email": EMAIL,
            "challenge_id": str(uuid4()),
            "otp": code,
            "password": "valid-password-123",
        },
    )
    assert r.status_code == 422 and not respx.calls


@respx.mock
async def test_cross_origin_and_old_link_contract_are_rejected(recovery_backend):
    client, _, _ = recovery_backend
    assert (
        await client.post(
            "/api/v1/auth/recovery",
            json={"email": EMAIL},
            headers={"Origin": "https://evil.example"},
        )
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/auth/recovery/reset",
            json={
                "email": EMAIL,
                "recovery_link": URL + "verify?token=x",
                "password": "valid-password",
            },
        )
    ).status_code == 422


@respx.mock
async def test_revoked_member_cannot_receive_or_use_recovery(recovery_backend, gateway):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("UPDATE private.memberships SET active=false")
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 403
    assert (
        await Worker(gateway, CRYPT, telegram=client._transport.app.state.telegram).process(
            "notifications"
        )
    )["completed"] == 1


@respx.mock
@pytest.mark.parametrize("code,expected", [("", 403), ("654321", 401), ("123456", 200)])
@pytest.mark.parametrize("shared", [False, True])
async def test_mfa_required_and_verified_before_password_write(
    recovery_backend, gateway, code, expected, shared
):
    client, token, subject = recovery_backend
    if shared:
        client._transport.app.state.settings.telegram_recovery_chat_id = "222222222"
    payload = await issue(recovery_backend, gateway)
    update, pair = reset_provider(token, subject, mfa=True)
    factor = URL + "factors/e69808c7-760e-4e1a-9a1b-bee4ea891443"
    respx.post(factor + "/challenge").mock(
        return_value=httpx.Response(200, json={"id": "challenge"})
    )

    def mfa(request):
        assert json.loads(request.content) == {"challenge_id": "challenge", "code": code}
        return httpx.Response(200, json=pair) if code == "123456" else httpx.Response(400, json={})

    respx.post(factor + "/verify").mock(side_effect=mfa)
    r = await client.post("/api/v1/auth/recovery/reset", json={**payload, "totp": code})
    assert r.status_code == expected and update.call_count == (1 if expected == 200 else 0)


@respx.mock
@pytest.mark.parametrize("status,expected", [(400, 401), (429, 429), (500, 503)])
async def test_provider_rejection_does_not_write_password(
    recovery_backend, gateway, status, expected
):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    respx.post(URL + "verify").mock(return_value=httpx.Response(status, json={}))
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == expected


@respx.mock
async def test_provider_subject_must_match_challenge(recovery_backend, gateway):
    client, token, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        other = str(uuid4())
        db.execute("INSERT INTO auth.users(id,email) VALUES(%s,'other@example.test')", [other])
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['*'])",
            [other],
        )
        db.execute("UPDATE private.telegram_recovery SET subject=%s", [other])
    verify = respx.post(URL + "verify").mock(
        return_value=httpx.Response(200, json={"access_token": token, "user": {}})
    )
    update = respx.put(URL + "user").mock(return_value=httpx.Response(200, json={}))
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401
    assert verify.called and not update.called


@respx.mock
async def test_telegram_failure_retries_but_does_not_deliver_stale_resend(
    recovery_backend, gateway
):
    client, _, _ = recovery_backend
    first = await issue(recovery_backend, gateway)
    respx.post("https://api.telegram.org/bot" + BOT + "/sendMessage").mock(
        return_value=httpx.Response(503, json={})
    )
    worker = Worker(gateway, CRYPT, telegram=client._transport.app.state.telegram)
    assert (await worker.process("notifications"))["retried"] == 1
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("UPDATE private.telegram_recovery SET created_at=now()-interval '61 seconds'")
        db.execute(
            "UPDATE private.rate_buckets SET updated_at=now()-interval '61 seconds' WHERE key LIKE 'telegram-recovery-send:%'"
        )
        db.execute("UPDATE private.jobs SET next_attempt_at=now()")
        db.execute("UPDATE pgmq.q_notifications SET vt=now()")
    second = await issue(recovery_backend, gateway)
    sent = []

    def delivered(request):
        sent.append(json.loads(request.content)["text"])
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 123}})

    respx.post("https://api.telegram.org/bot" + BOT + "/sendMessage").mock(side_effect=delivered)
    assert (await worker.process("notifications"))["completed"] == 2
    assert len(sent) == 1 and second["otp"] in sent[0]
    assert first["challenge_id"] != second["challenge_id"]


@respx.mock
@pytest.mark.parametrize(
    "operation,writes", [("auth_recovery_revoke_sessions", 0), ("auth_recovery_complete", 1)]
)
async def test_database_failure_never_leaves_changed_password_with_old_sessions(
    recovery_backend, gateway, monkeypatch, operation, writes
):
    from pagefpt.core.errors import DomainError

    client, token, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    respx.post(URL + "token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": token,
                "refresh_token": "private-refresh",
                "user": {"id": subject, "factors": []},
            },
        )
    )
    assert (
        await client.post("/api/v1/auth/session", json={"email": EMAIL, "password": "old"})
    ).status_code == 200
    original = gateway.rpc

    async def failing(name, payload, actor_token=None):
        if payload.get("command", payload).get("op") == operation:
            raise DomainError("DATABASE_UNAVAILABLE", 503)
        return await original(name, payload, actor_token)

    monkeypatch.setattr(gateway, "rpc", failing)
    update, _ = reset_provider(token, subject)
    r = await client.post("/api/v1/auth/recovery/reset", json=payload)
    assert r.status_code == 503 and update.call_count == writes
    with psycopg.connect(gateway.dsn) as db:
        count = db.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0]
    assert count == (0 if writes else 1)


@respx.mock
@pytest.mark.parametrize("pair", [{}, [], {"access_token": 123, "user": {}}, {"user": None}])
async def test_malformed_verify_payload_fails_closed(recovery_backend, gateway, pair):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    respx.post(URL + "verify").mock(return_value=httpx.Response(200, json=pair))
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 503


@respx.mock
@pytest.mark.parametrize("error", ["weak_password", "same_password", "password_too_short"])
async def test_password_policy_rejection_never_reports_success(recovery_backend, gateway, error):
    client, token, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    reset_provider(token, subject)
    respx.put(URL + "user").mock(return_value=httpx.Response(422, json={"error_code": error}))
    r = await client.post("/api/v1/auth/recovery/reset", json=payload)
    assert r.status_code == 422 and r.json()["code"] == "PASSWORD_REJECTED"
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE action='auth.password_recovered'"
            ).fetchone()[0]
            == 0
        )


@respx.mock
async def test_private_binding_change_invalidates_existing_code(recovery_backend, gateway):
    client, _, _ = recovery_backend
    payload = await issue(recovery_backend, gateway)
    client._transport.app.state.settings.telegram_recovery_accounts = {EMAIL: "222222222"}
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401


@respx.mock
async def test_leading_zero_code_survives_delivery_and_reset(
    recovery_backend, gateway, monkeypatch
):
    import pagefpt.modules.identity.recovery as recovery

    monkeypatch.setattr(recovery.secrets, "randbelow", lambda maximum: 7)
    payload = await issue(recovery_backend, gateway)
    assert payload["otp"] == "000007"
    client, token, subject = recovery_backend
    reset_provider(token, subject)
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 200


@respx.mock
async def test_low_aal_after_mfa_cannot_change_password(recovery_backend, gateway, monkeypatch):
    client, token, subject = recovery_backend
    payload = await issue(recovery_backend, gateway)
    app = client._transport.app
    original = app.state.verifier.verify

    async def low_aal(value):
        return {**await original(value), "aal": "aal1"}

    monkeypatch.setattr(app.state.verifier, "verify", low_aal)
    update, pair = reset_provider(token, subject, mfa=True)
    factor = URL + "factors/e69808c7-760e-4e1a-9a1b-bee4ea891443"
    respx.post(factor + "/challenge").mock(
        return_value=httpx.Response(200, json={"id": "challenge"})
    )
    respx.post(factor + "/verify").mock(return_value=httpx.Response(200, json=pair))
    assert (
        await client.post("/api/v1/auth/recovery/reset", json={**payload, "totp": "123456"})
    ).status_code == 403
    assert update.call_count == 0


@respx.mock
async def test_generate_timeout_never_queues_or_advances_success(recovery_backend, gateway):
    client, _, _ = recovery_backend
    respx.post(URL + "admin/generate_link").mock(side_effect=httpx.ReadTimeout("Synthetic timeout"))
    r = await client.post("/api/v1/auth/recovery", json={"email": EMAIL})
    assert r.status_code == 503 and not r.json().get("accepted")
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0


@respx.mock
async def test_ambiguous_telegram_send_does_not_replay_code(recovery_backend, gateway):
    client, _, _ = recovery_backend
    await issue(recovery_backend, gateway)
    respx.post("https://api.telegram.org/bot" + BOT + "/sendMessage").mock(
        side_effect=httpx.ReadTimeout("Synthetic timeout")
    )
    worker = Worker(gateway, CRYPT, telegram=client._transport.app.state.telegram)
    assert (await worker.process("notifications"))["completed"] == 1
    assert (await worker.process("notifications"))["claimed"] == 0
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT state FROM private.deliveries WHERE platform='telegram_recovery'"
            ).fetchone()[0]
            == "unknown"
        )
        assert (
            db.execute("SELECT code_ciphertext FROM private.telegram_recovery").fetchone()[0] == ""
        )


@respx.mock
async def test_concurrent_request_only_generates_one_challenge(recovery_backend, gateway):
    client, _, subject = recovery_backend
    respx.post(URL + "admin/generate_link").mock(
        return_value=httpx.Response(200, json=generate_response(subject))
    )
    results = await asyncio.gather(
        *[client.post("/api/v1/auth/recovery", json={"email": EMAIL}) for _ in range(2)]
    )
    assert sorted(r.status_code for r in results) == [202, 429]
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.telegram_recovery").fetchone()[0] == 1
        assert (
            db.execute(
                "SELECT count(*) FROM private.jobs WHERE kind='telegram_recovery'"
            ).fetchone()[0]
            == 1
        )


@respx.mock
async def test_any_active_staff_recovers_via_shared_chat_without_email_binding(
    recovery_backend, gateway
):
    from datetime import UTC, datetime, timedelta

    from cryptography.hazmat.primitives.asymmetric import ec

    client, _, _ = recovery_backend
    app = client._transport.app
    app.state.settings.telegram_recovery_accounts = {}
    object.__setattr__(app.state.settings, "telegram_recovery_chat_id", "222222222")
    staff, email = str(uuid4()), "staff@example.test"
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        db.execute("INSERT INTO auth.users(id,email) VALUES(%s,%s)", [staff, email])
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) "
            "VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['lead.read','lead.write'])",
            [staff],
        )
    generated = {**generate_response(staff), "email": email}
    respx.post(URL + "admin/generate_link").mock(return_value=httpx.Response(200, json=generated))
    response = await client.post("/api/v1/auth/recovery", json={"email": email.upper()})
    assert response.status_code == 202, response.text
    challenge = response.json()["challenge_id"]
    with psycopg.connect(gateway.dsn) as db:
        row = db.execute(
            "SELECT code_ciphertext,chat_id FROM private.telegram_recovery WHERE id=%s", [challenge]
        ).fetchone()
    code = CRYPT.decrypt(row[0])
    assert row[1] == "222222222"

    def delivered(request):
        body = json.loads(request.content)
        assert body["chat_id"] == "222222222" and body["protect_content"]
        assert code in body["text"] and challenge[-8:].upper() in body["text"]
        assert (
            email not in body["text"] and EMAIL not in body["text"] and "a" * 64 not in body["text"]
        )
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 456}})

    sent = respx.post("https://api.telegram.org/bot" + BOT + "/sendMessage").mock(
        side_effect=delivered
    )
    assert (await Worker(gateway, CRYPT, telegram=app.state.telegram).process("notifications"))[
        "completed"
    ] == 1
    assert sent.called
    key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid="staff-test", alg="ES256")
    app.state.verifier.keys["staff-test"] = jwk
    token = jwt.encode(
        {
            "sub": staff,
            "iss": "https://test.supabase.co/auth/v1",
            "aud": "authenticated",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=10),
            "aal": "aal1",
        },
        key,
        algorithm="ES256",
        headers={"kid": "staff-test"},
    )
    update, _ = reset_provider(token, staff)
    payload = {
        "email": email,
        "challenge_id": challenge,
        "otp": code,
        "password": "QA-new-staff-password-123",
    }
    calls = len(respx.calls)
    assert (
        await client.post("/api/v1/auth/recovery/reset", json={**payload, "email": EMAIL})
    ).status_code == 401
    assert len(respx.calls) == calls
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 200
    assert update.call_count == 1
    assert (await client.post("/api/v1/auth/recovery/reset", json=payload)).status_code == 401


@pytest.mark.parametrize("condition", ["missing", "banned", "inactive"])
@respx.mock
async def test_shared_chat_does_not_generate_for_ineligible_email(
    recovery_backend, gateway, condition
):
    client, _, subject = recovery_backend
    client._transport.app.state.settings.telegram_recovery_accounts = {}
    object.__setattr__(
        client._transport.app.state.settings, "telegram_recovery_chat_id", "222222222"
    )
    with psycopg.connect(gateway.dsn, autocommit=True) as db:
        if condition == "missing":
            db.execute("DELETE FROM auth.users WHERE id=%s", [subject])
        elif condition == "banned":
            db.execute(
                "UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=%s", [subject]
            )
        else:
            db.execute("UPDATE private.memberships SET active=false WHERE user_id=%s", [subject])
    response = await client.post("/api/v1/auth/recovery", json={"email": EMAIL})
    assert response.status_code == 202 and response.json()["accepted"]
    assert not respx.calls
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.telegram_recovery").fetchone()[0] == 0
        assert db.execute("SELECT count(*) FROM private.jobs").fetchone()[0] == 0


@pytest.mark.parametrize("chat", ["-12345", "0", "@group", "abcdef"])
def test_shared_recovery_setting_rejects_non_private_chat(chat):
    from pagefpt.core.config import Settings

    with pytest.raises(ValueError, match="Shared recovery requires a private"):
        Settings(
            _env_file=None,
            telegram_enabled=True,
            telegram_bot_token=SecretStr(BOT),
            telegram_chat_id="-999999",
            telegram_admin_origin="https://admin.example.test",
            telegram_recovery_chat_id=chat,
        )


def test_shared_recipient_overrides_all_legacy_bindings():
    from pagefpt.core.config import Settings

    settings = Settings(
        _env_file=None,
        telegram_enabled=True,
        telegram_bot_token=SecretStr(BOT),
        telegram_chat_id="-999999",
        telegram_admin_origin="https://admin.example.test",
        telegram_recovery_chat_id="222222222",
        telegram_recovery_accounts={EMAIL: "123456789"},
    )
    assert settings.recovery_chat_for(EMAIL) == "222222222"
    assert settings.recovery_chat_for("future-staff@example.test") == "222222222"
    assert settings.recovery_chat_ids == {"222222222"}


@respx.mock
async def test_shared_mode_will_not_deliver_legacy_queued_recipient(recovery_backend):
    from datetime import UTC, datetime, timedelta

    client, _, _ = recovery_backend
    app = client._transport.app
    app.state.settings.telegram_recovery_chat_id = "222222222"
    result = await app.state.telegram.deliver(
        {
            "kind": "recovery_code",
            "code": "123456",
            "chat_id": "123456789",
            "expires_at": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
        }
    )
    assert result.code == "RECOVERY_UNCONFIGURED" and not respx.calls


async def test_shared_chat_alone_is_visible_to_readonly_worker_probe(recovery_backend):
    client, _, _ = recovery_backend
    client._transport.app.state.settings.telegram_recovery_chat_id = "222222222"
    client._transport.app.state.settings.telegram_recovery_accounts = {}
    response = await client.get("/internal/jobs/status", headers={"X-Job-Secret": "j" * 32})
    assert response.status_code == 200 and response.json()["recovery_configured"] is True
    assert response.json().get("recovery_shared") is True
