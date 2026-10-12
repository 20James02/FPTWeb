from uuid import uuid4

import httpx
import psycopg
import respx


async def test_account_page_available_to_sales(admin, gateway):
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.memberships SET permissions=ARRAY['lead.read']")
    response = await admin.get("/admin/account")
    assert response.status_code == 200
    assert "MFA" in response.text and "Mật khẩu hiện tại" in response.text
    assert "Tạo tài khoản nhân viên" not in response.text


@respx.mock
async def test_mfa_enrollment_requires_cookie_csrf_and_owns_factor(admin, gateway):
    app = admin._transport.app
    app.state.settings.supabase_url = "https://test.supabase.co"
    app.state.settings.supabase_auth_key = "publishable-test"
    token = admin.headers.pop("Authorization", None)[7:]
    pair = {"access_token": token, "refresh_token": "private-refresh", "user": {"factors": []}}
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json=pair)
    )
    assert (
        await admin.post(
            "/api/v1/auth/session", json={"email": "owner@example.test", "password": "test"}
        )
    ).status_code == 200
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": app.state.verifier.keys and "fixture",
                "email": "owner@example.test",
                "factors": [],
            },
        )
    )
    fid = str(uuid4())
    route = respx.post("https://test.supabase.co/auth/v1/factors").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": fid,
                "totp": {
                    "qr_code": "<svg/>",
                    "secret": "LOCAL-SECRET",
                    "uri": "otpauth://totp/test",
                },
            },
        )
    )
    assert (
        await admin.post("/api/v1/auth/mfa/enroll", json={"name": "Điện thoại"})
    ).status_code == 403
    assert route.call_count == 0
    admin.headers["X-CSRF-Token"] = admin.cookies["pagefpt_csrf"]
    response = await admin.post("/api/v1/auth/mfa/enroll", json={"name": "Điện thoại"})
    assert response.status_code == 200 and response.json()["id"] == fid
    assert "access_token" not in response.text
    assert (
        await admin.post(f"/api/v1/auth/mfa/{fid}/verify", json={"code": "123456"})
    ).status_code == 404
    with psycopg.connect(gateway.dsn) as db:
        assert "LOCAL-SECRET" not in str(db.execute("SELECT payload FROM private.audit").fetchall())


async def test_last_owner_protected_when_other_actor_edits(admin, gateway):
    owner = str(uuid4())
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.memberships SET permissions=ARRAY['identity.manage']")
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,'00000000-0000-0000-0000-000000000000',ARRAY['*'])",
            [owner],
        )
    response = await admin.put(
        "/api/v1/admin/memberships",
        json={
            "user_id": owner,
            "branch_id": "00000000-0000-0000-0000-000000000000",
            "permissions": [],
            "active": False,
        },
    )
    assert response.status_code == 409 and response.json()["code"] == "LAST_OWNER_REQUIRED"


@respx.mock
async def test_staff_create_checks_privileges_before_auth(admin, gateway):
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.memberships SET permissions=ARRAY['identity.manage']")
    route = respx.post("https://test.supabase.co/auth/v1/admin/users").mock(
        return_value=httpx.Response(200, json={"id": str(uuid4())})
    )
    response = await admin.post(
        "/api/v1/admin/staff",
        json={
            "email": "staff@example.test",
            "password": "initial-strong-password",
            "display_name": "Nhân viên",
            "branch_id": "00000000-0000-0000-0000-000000000000",
            "role": "sales",
        },
    )
    assert response.status_code == 403 and route.call_count == 0


async def test_analytics_zero_days_and_denied_branch(admin):
    response = await admin.get("/api/v1/admin/reports/analytics?start=2026-10-01&end=2026-10-07")
    assert response.status_code == 200
    data = response.json()
    assert len(data["daily"]) == 7 and data["totals"]["leads"] == 0
    assert all(row["leads"] == 0 for row in data["daily"])
    assert (
        await admin.get("/api/v1/admin/reports/analytics?start=2026-01-01&end=2026-10-07")
    ).status_code == 422


async def test_staff_requires_mfa_before_business_access(admin, gateway):
    from pagefpt.modules.identity.service import IdentityService

    with psycopg.connect(gateway.dsn) as db:
        user = db.execute("SELECT user_id FROM private.memberships LIMIT 1").fetchone()[0]
        db.execute("UPDATE private.memberships SET require_mfa=true")
    actor = await IdentityService(gateway).actor_for_subject(str(user), "aal1")
    assert not actor.permits("lead.read")
    assert not actor.permits("identity.manage")
    actor = await IdentityService(gateway).actor_for_subject(str(user), "aal2")
    assert actor.permits("lead.read")


