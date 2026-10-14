"""Six-digit Telegram proof unlocks a provider recovery proof on the server."""

import secrets
from uuid import UUID, uuid4

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
    otp: str = Field(pattern=r"^[0-9]{6}$")
    challenge_id: UUID
    totp: str = Field(default="", pattern=r"^([0-9]{6})?$")
    totp_factor_id: UUID | None = None


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
    settings = request.app.state.settings
    if not settings.telegram_enabled or not settings.telegram_recovery_accounts:
        raise DomainError("RECOVERY_UNCONFIGURED", 503)
    await throttle(request, input.email)
    crypt = crypto(request)
    key = crypt.match(input.email, "telegram-recovery-email")
    await dispatch(request, "telegram_recovery_request_gate", key=key)
    challenge_id = str(uuid4())
    accepted = {"accepted": True, "challenge_id": challenge_id}
    chat = settings.telegram_recovery_accounts.get(input.email)
    if not chat:
        # Same response shape for an account without a configured recovery binding.
        return accepted
    account = await dispatch(request, "telegram_recovery_account", email=input.email)
    if not account.get("subject"):
        # Validate provider identity + active membership before generating any proof.
        # The public response deliberately does not reveal the admin directory.
        return accepted
    await dispatch(request, "telegram_recovery_reserve", key=key, id=challenge_id)
    auth = request.app.state.auth
    generated = await auth.call(
        "admin/generate_link", {"type": "recovery", "email": input.email}, admin=True
    )
    user, proof = generated, generated.get("hashed_token")
    if (
        not isinstance(user, dict)
        or not isinstance(user.get("email"), str)
        or user["email"].lower() != input.email
        or not isinstance(proof, str)
        or not 16 <= len(proof) <= 512
    ):
        raise DomainError("AUTH_UNAVAILABLE", 503)
    try:
        subject = str(UUID(user["id"]))
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise DomainError("AUTH_UNAVAILABLE", 503) from exc
    if subject != account["subject"]:
        raise DomainError("AUTH_UNAVAILABLE", 503)
    code = f"{secrets.randbelow(1000000):06d}"
    await dispatch(
        request,
        "telegram_recovery_issue",
        key=key,
        id=challenge_id,
        subject=subject,
        email=input.email,
        chat_id=chat,
        code_hash=crypt.match(challenge_id + ":" + code, "telegram-recovery-code"),
        code_ciphertext=crypt.encrypt(code),
        proof_ciphertext=crypt.encrypt(proof),
    )
    return accepted


@router.post("/reset")
async def reset_password(input: ResetPassword, request: Request):
    same_origin(request)
    await throttle(request, input.email)
    crypt = crypto(request)
    grant = await dispatch(
        request,
        "telegram_recovery_consume",
        chat_id=request.app.state.settings.telegram_recovery_accounts.get(input.email, ""),
        key=crypt.match(input.email, "telegram-recovery-email"),
        id=str(input.challenge_id),
        code_hash=crypt.match(str(input.challenge_id) + ":" + input.otp, "telegram-recovery-code"),
    )
    proof = {"token_hash": crypt.decrypt(grant["proof_ciphertext"]), "type": "recovery"}
    auth = request.app.state.auth
    pair = await auth.call("verify", proof)
    if not isinstance(pair.get("access_token"), str) or not isinstance(pair.get("user"), dict):
        raise DomainError("AUTH_UNAVAILABLE", 503)
    claims = await request.app.state.verifier.verify(pair["access_token"])
    if claims["sub"] != grant["subject"]:
        raise DomainError("UNAUTHENTICATED", 401)
    await IdentityService(request.app.state.db).actor_for_subject(
        claims["sub"], claims.get("aal", "aal1")
    )
    pair = await auth.assure_mfa(pair, input.totp, input.totp_factor_id)
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
