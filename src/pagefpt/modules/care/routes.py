from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.care.schemas import (
    FeedbackInput,
    FollowupInput,
    PreferencesInput,
    ReferralInput,
)
from pagefpt.modules.catalog.schemas import VersionCommand
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1")


@router.put("/admin/leads/{id}/preferences")
async def preferences(id: UUID, input: PreferencesInput, request: Request):
    actor = await current_actor(request)
    check(actor, "care.write")
    return await dispatch(
        request,
        "preferences",
        actor=actor.user_id,
        id=str(id),
        payload=input.model_dump(mode="json"),
    )


@router.post("/admin/followups", status_code=201)
async def followup(input: FollowupInput, request: Request):
    actor = await current_actor(request)
    check(actor, "care.write")
    return await dispatch(
        request,
        "followup",
        actor=actor.user_id,
        id=str(input.lead_id),
        payload=input.model_dump(mode="json"),
    )


@router.get("/admin/followups")
async def followup_list(request: Request):
    actor = await current_actor(request)
    check(actor, "care.write")
    return await dispatch(request, "resource_list", actor=actor.user_id, kind="followup", limit=100)


@router.post("/admin/leads/{id}/feedback-token")
async def feedback_token(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "care.write")
    await dispatch(request, "lead_detail", actor=actor.user_id, id=str(id))
    return {
        "token": crypto(request).sign(
            {"purpose": "feedback", "id": str(id), "exp": datetime.now(UTC).timestamp() + 7 * 86400}
        )
    }


@router.post("/feedback")
async def feedback(input: FeedbackInput, request: Request):
    claims = crypto(request).verify(input.token, "feedback", datetime.now(UTC))
    data = input.model_dump(exclude={"token", "comment"})
    data["comment_ciphertext"] = crypto(request).encrypt(input.comment)
    return await dispatch(request, "feedback", id=claims["id"], payload=data)


@router.post("/admin/referrals", status_code=201)
async def referral(input: ReferralInput, request: Request):
    actor = await current_actor(request)
    check(actor, "care.write")
    return await dispatch(
        request, "referral", actor=actor.user_id, payload=input.model_dump(mode="json")
    )


@router.post("/admin/referrals/{id}/approve")
async def approve_referral(id: UUID, input: VersionCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "care.approve", mfa=True)
    return await dispatch(
        request,
        "referral_approve",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


class ReconcileInput(Command):
    state: Literal["accepted", "failed", "retry"]
    evidence_ref: str = Field(min_length=1, max_length=200)


@router.post("/admin/followups/{id}/reconcile")
async def reconcile(id: UUID, input: ReconcileInput, request: Request):
    actor = await current_actor(request)
    check(actor, "care.approve", mfa=True)
    return await dispatch(
        request,
        "delivery_reconcile",
        actor=actor.user_id,
        id=str(id),
        request_id=str(uuid4()),
        **input.model_dump(mode="json"),
    )
