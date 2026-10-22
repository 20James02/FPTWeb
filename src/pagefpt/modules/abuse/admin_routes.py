import json
from uuid import UUID

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.abuse.schemas import AbuseRuleCreate, LeadBlockCommand
from pagefpt.modules.abuse.service import create_abuse_rule

router = APIRouter(prefix="/api/v1/admin")


@router.get("/abuse/rules")
async def list_abuse_rules(
    request: Request,
    active_only: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=100),
):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(
        request,
        "abuse_rule_list",
        actor=actor.user_id,
        active_only=active_only,
        limit=limit,
    )


@router.post("/abuse/rules", status_code=201)
async def add_abuse_rule(input: AbuseRuleCreate, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    crypt = crypto(request)
    return await create_abuse_rule(
        request.app.state.db,
        crypt,
        actor.user_id,
        input.target_type,
        input.target_value,
        input.action,
        input.reason,
        input.duration_hours,
    )


@router.delete("/abuse/rules/{id}")
async def remove_abuse_rule(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    return await dispatch(
        request,
        "abuse_rule_delete",
        actor=actor.user_id,
        id=str(id),
    )


@router.post("/leads/{id}/block")
async def block_lead_actor(id: UUID, input: LeadBlockCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    crypt = crypto(request)

    # 1. Fetch lead details
    lead = await dispatch(request, "lead_abuse_targets", actor=actor.user_id, id=str(id))

    target_type = input.block_target
    target_value = None

    if target_type == "ip":
        ip_cipher = lead.get("ip_ciphertext")
        if not ip_cipher:
            raise DomainError("IP_UNAVAILABLE", 422)
        try:
            target_value = crypt.decrypt(ip_cipher)
        except Exception:
            raise DomainError("IP_DECRYPTION_FAILED", 500)
    elif target_type == "session":
        target_value = lead.get("session_id")
        if not target_value:
            raise DomainError("SESSION_UNAVAILABLE", 422)
    elif target_type == "phone":
        pii_cipher = lead.get("pii_ciphertext")
        if not pii_cipher:
            raise DomainError("PHONE_UNAVAILABLE", 422)
        try:
            pii = json.loads(crypt.decrypt(pii_cipher))
            target_value = pii.get("phone")
        except Exception:
            raise DomainError("PHONE_UNAVAILABLE", 422)

    if not target_value:
        raise DomainError("TARGET_VALUE_EMPTY", 422)

    # 2. Create the abuse rule
    rule = await create_abuse_rule(
        request.app.state.db,
        crypt,
        actor.user_id,
        target_type,
        target_value,
        input.action,
        input.reason,
        input.duration_hours,
    )

    # 3. Transition lead to 'rejected' if not already terminal
    if lead.get("status") not in {"installed", "invalid", "duplicate", "rejected"}:
        try:
            await dispatch(
                request,
                "transition",
                actor=actor.user_id,
                id=str(id),
                status="rejected",
                reason=f"Spam blocked: {input.reason} ({input.action} on {target_type})",
                expected_version=lead.get("version", 1),
            )
        except Exception:
            pass  # Transition failure does not cancel rule creation

    return {
        "rule": rule,
        "blocked_target": target_type,
        "action": input.action,
        "lead_id": str(id),
    }
