"""Signed lead gateway port for CRM/ad-form connectors.
Gateway must adapt each vendor's original authentication; this is our wire contract.
"""

import hashlib
import hmac
import time
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.dependencies import crypto
from pagefpt.core.errors import DomainError
from pagefpt.modules.leads.schemas import LeadRequest
from pagefpt.modules.leads.service import submit_lead
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/webhooks")


class LeadWebhook(Command):
    provider_event_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.:-]+$")
    lead: LeadRequest


@router.post("/leads/{provider}")
async def gateway_lead(
    provider: Literal["google", "meta", "tiktok", "crm"], input: LeadWebhook, request: Request
):
    secret = request.app.state.settings.incoming_webhook_secret.get_secret_value()
    if len(secret) < 32:
        raise DomainError("INTEGRATION_UNCONFIGURED", 503)
    timestamp = request.headers.get("x-webhook-timestamp", "")
    try:
        valid_time = abs(time.time() - int(timestamp)) <= 300
    except ValueError:
        valid_time = False
    expected = hmac.new(
        secret.encode(),
        provider.encode() + b"." + timestamp.encode() + b"." + await request.body(),
        hashlib.sha256,
    ).hexdigest()
    if not valid_time or not hmac.compare_digest(
        expected, request.headers.get("x-webhook-signature", "")
    ):
        raise DomainError("INVALID_SIGNATURE", 401)
    crypt = crypto(request)
    return await submit_lead(
        request,
        input.lead,
        "webhook:" + crypt.match(provider + ":" + input.provider_event_id, "webhook"),
        crypt,
        durable=True,
    )
