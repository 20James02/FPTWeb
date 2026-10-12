"""Account operations keep provider credentials inside the BFF session boundary."""

import json
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request
from pydantic import Field, field_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.identity.schemas import MembershipInput
from pagefpt.modules.identity.service import IdentityService
from pagefpt.modules.identity.sessions import Login, read_session, session_token
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1")
ROLES = {
    "sales": {
        "label": "Kinh doanh",
        "permissions": ["lead.read", "lead.write", "lead.pii", "care.write"],
    },
    "support": {
        "label": "Chăm sóc khách hàng",
        "permissions": ["lead.read", "lead.write", "lead.pii", "care.write", "care.approve"],
    },
    "marketing": {"label": "Marketing", "permissions": ["marketing.write", "report.read"]},
    "editor": {"label": "Biên tập", "permissions": ["catalog.write", "content.write"]},
    "manager": {
        "label": "Quản lý chi nhánh",
        "permissions": [
            "lead.read",
            "lead.write",
            "lead.all",
            "lead.assign",
            "lead.pii",
            "care.write",
            "care.approve",
            "report.read",
        ],
    },
}


class Enroll(Command):
    name: str = Field(min_length=1, max_length=60)


class Code(Command):
    code: str = Field(pattern=r"^[0-9]{6}$")


class PasswordChange(Command):
    current_password: str = Field(min_length=1, max_length=1024)
    password: str = Field(min_length=12, max_length=128)
    otp: str = Field(default="", pattern=r"^([0-9]{6})?$")
    factor_id: UUID | None = None


class StaffCreate(Command):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)
    branch_id: UUID
    role: Literal["sales", "support", "marketing", "editor", "manager"]

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        return Login.valid_email(value)


async def account_context(request):
    # Self service deliberately requires an opaque session, even if a Bearer
    # token is also present. CSRF validation is performed by session_token.
    token = await session_token(request)
    claims = await request.app.state.verifier.verify(token)
    actor = await IdentityService(request.app.state.db).actor_for_subject(
        claims["sub"], claims.get("aal", "aal1")
    )
    user = await request.app.state.auth.call("user", token=token, method="GET")
    return actor, token, user


def factors(user):
    result = user.get("factors", [])
    if not isinstance(result, list) or any(not isinstance(f, dict) for f in result):
        raise DomainError("AUTH_UNAVAILABLE", 503)
    return result


async def audit(request, actor, action):
    await dispatch(request, "account_audit", actor=actor.user_id, action=action)


@router.get("/auth/account")
async def account(request: Request):
    actor, _, user = await account_context(request)
    return {
        "id": actor.user_id,
        "email": user.get("email", ""),
        "aal": actor.aal,
        "factors": [
            {
                key: f.get(key)
                for key in ("id", "factor_type", "status", "friendly_name", "created_at")
            }
            for f in factors(user)
        ],
        "memberships": actor.memberships,
    }


@router.post("/auth/mfa/enroll")
async def enroll(input: Enroll, request: Request):
    actor, token, user = await account_context(request)
    if any(f.get("status") == "verified" for f in factors(user)) and actor.aal != "aal2":
        raise DomainError("MFA_REQUIRED", 403)
    await dispatch(request, "auth_throttle", key=crypto(request).match(actor.user_id, "mfa"))
    result = await request.app.state.auth.call(
        "factors",
        {"factor_type": "totp", "friendly_name": input.name, "issuer": "PageFPT"},
        token=token,
    )
    await audit(request, actor, "auth.mfa_enrollment_started")
    return {"id": str(UUID(result["id"])), "totp": result["totp"]}