def issue_tokens(admin):
    import json
    import time
    from datetime import UTC, datetime, timedelta

    import jwt
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid="account-test", alg="ES256")
    app = admin._transport.app
    verifier = app.state.verifier
    verifier.keys = {"account-test": jwk}
    verifier.expires = time.monotonic() + 3600
    uid = jwt.decode(admin.headers["Authorization"][7:], options={"verify_signature": False})["sub"]

    def token(aal):
        return jwt.encode(
            {
                "sub": uid,
                "iss": "https://test.supabase.co/auth/v1",
                "aud": "authenticated",
                "iat": datetime.now(UTC),
                "exp": datetime.now(UTC) + timedelta(hours=1),
                "aal": aal,
            },
            key,
            algorithm="ES256",
            headers={"kid": "account-test"},
        )

    app.state.settings.supabase_url = "https://test.supabase.co"
    app.state.settings.supabase_auth_key = "sb_publishable_test"
    return uid, token


async def start_cookie(admin, token):
    admin.headers.pop("Authorization", None)
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": token,
                "refresh_token": "initial-refresh",
                "user": {"factors": []},
            },
        )
    )
    assert (
        await admin.post(
            "/api/v1/auth/session", json={"email": "owner@example.test", "password": "password"}
        )
    ).status_code == 200
    admin.headers["X-CSRF-Token"] = admin.cookies["pagefpt_csrf"]


@respx.mock
async def test_mfa_upgrades_encrypted_session_and_bad_code_can_retry(admin, gateway):
    uid, token = issue_tokens(admin)
    await start_cookie(admin, token("aal1"))
    fid = str(uuid4())
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": uid,
                "email": "owner@example.test",
                "factors": [{"id": fid, "status": "unverified", "factor_type": "totp"}],
            },
        )
    )
    respx.post(f"https://test.supabase.co/auth/v1/factors/{fid}/challenge").mock(
        return_value=httpx.Response(200, json={"id": "challenge"})
    )
    verify = respx.post(f"https://test.supabase.co/auth/v1/factors/{fid}/verify").mock(
        return_value=httpx.Response(400, json={"error_code": "mfa_verification_failed"})
    )
    response = await admin.post(f"/api/v1/auth/mfa/{fid}/verify", json={"code": "000000"})
    assert response.status_code == 422
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT refresh_lease FROM private.admin_sessions").fetchone()[0] is None
    verify.mock(
        return_value=httpx.Response(
            200, json={"access_token": token("aal2"), "refresh_token": "rotated-mfa-refresh"}
        )
    )
    response = await admin.post(f"/api/v1/auth/mfa/{fid}/verify", json={"code": "123456"})
    assert response.status_code == 200 and response.json()["aal"] == "aal2"
    assert "rotated-mfa-refresh" not in response.text
    assert (await admin.get("/api/v1/admin/me")).json()["aal"] == "aal2"
    with psycopg.connect(gateway.dsn) as db:
        saved = db.execute(
            "SELECT tokens_ciphertext,version FROM private.admin_sessions"
        ).fetchone()
        assert "rotated-mfa-refresh" not in saved[0] and saved[1] == 2


@respx.mock
async def test_last_verified_mfa_cannot_be_removed(admin):
    uid, token = issue_tokens(admin)
    await start_cookie(admin, token("aal2"))
    fid = str(uuid4())
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200,
            json={"id": uid, "factors": [{"id": fid, "status": "verified", "factor_type": "totp"}]},
        )
    )
    route = respx.delete(f"https://test.supabase.co/auth/v1/factors/{fid}").mock(
        return_value=httpx.Response(200, json={})
    )
    response = await admin.delete(f"/api/v1/auth/mfa/{fid}")
    assert response.status_code == 409 and route.call_count == 0


