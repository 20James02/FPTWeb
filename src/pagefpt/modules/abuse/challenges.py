from datetime import UTC, datetime
from uuid import uuid4

import httpx
from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.dependencies import crypto
from pagefpt.core.crypto import normalize_phone
from pagefpt.core.errors import DomainError
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/leads/challenges")


class ChallengeInput(Command):
    session_token: str = Field(max_length=8192)
    phone: str = Field(max_length=40)
    provider_token: str = Field(min_length=1, max_length=2048)


@router.post("/verify")
async def verify(input: ChallengeInput, request: Request):
    settings = request.app.state.settings
    crypt = crypto(request)
    claims = crypt.verify(input.session_token, "session", datetime.now(UTC))
    phone = normalize_phone(input.phone)
    if not settings.turnstile_secret.get_secret_value() or not settings.turnstile_hostnames:
        raise DomainError("CHALLENGE_UNCONFIGURED", 503)
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            result = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                json={
                    "secret": settings.turnstile_secret.get_secret_value(),
                    "response": input.provider_token,
                    "idempotency_key": str(uuid4()),
                },
            )
            result.raise_for_status()
            data = result.json()
        if (
            not data.get("success")
            or data.get("hostname") not in settings.turnstile_hostnames
            or data.get("action") != "lead"
        ):
            raise DomainError("CHALLENGE_FAILED", 403)
    except (httpx.HTTPError, ValueError) as exc:
        raise DomainError("CHALLENGE_UNAVAILABLE", 503) from exc
    token = crypt.sign(
        {
            "purpose": "challenge",
            "id": str(uuid4()),
            "session_id": claims["id"],
            "phone_hmac": crypt.match(phone),
            "exp": datetime.now(UTC).timestamp() + 300,
        }
    )
    return {"challenge_token": token, "expires_in": 300, "verification": "human_challenge"}
