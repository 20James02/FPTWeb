"""Email recovery proof is exchanged and consumed on the server in one operation."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import Field, field_validator

from pagefpt.api.client_address import trusted_client_ip
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.identity.service import IdentityService
from pagefpt.modules.identity.sessions import CSRF_COOKIE, SESSION_COOKIE, Login, same_origin
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/auth/recovery")


class RecoveryEmail(Command):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        return Login.valid_email(value)


class ResetPassword(RecoveryEmail):
    password: str = Field(min_length=8, max_length=1024)
    otp: str = Field(pattern=r"^[0-9]{6,8}$")
    totp: str = Field(default="", pattern=r"^([0-9]{6})?$")


async def throttle(request, email):
    crypt = crypto(request)
    await dispatch(request, "auth_throttle", key=crypt.match(email, "recovery-email"))
    # Raw network addresses are never stored in rate-limit keys or logs.
    address = trusted_client_ip(request)
    if address:
        await dispatch(request, "auth_throttle", key=crypt.match(address, "recovery-ip"))


@router.post("", status_code=202)
async def request_recovery(input: RecoveryEmail, request: Request):
    same_origin(request)
    await throttle(request, input.email)
    await request.app.state.auth.call("recover", {"email": input.email})
    # Supabase returns the same response for an unknown account.
    return {"accepted": True}


@router.post("/reset")
async def reset_password(input: ResetPassword, request: Request):
    same_origin(request)
    await throttle(request, input.email)
    auth = request.app.state.auth
    pair = await auth.call("verify", {"email": input.email, "token": input.otp, "type": "recovery"})
    if not isinstance(pair.get("access_token"), str) or not isinstance(pair.get("user"), dict):
        raise DomainError("AUTH_UNAVAILABLE", 503)
    claims = await request.app.state.verifier.verify(pair["access_token"])
    await IdentityService(request.app.state.db).actor_for_subject(
        claims["sub"], claims.get("aal", "aal1")
    )
    pair = await auth.assure_mfa(pair, input.totp)
    if not isinstance(pair.get("access_token"), str):
        raise DomainError("AUTH_UNAVAILABLE", 503)
    elevated = await request.app.state.verifier.verify(pair["access_token"])
    if elevated["sub"] != claims["sub"]:
        raise DomainError("UNAUTHENTICATED", 401)
    if input.totp and elevated.get("aal", "aal1") != "aal2":
        raise DomainError("MFA_REQUIRED", 403)
    # Revoke locally before the provider write. If DB is unavailable no password is changed;
    # if PUT or the final audit fails, existing BFF sessions are already invalidated.
    await dispatch(request, "auth_recovery_revoke_sessions", subject=claims["sub"])
    updated = await auth.call(
        "user", {"password": input.password}, token=pair["access_token"], method="PUT"
    )
    if updated.get("id") != claims["sub"]:
        raise DomainError("AUTH_UNAVAILABLE", 503)
    provider_revoked = True
    try:
        await auth.call("logout", token=pair["access_token"], params={"scope": "global"})
    except DomainError:
        provider_revoked = False
    await dispatch(request, "auth_recovery_complete", subject=claims["sub"])
    response = JSONResponse({"changed": True, "provider_revoked": provider_revoked})
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return response
