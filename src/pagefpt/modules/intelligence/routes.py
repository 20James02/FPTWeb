from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.client_address import trusted_client_ip
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.intelligence.scoring import score_lead
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin/leads")


@router.get("/{id}/intelligence")
async def intelligence(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "intelligence_read", actor=actor.user_id, id=str(id))


@router.post("/{id}/recompute", status_code=202)
async def recompute(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "intelligence.write")
    return await dispatch(request, "intelligence_recompute", actor=actor.user_id, id=str(id))


public_router = APIRouter(prefix="/api/v1/visits")


class VisitInput(Command):
    session_token: str = Field(min_length=1, max_length=8192)


@public_router.post("/assess")
async def assess(input: VisitInput, request: Request):
    claims = crypto(request).verify(input.session_token, "session", datetime.now(UTC))
    data = await dispatch(request, "visit_events", session_id=claims["id"])
    if not data.get("analytics"):
        return {"status": "tracking_disabled"}
    scores = score_lead({"events": data["events"]}, datetime.now(UTC))
    ip = trusted_client_ip(request)
    geo = request.app.state.geoip.lookup(ip) if ip else {"status": "unknown", "source": "geoip"}
    # An intent score is a behavioral estimate, not a probability of identity or purchase.
    value = {
        "status": "estimated",
        "intent": scores["intent"],
        "reasons": scores["reasons"],
        "ruleset_version": scores["ruleset_version"],
        "computed_at": scores["computed_at"],
        "geoip": geo,
        "identity_verified": False,
    }
    await dispatch(request, "visit_save", session_id=claims["id"], payload=value)
    return value