@router.post("/auth/mfa/{id}/verify")
async def verify(id: UUID, input: Code, request: Request):
    actor, token, user = await account_context(request)
    if not any(f.get("id") == str(id) and f.get("factor_type") == "totp" for f in factors(user)):
        raise DomainError("NOT_FOUND", 404)
    await dispatch(request, "auth_throttle", key=crypto(request).match(actor.user_id, "mfa"))
    row = await read_session(request)
    lease = str(uuid4())
    claimed = await dispatch(
        request, "admin_session_refresh_claim", key=row["key"], version=row["version"], lease=lease
    )
    if not claimed.get("claimed"):
        raise DomainError("SESSION_REFRESH_BUSY", 503)
    rotated = False
    try:
        challenge = await request.app.state.auth.call(f"factors/{id}/challenge", {}, token=token)
        pair = await request.app.state.auth.call(
            f"factors/{id}/verify",
            {"challenge_id": challenge["id"], "code": input.code},
            token=token,
        )
        rotated = True
        claims = await request.app.state.verifier.verify(pair["access_token"])
        if claims["sub"] != actor.user_id or claims.get("aal") != "aal2":
            raise DomainError("MFA_REQUIRED", 403)
        saved = await dispatch(
            request,
            "admin_session_refresh_complete",
            key=row["key"],
            lease=lease,
            tokens_ciphertext=crypto(request).encrypt(
                json.dumps(
                    {"access_token": pair["access_token"], "refresh_token": pair["refresh_token"]}
                )
            ),
            access_expires_at=datetime.fromtimestamp(claims["exp"], UTC).isoformat(),
        )
        if not saved.get("saved"):
            raise DomainError("UNAUTHENTICATED", 401)
    except DomainError as error:
        # A rejected OTP did not rotate tokens; release its lease for a retry.
        # For ambiguous provider/network results revoke instead of reusing proof.
        if error.code == "UNAUTHENTICATED" and not rotated:
            await dispatch(request, "account_release_lease", key=row["key"], lease=lease)
            raise DomainError("MFA_CODE_INVALID", 422) from error
        await dispatch(request, "admin_session_revoke", key=row["key"])
        raise
    except Exception:
        await dispatch(request, "admin_session_revoke", key=row["key"])
        raise
    await audit(request, actor, "auth.mfa_verified")
    return {"verified": True, "aal": "aal2"}


@router.delete("/auth/mfa/{id}")
async def unenroll(id: UUID, request: Request):
    actor, token, user = await account_context(request)
    lease = str(uuid4())
    locked = await dispatch(request, "account_lock_claim", actor=actor.user_id, lease=lease)
    if not locked.get("claimed"):
        raise DomainError("ACCOUNT_BUSY", 409)
    try:
        # Reload inside the durable per-user lease: two devices cannot both
        # remove the final pair of verified factors using an earlier count.
        user = await request.app.state.auth.call("user", token=token, method="GET")
        await remove_factor(request, actor, token, user, id)
    finally:
        await dispatch(request, "account_lock_release", actor=actor.user_id, lease=lease)
    await audit(request, actor, "auth.mfa_removed")
    return {"removed": True}


async def remove_factor(request, actor, token, user, id):
    own = next((f for f in factors(user) if f.get("id") == str(id)), None)
    if own is None:
        raise DomainError("NOT_FOUND", 404)
    if own.get("status") == "verified":
        if actor.aal != "aal2":
            raise DomainError("MFA_REQUIRED", 403)
        if (
            sum(
                f.get("status") == "verified" and f.get("factor_type") == "totp"
                for f in factors(user)
            )
            < 2
        ):
            raise DomainError("LAST_MFA_REQUIRED", 409)
    await request.app.state.auth.call(f"factors/{id}", token=token, method="DELETE")