@respx.mock
async def test_password_rejection_requires_signin_and_success_revokes_all(admin, gateway):
    uid, token = issue_tokens(admin)
    await start_cookie(admin, token("aal2"))
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200, json={"id": uid, "email": "owner@example.test", "factors": []}
        )
    )
    update = respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(422, json={"error_code": "same_password"})
    )
    logout = respx.post("https://test.supabase.co/auth/v1/logout").mock(
        return_value=httpx.Response(204)
    )
    payload = {"current_password": "password", "password": "new-password-strong", "otp": ""}
    assert (await admin.post("/api/v1/auth/account/password", json=payload)).status_code == 422
    assert (await admin.get("/api/v1/admin/me")).status_code == 401
    with psycopg.connect(gateway.dsn) as db:
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE action='auth.password_changed'"
            ).fetchone()[0]
            == 0
        )
    await start_cookie(admin, token("aal2"))
    update.mock(return_value=httpx.Response(200, json={"id": uid}))
    logout.mock(return_value=httpx.Response(503, json={}))
    response = await admin.post("/api/v1/auth/account/password", json=payload)
    assert response.status_code == 200 and response.json()["provider_revoked"] is False
    assert (await admin.get("/api/v1/admin/me")).status_code == 401
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0
        assert (
            db.execute(
                "SELECT count(*) FROM private.audit WHERE action='auth.password_changed'"
            ).fetchone()[0]
            == 1
        )


@respx.mock
async def test_create_staff_stores_only_profile_and_permissions(admin, gateway):
    from pydantic import SecretStr

    uid, token = issue_tokens(admin)
    admin._transport.app.state.settings.supabase_secret = SecretStr("sb_secret_fixture")
    admin.headers["Authorization"] = "Bearer " + token("aal2")
    staff = str(uuid4())
    provider = respx.post("https://test.supabase.co/auth/v1/admin/users").mock(
        return_value=httpx.Response(200, json={"id": staff})
    )
    response = await admin.post(
        "/api/v1/admin/staff",
        json={
            "email": "staff@example.test",
            "password": "initial-strong-password",
            "display_name": "Nhân viên QA",
            "branch_id": "00000000-0000-0000-0000-000000000000",
            "role": "marketing",
        },
    )
    assert response.status_code == 201, response.text
    assert "initial-strong-password" not in response.text
    assert provider.calls[0].request.headers["apikey"] == "sb_secret_fixture"
    with psycopg.connect(gateway.dsn) as db:
        row = db.execute(
            "SELECT email,permissions,require_mfa FROM private.memberships WHERE user_id=%s",
            [staff],
        ).fetchone()
        assert row == ("staff@example.test", ["marketing.write", "report.read"], True)
        assert "initial-strong-password" not in str(
            db.execute("SELECT payload FROM private.audit").fetchall()
        )


