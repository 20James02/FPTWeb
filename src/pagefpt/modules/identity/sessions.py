import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, field_validator

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.identity.service import IdentityService
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/auth")
SESSION_COOKIE = "pagefpt_admin_session"
CSRF_COOKIE = "pagefpt_csrf"


class Login(Command):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)
    otp: str = Field(default="", pattern=r"^([0-9]{6})?$")

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        if "@" not in value or any(c.isspace() or ord(c) < 32 for c in value):
            raise ValueError("Invalid email")
        return value.strip().lower()


def same_origin(request):
    expected = request.app.state.settings.public_origin.rstrip("/") or str(request.base_url).rstrip(
        "/"
    )
    origin = request.headers.get("origin")
    if request.app.state.settings.environment in {"development", "test"}:
        if not origin or origin in {
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://test",
            expected,
        }:
            return
    if (origin and origin != expected) or request.headers.get("sec-fetch-site") == "cross-site":
        raise DomainError("CSRF_FAILED", 403)


def csrf(request, stored):
    value = request.headers.get("x-csrf-token", "")
    if len(value) != 43 or not hmac.compare_digest(
        crypto(request).match(value, "csrf"), stored["csrf_hash"]
    ):
        raise DomainError("CSRF_FAILED", 403)
    same_origin(request)


async def read_session(request):
    value = request.cookies.get(SESSION_COOKIE, "")
    if len(value) != 43:
        raise DomainError("UNAUTHENTICATED", 401)
    return await dispatch(
        request, "admin_session_read", key=crypto(request).match(value, "session")
    )


async def session_token(request):
    row = await read_session(request)
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf(request, row)
    crypt = crypto(request)
    if (
        datetime.fromisoformat(row["access_expires_at"]).timestamp()
        > datetime.now(UTC).timestamp() + 30
    ):
        return json.loads(crypt.decrypt(row["tokens_ciphertext"]))["access_token"]
    lease = str(uuid4())
    claimed = await dispatch(
        request, "admin_session_refresh_claim", key=row["key"], version=row["version"], lease=lease
    )
    if not claimed.get("claimed"):
        # No reuse of a rotating refresh token across concurrent Vercel instances.
        raise DomainError("SESSION_REFRESH_BUSY", 503)
    try:
        pair = await request.app.state.auth.refresh(
            json.loads(crypt.decrypt(row["tokens_ciphertext"]))["refresh_token"]
        )
        claims = await request.app.state.verifier.verify(pair["access_token"])
        if claims["sub"] != row["subject"]:
            raise DomainError("UNAUTHENTICATED", 401)
        saved = await dispatch(
            request,
            "admin_session_refresh_complete",
            key=row["key"],
            lease=lease,
            tokens_ciphertext=crypt.encrypt(
                json.dumps(
                    {"access_token": pair["access_token"], "refresh_token": pair["refresh_token"]}
                )
            ),
            access_expires_at=datetime.fromtimestamp(claims["exp"], UTC).isoformat(),
        )
        if not saved.get("saved"):
            raise DomainError("UNAUTHENTICATED", 401)
        return pair["access_token"]
    except Exception:
        await dispatch(request, "admin_session_revoke", key=row["key"])
        raise


@router.post("/session")
async def login(input: Login, request: Request):
    same_origin(request)

    crypt = crypto(request)
    await dispatch(request, "auth_throttle", key=crypt.match(input.email, "auth-email"))
    pair = await request.app.state.auth.password(input.email, input.password, input.otp)
    claims = await request.app.state.verifier.verify(pair["access_token"])
    actor = await IdentityService(request.app.state.db).actor_for_subject(
        claims["sub"], claims.get("aal", "aal1")
    )
    if input.otp and actor.aal != "aal2":
        raise DomainError("MFA_REQUIRED", 403)
    opaque, csrf_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    hours = request.app.state.settings.admin_session_hours
    await dispatch(
        request,
        "admin_session_create",
        key=crypt.match(opaque, "session"),
        subject=actor.user_id,
        csrf_hash=crypt.match(csrf_token, "csrf"),
        tokens_ciphertext=crypt.encrypt(
            json.dumps(
                {"access_token": pair["access_token"], "refresh_token": pair["refresh_token"]}
            )
        ),
        access_expires_at=datetime.fromtimestamp(claims["exp"], UTC).isoformat(),
        expires_at=(datetime.now(UTC) + timedelta(hours=hours)).isoformat(),
    )
    response = JSONResponse({"user": {"id": actor.user_id}, "aal": actor.aal})
    secure = request.app.state.settings.environment in {"staging", "production"}
    response.set_cookie(
        SESSION_COOKIE,
        opaque,
        max_age=hours * 3600,
        secure=secure,
        httponly=True,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        max_age=hours * 3600,
        secure=secure,
        httponly=False,
        samesite="strict",
        path="/",
    )
    return response


@router.delete("/session")
async def logout(request: Request):
    row = await read_session(request)
    csrf(request, row)
    await dispatch(request, "admin_session_revoke", key=row["key"])
    upstream_revoked = True
    try:
        await request.app.state.auth.logout(
            json.loads(crypto(request).decrypt(row["tokens_ciphertext"]))["access_token"]
        )
    except DomainError:
        upstream_revoked = False
    response = JSONResponse({"signed_out": True, "provider_revoked": upstream_revoked})
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return response
