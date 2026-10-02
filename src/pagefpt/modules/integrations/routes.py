from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin")


@router.get("/integration-capabilities")
async def capabilities(request: Request):
    actor = await current_actor(request)
    check(actor, "marketing.write", mfa=True)
    settings = request.app.state.settings
    return {
        "enabled": settings.integrations_enabled,
        "conversion_gateway_configured": bool(settings.conversion_url),
        "notification_gateway_configured": bool(settings.notification_url),
        "incoming_webhooks_configured": bool(settings.incoming_webhook_secret.get_secret_value()),
        "provider_credentials_exposed": False,
    }


@router.get("/deliveries")
async def deliveries(request: Request):
    actor = await current_actor(request)
    check(actor, "marketing.write", mfa=True)
    return await dispatch(request, "conversion_deliveries", actor=actor.user_id)


class ReconcileConversion(Command):
    state: Literal["accepted", "failed", "retry"]
    evidence_ref: str = Field(min_length=1, max_length=200)


@router.post("/deliveries/{id}/reconcile")
async def reconcile(id: UUID, input: ReconcileConversion, request: Request):
    actor = await current_actor(request)
    check(actor, "marketing.write", mfa=True)
    return await dispatch(
        request, "conversion_reconcile", actor=actor.user_id, id=str(id), **input.model_dump()
    )
