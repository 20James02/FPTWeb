from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.marketing.experiments import assign_variant
from pagefpt.modules.marketing.schemas import ConsentInput, ConsentUpdate, EventBatch
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1")


@router.post("/sessions", status_code=201)
async def session(input: ConsentInput, request: Request):
    id = str(uuid4())
    await dispatch(request, "consent", id=id, **input.model_dump(mode="json"))
    lifetime = 30 * 86400 if input.analytics else 86400
    return {
        "session_token": crypto(request).sign(
            {"purpose": "session", "id": id, "exp": datetime.now(UTC).timestamp() + lifetime}
        )
    }


@router.put("/consent")
async def consent(input: ConsentUpdate, request: Request):
    claims = crypto(request).verify(input.session_token, "session", datetime.now(UTC))
    return await dispatch(
        request,
        "consent",
        id=claims["id"],
        **input.model_dump(mode="json", exclude={"session_token"}),
    )


@router.post("/events/batch")
async def events(input: EventBatch, request: Request):
    claims = crypto(request).verify(input.session_token, "session", datetime.now(UTC))
    return await dispatch(
        request,
        "events",
        session_id=claims["id"],
        events=[v.model_dump(mode="json") for v in input.events],
    )


class AttributionInput(Command):
    session_token: str = Field(max_length=8192)
    utm_source: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    utm_medium: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    utm_campaign: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    platform: str = Field(
        default="", max_length=30, pattern=r"^(|google|meta|tiktok|zalo|seo|referral)$"
    )
    click_id: str = Field(default="", max_length=256, pattern=r"^[a-zA-Z0-9_-]*$")


@router.post("/touches")
async def touch(input: AttributionInput, request: Request):
    crypt = crypto(request)
    claims = crypt.verify(input.session_token, "session", datetime.now(UTC))
    payload = input.model_dump(mode="json", exclude={"session_token", "click_id"})
    permission = await dispatch(request, "session_read", id=claims["id"])
    payload["click_id_ciphertext"] = (
        crypt.encrypt(input.click_id) if input.click_id and permission.get("marketing") else None
    )
    out = await dispatch(request, "touch", session_id=claims["id"], payload=payload)
    return (
        {
            "attribution_token": crypt.sign(
                {
                    "purpose": "attribution",
                    "id": out["id"],
                    "session_id": claims["id"],
                    "exp": datetime.now(UTC).timestamp() + 30 * 86400,
                }
            )
        }
        if out.get("id")
        else {"attribution_token": None}
    )


@router.get("/experiments/{id}/variant")
async def variant(id: UUID, request: Request, session_token: str | None = None):
    experiment = await dispatch(request, "public_resource", kind="experiment", id=str(id))
    session_id = None
    if session_token:
        claims = crypto(request).verify(session_token, "session", datetime.now(UTC))
        permission = await dispatch(request, "session_read", id=claims["id"])
        if permission.get("analytics"):
            session_id = claims["id"]
    value = assign_variant(
        experiment["payload"]["salt"], session_id, experiment["payload"]["variants"]
    )
    return {"variant": value, "experiment_version": experiment["version"]}