@router.post("/auth/account/password")
async def password(input: PasswordChange, request: Request):
    actor, _, user = await account_context(request)
    await dispatch(
        request, "auth_throttle", key=crypto(request).match(actor.user_id, "password-change")
    )
    pair = await request.app.state.auth.password(
        user["email"], input.current_password, input.otp, input.factor_id
    )
    claims = await request.app.state.verifier.verify(pair["access_token"])
    if claims["sub"] != actor.user_id:
        raise DomainError("UNAUTHENTICATED", 401)
    # Revoke durably before the irreversible provider mutation. A database
    # failure therefore cannot report failure after the password was changed.
    lease = str(uuid4())
    await dispatch(request, "account_revoke_sessions", actor=actor.user_id, lease=lease)
    try:
        return await change_provider_password(request, actor, pair, input)
    finally:
        try:
            await dispatch(
                request,
                "account_lock_release",
                actor=actor.user_id,
                lease=lease,
                password_change=True,
            )
        except DomainError:
            # The durable 90-second fence remains protective if release fails.
            # Never turn an already confirmed provider change into a false failure.
            pass


async def change_provider_password(request, actor, pair, input):
    try:
        await request.app.state.auth.call(
            "user",
            {"password": input.password, "current_password": input.current_password},
            token=pair["access_token"],
            method="PUT",
        )
    except DomainError as error:
        try:
            await request.app.state.auth.logout(pair["access_token"])
        except DomainError:
            pass
        raise DomainError(error.code, error.status, fields={"sign_in_required": True}) from error
    provider_revoked = True
    try:
        await request.app.state.auth.call(
            "logout", token=pair["access_token"], params={"scope": "global"}
        )
    except DomainError:
        provider_revoked = False
    audit_recorded = True
    try:
        await audit(request, actor, "auth.password_changed")
    except DomainError:
        audit_recorded = False
    return {
        "changed": True,
        "sign_in_required": True,
        "provider_revoked": provider_revoked,
        "audit_recorded": audit_recorded,
    }


@router.get("/admin/staff/roles")
async def roles(request: Request):
    actor = await current_actor(request)
    check(actor, "identity.manage", mfa=True)
    return {"roles": ROLES}


@router.get("/admin/staff")
async def staff_list(
    request: Request,
    q: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0, le=100000),
):
    actor = await current_actor(request)
    check(actor, "identity.manage", mfa=True)
    data = await dispatch(request, "staff_list", actor=actor.user_id, q=q.strip(), offset=offset)
    items = data["items"]
    return {
        "items": items[:50],
        "next_offset": offset + 50 if len(items) > 50 else None,
        "offset": offset,
    }


@router.get("/admin/staff/branches")
async def staff_branches(request: Request):
    actor = await current_actor(request)
    check(actor, "identity.manage", mfa=True)
    return await dispatch(
        request, "account_branches", actor=actor.user_id, permission="identity.manage"
    )


@router.post("/admin/staff", status_code=201)
async def create_staff(input: StaffCreate, request: Request):
    actor = await current_actor(request)
    branch = str(input.branch_id)
    check(actor, "identity.manage", branch, mfa=True)
    permissions = ROLES[input.role]["permissions"]
    for permission in permissions:
        check(actor, permission, branch)
    await dispatch(
        request, "auth_throttle", key=crypto(request).match(actor.user_id, "staff-create")
    )
    user = await request.app.state.auth.call(
        "admin/users",
        {"email": input.email, "password": input.password, "email_confirm": True},
        admin=True,
    )
    uid = str(UUID(user["id"]))
    try:
        membership = MembershipInput.model_validate(
            {
                "user_id": uid,
                "branch_id": branch,
                "display_name": input.display_name,
                "permissions": permissions,
            }
        )
        await dispatch(
            request,
            "membership_save",
            actor=actor.user_id,
            payload={
                **membership.model_dump(mode="json"),
                "email": input.email,
                "require_mfa": True,
            },
        )
    except Exception:
        # Never leave a usable account after a failed grant. If cleanup fails,
        # no membership was authorized and the account cannot access Admin.
        await request.app.state.auth.call(f"admin/users/{uid}", method="DELETE", admin=True)
        raise
    return {
        "id": uid,
        "email": input.email,
        "display_name": input.display_name,
        "role": input.role,
        "mfa_enrollment_required": True,
    }