async def test_branch_memberships_and_analytics_are_scoped(admin, gateway):
    import jwt
    from psycopg.types.json import Jsonb

    branch, other = str(uuid4()), str(uuid4())
    uid = jwt.decode(admin.headers["Authorization"][7:], options={"verify_signature": False})["sub"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "UPDATE private.memberships SET branch_id=%s,permissions=ARRAY['report.read','identity.manage'] WHERE user_id=%s",
            [branch, uid],
        )
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions) VALUES(%s,%s,ARRAY['lead.read'])",
            [str(uuid4()), other],
        )
        contact = db.execute(
            "INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES('fixture-hash','encrypted','1') RETURNING id"
        ).fetchone()[0]
        for b, status, at in [
            (branch, "new", "2026-09-30T17:00:00Z"),
            (branch, "installed", "2026-10-01T01:00:00Z"),
            (other, "installed", "2026-10-01T01:00:00Z"),
        ]:
            db.execute(
                "INSERT INTO private.leads(contact_id,branch_id,status,payload,pii_ciphertext,quote_status,created_at,sla_due_at) VALUES(%s,%s,%s,%s,'encrypted','consultation_required',%s,'2026-10-01T00:00:00Z')",
                [
                    contact,
                    b,
                    status,
                    Jsonb(
                        {
                            "attribution": {
                                "last_touch": {"utm_source": "google", "utm_campaign": "qa"}
                            }
                        }
                    ),
                    at,
                ],
            )
    listing = await admin.get("/api/v1/admin/memberships")
    assert listing.status_code == 200 and len(listing.json()["items"]) == 1
    response = await admin.get(
        "/api/v1/admin/reports/analytics?start=2026-10-01&end=2026-10-01&campaign=qa"
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["totals"] == {
        "leads": 2,
        "contacted": 1,
        "qualified": 1,
        "installed": 1,
        "awaiting": 1,
        "overdue": 1,
    }
    assert data["daily"][0]["leads"] == 2
    assert data["sources"][0]["label"] == "google"
    assert "encrypted" not in response.text and "fixture-hash" not in response.text
    assert (
        await admin.get("/api/v1/admin/reports/analytics", params={"branch_id": other})
    ).status_code == 403
    assert (
        await admin.get(
            "/api/v1/admin/reports/analytics?start=2026-10-01&end=2026-10-01&campaign=other"
        )
    ).json()["totals"]["leads"] == 0


@respx.mock
async def test_backup_factor_can_sign_in_and_unknown_factor_is_rejected(admin):
    uid, token = issue_tokens(admin)
    admin.headers.pop("Authorization")
    first, backup = str(uuid4()), str(uuid4())
    pair = {
        "access_token": token("aal1"),
        "refresh_token": "refresh",
        "user": {
            "factors": [
                {
                    "id": first,
                    "factor_type": "totp",
                    "status": "verified",
                    "friendly_name": "Chính",
                },
                {
                    "id": backup,
                    "factor_type": "totp",
                    "status": "verified",
                    "friendly_name": "Dự phòng",
                },
            ]
        },
    }
    respx.post("https://test.supabase.co/auth/v1/token").mock(
        return_value=httpx.Response(200, json=pair)
    )
    main_challenge = respx.post(f"https://test.supabase.co/auth/v1/factors/{first}/challenge").mock(
        return_value=httpx.Response(200, json={"id": "main"})
    )
    backup_challenge = respx.post(
        f"https://test.supabase.co/auth/v1/factors/{backup}/challenge"
    ).mock(return_value=httpx.Response(200, json={"id": "backup"}))
    respx.post(f"https://test.supabase.co/auth/v1/factors/{backup}/verify").mock(
        return_value=httpx.Response(200, json={**pair, "access_token": token("aal2")})
    )
    data = {"email": "owner@example.test", "password": "password"}
    initial = await admin.post("/api/v1/auth/session", json=data)
    assert initial.status_code == 403 and len(initial.json()["fields"]["factors"]) == 2
    assert (
        await admin.post(
            "/api/v1/auth/session", json={**data, "otp": "123456", "factor_id": str(uuid4())}
        )
    ).status_code == 403
    assert (
        await admin.post(
            "/api/v1/auth/session", json={**data, "otp": "123456", "factor_id": backup}
        )
    ).status_code == 200
    assert main_challenge.call_count == 0 and backup_challenge.call_count == 1


async def test_required_mfa_realtime_policy(admin, gateway):
    import jwt

    uid = jwt.decode(admin.headers["Authorization"][7:], options={"verify_signature": False})["sub"]
    with psycopg.connect(gateway.dsn) as db:
        db.execute("UPDATE private.memberships SET require_mfa=true")
        db.execute("SELECT set_config('request.jwt.claim.sub',%s,true)", [uid])
        db.execute("SELECT set_config('request.jwt.claims','{\"aal\":\"aal1\"}',true)")
        assert not db.execute("SELECT private.allowed_topic(%s)", ["user:" + uid]).fetchone()[0]
        db.execute("SELECT set_config('request.jwt.claims','{\"aal\":\"aal2\"}',true)")
        assert db.execute("SELECT private.allowed_topic(%s)", ["user:" + uid]).fetchone()[0]
        assert not db.execute(
            "SELECT private.allowed_topic(%s)", ["user:" + str(uuid4())]
        ).fetchone()[0]


@respx.mock
async def test_password_db_failure_happens_before_provider_mutation(admin, monkeypatch):
    from pagefpt.core.errors import DomainError

    uid, token = issue_tokens(admin)
    await start_cookie(admin, token("aal2"))
    app = admin._transport.app
    original = app.state.db.rpc

    async def fail_revoke(name, payload, actor_token=None):
        if payload.get("command", {}).get("op") == "account_revoke_sessions":
            raise DomainError("DB_UNAVAILABLE", 503)
        return await original(name, payload, actor_token)

    monkeypatch.setattr(app.state.db, "rpc", fail_revoke)
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200, json={"id": uid, "email": "owner@example.test", "factors": []}
        )
    )
    update = respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json={"id": uid})
    )
    response = await admin.post(
        "/api/v1/auth/account/password",
        json={"current_password": "password", "password": "strong-new-password"},
    )
    assert response.status_code == 503 and update.call_count == 0


