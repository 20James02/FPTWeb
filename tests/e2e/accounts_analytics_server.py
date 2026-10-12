"""Isolated account/MFA provider fixture; all identities and records are synthetic."""

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import jwt
import psycopg
from psycopg.types.json import Jsonb

from tests.e2e import integrated_server as original
from tests.e2e.client_release_server import app
from tests.e2e.server import _dsn, fixture_branch

_fallback_auth = original.auth_http

users = {
    original.SUBJECT: {
        "id": original.SUBJECT,
        "email": "qa-admin@example.test",
        "password": "qa-only-password",
        "factors": [
            {
                "id": original.FACTOR,
                "factor_type": "totp",
                "status": "verified",
                "friendly_name": "Điện thoại QA",
            }
        ],
    }
}


def issue(uid, aal):
    return jwt.encode(
        {
            "sub": uid,
            "iss": app.state.settings.supabase_url + "/auth/v1",
            "aud": "authenticated",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(hours=1),
            "aal": aal,
        },
        original._key,
        algorithm="ES256",
        headers={"kid": "browser-test"},
    )


def pair(uid, aal):
    return {
        "access_token": issue(uid, aal),
        "refresh_token": "fixture-refresh",
        "user": {"id": uid, "email": users[uid]["email"], "factors": users[uid]["factors"]},
    }


def auth(request):
    data = json.loads(request.content or b"{}")
    path = request.url.path
    if path.endswith("/token"):
        user = next(
            (
                u
                for u in users.values()
                if u["email"] == data.get("email") and u["password"] == data.get("password")
            ),
            None,
        )
        if not user:
            return httpx.Response(400, json={"error_code": "invalid_credentials"})
        return httpx.Response(200, json=pair(user["id"], "aal1"))
    if path.endswith("/admin/users") and request.method == "POST":
        if any(u["email"] == data["email"] for u in users.values()):
            return httpx.Response(422, json={"error_code": "email_exists"})
        uid = str(uuid4())
        users[uid] = {
            "id": uid,
            "email": data["email"],
            "password": data["password"],
            "factors": [],
        }
        return httpx.Response(200, json={"id": uid, "email": data["email"]})
    if request.headers.get("authorization", "").startswith("Bearer "):
        try:
            uid = jwt.decode(
                request.headers["authorization"][7:], options={"verify_signature": False}
            )["sub"]
        except jwt.PyJWTError:
            return httpx.Response(401, json={})
        user = users[uid]
        if path.endswith("/user"):
            if request.method == "PUT":
                user["password"] = data["password"]
            return httpx.Response(200, json={k: v for k, v in user.items() if k != "password"})
        if path.endswith("/factors") and request.method == "POST":
            fid = str(uuid4())
            user["factors"].append(
                {
                    "id": fid,
                    "factor_type": "totp",
                    "status": "unverified",
                    "friendly_name": data["friendly_name"],
                }
            )
            return httpx.Response(
                200,
                json={
                    "id": fid,
                    "totp": {
                        "qr_code": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>',
                        "secret": "SYNTHETIC-QR-ONLY",
                        "uri": "otpauth://totp/fixture",
                    },
                },
            )
        if "/factors/" in path:
            fid = path.split("/factors/")[1].split("/")[0]
            factor = next((f for f in user["factors"] if f["id"] == fid), None)
            if not factor:
                return httpx.Response(404, json={})
            if path.endswith("/challenge"):
                return httpx.Response(200, json={"id": "fixture-challenge"})
            if path.endswith("/verify"):
                if data["code"] != "123456":
                    return httpx.Response(400, json={"error_code": "mfa_verification_failed"})
                factor["status"] = "verified"
                return httpx.Response(200, json=pair(uid, "aal2"))
            if request.method == "DELETE":
                user["factors"].remove(factor)
                return httpx.Response(200, json={})
        if path.endswith("/logout"):
            return httpx.Response(204)
    return _fallback_auth(request)


app.state.auth.client = httpx.AsyncClient(transport=httpx.MockTransport(auth))
original.auth_http = auth
with psycopg.connect(_dsn) as db:
    contact = db.execute(
        "INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES('analytics-fixture','encrypted','1') RETURNING id"
    ).fetchone()[0]
    today = datetime.now(UTC).date()
    for i in range(14):
        for j in range(i % 4 + 1):
            status = ["new", "contacted", "qualified", "installed"][j]
            payload = {
                "phone_masked": "09******00",
                "plan_id": original.PLAN,
                "attribution": {
                    "last_touch": {
                        "utm_source": ["google", "facebook"][j % 2],
                        "utm_campaign": "analytics_qa",
                    }
                },
            }
            db.execute(
                "INSERT INTO private.leads(contact_id,branch_id,status,payload,pii_ciphertext,quote_status,created_at,sla_due_at) VALUES(%s,%s,%s,%s,'encrypted','consultation_required',%s,%s)",
                [
                    contact,
                    fixture_branch,
                    status,
                    Jsonb(payload),
                    datetime.combine(today - timedelta(days=i), datetime.min.time(), UTC),
                    datetime.now(UTC) - timedelta(minutes=20),
                ],
            )