async def test_staff_search_pagination_and_optimistic_version(admin, gateway):
    with psycopg.connect(gateway.dsn) as db:
        db.execute(
            "INSERT INTO private.memberships(user_id,branch_id,permissions,display_name,email) SELECT gen_random_uuid(),'00000000-0000-0000-0000-000000000000',ARRAY['lead.read'],'Nhân viên '||i,'qa-'||i||'@example.test' FROM generate_series(1,55) i"
        )
    first = await admin.get("/api/v1/admin/staff?q=qa-")
    assert len(first.json()["items"]) == 50 and first.json()["next_offset"] == 50
    second = await admin.get("/api/v1/admin/staff?q=qa-&offset=50")
    assert len(second.json()["items"]) == 5 and second.json()["next_offset"] is None
    row = first.json()["items"][0]
    payload = {
        "user_id": row["user_id"],
        "branch_id": row["branch_id"],
        "expected_version": row["version"],
        "display_name": "Tên đã sửa",
        "permissions": row["permissions"],
        "active": True,
    }
    assert (await admin.put("/api/v1/admin/memberships", json=payload)).status_code == 200
    stale = await admin.put("/api/v1/admin/memberships", json=payload)
    assert stale.status_code == 409 and stale.json()["code"] == "VERSION_CONFLICT"


@respx.mock
async def test_password_change_fences_concurrent_and_delayed_login(admin, gateway):
    from datetime import UTC, datetime

    uid, token = issue_tokens(admin)
    await start_cookie(admin, token("aal2"))
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200, json={"id": uid, "email": "owner@example.test", "factors": []}
        )
    )
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(204))
    started_before_change = datetime.now(UTC).isoformat()
    concurrent_status = []

    async def update_provider(request):
        async with httpx.AsyncClient(
            transport=admin._transport, base_url="http://test"
        ) as concurrent:
            response = await concurrent.post(
                "/api/v1/auth/session",
                json={"email": "owner@example.test", "password": "old-password"},
            )
            concurrent_status.append(response.status_code)
            assert (await concurrent.get("/api/v1/admin/me")).status_code == 401
        return httpx.Response(200, json={"id": uid})

    respx.put("https://test.supabase.co/auth/v1/user").mock(side_effect=update_provider)
    response = await admin.post(
        "/api/v1/auth/account/password",
        json={"current_password": "password", "password": "new-password-strong"},
    )
    assert response.status_code == 200 and concurrent_status == [503]
    # A provider response obtained during the change must also be rejected if
    # its SQL session insertion arrives after the successful fence release.
    with psycopg.connect(gateway.dsn) as db:
        delayed = db.execute(
            "SELECT api.dispatch(%s::jsonb)",
            [
                __import__("json").dumps(
                    {
                        "op": "admin_session_create",
                        "subject": uid,
                        "login_started_at": started_before_change,
                    }
                )
            ],
        ).fetchone()[0]
        assert delayed["status"] == 503
        assert db.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0
    await start_cookie(admin, token("aal2"))
    assert (await admin.get("/api/v1/admin/me")).status_code == 200


@respx.mock
async def test_password_release_failure_keeps_fence_without_false_failure(
    admin, gateway, monkeypatch
):
    from pagefpt.core.errors import DomainError

    uid, token = issue_tokens(admin)
    await start_cookie(admin, token("aal2"))
    app = admin._transport.app
    original = app.state.db.rpc

    async def fail_release(name, payload, actor_token=None):
        if payload.get("command", {}).get("op") == "account_lock_release":
            raise DomainError("DB_UNAVAILABLE", 503)
        return await original(name, payload, actor_token)

    monkeypatch.setattr(app.state.db, "rpc", fail_release)
    respx.get("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(
            200, json={"id": uid, "email": "owner@example.test", "factors": []}
        )
    )
    respx.put("https://test.supabase.co/auth/v1/user").mock(
        return_value=httpx.Response(200, json={"id": uid})
    )
    respx.post("https://test.supabase.co/auth/v1/logout").mock(return_value=httpx.Response(204))
    response = await admin.post(
        "/api/v1/auth/account/password",
        json={"current_password": "password", "password": "new-password-strong"},
    )
    assert response.status_code == 200 and response.json()["changed"]
    response = await admin.post(
        "/api/v1/auth/session",
        json={"email": "owner@example.test", "password": "new-password-strong"},
    )
    assert response.status_code == 503
    with psycopg.connect(gateway.dsn) as db:
        assert db.execute("SELECT count(*) FROM private.admin_sessions").fetchone()[0] == 0
        assert db.execute(
            "SELECT revoked_before>now() FROM private.account_operation_locks WHERE subject=%s",
            [uid],
        ).fetchone()[0]
