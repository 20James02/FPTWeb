from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
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


class SessionResume(Command):
    session_token: str = Field(max_length=8192)


@router.post("/sessions/resume")
async def resume_session(input: SessionResume, request: Request):
    claims = crypto(request).verify(input.session_token, "session", datetime.now(UTC))
    row = await dispatch(request, "session_read", id=claims["id"])
    return {
        key: row.get(key) is True
        for key in ("analytics", "marketing", "advertising", "personalization")
    }


@router.post("/consent/revoke")
async def revoke_session(input: SessionResume, request: Request):
    from pagefpt.modules.identity.sessions import same_origin

    same_origin(request)
    # An expired signed session can only REDUCE its own permissions here.
    # Every endpoint that reads/tracks data still verifies the real expiry.
    claims = crypto(request).verify(input.session_token, "session", datetime.fromtimestamp(0, UTC))
    await dispatch(
        request,
        "consent",
        id=claims["id"],
        analytics=False,
        marketing=False,
        advertising=False,
        personalization=False,
        consent_version="2026-10-v3-revoked",
    )
    return {"revoked": True}


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
    permission = await dispatch(request, "session_read", id=claims["id"])
    for event in input.events:
        if event.name == "experiment_exposure" and permission.get("analytics"):
            if not event.experiment_id:
                raise DomainError("INVALID_EXPERIMENT", 422)
            exp = await dispatch(
                request, "public_resource", kind="experiment", id=str(event.experiment_id)
            )
            expected = assign_variant(
                exp["payload"]["salt"], claims["id"], exp["payload"]["variants"]
            )
            if event.variant != expected or event.experiment_version != exp["version"]:
                raise DomainError("INVALID_EXPERIMENT", 422)
    return await dispatch(
        request,
        "events",
        session_id=claims["id"],
        events=[
            {**v.model_dump(mode="json"), "environment": request.app.state.settings.environment}
            for v in input.events
        ],
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
    click_id_type: str = Field(default="", pattern=r"^(|gclid|gbraid|wbraid|fbclid)$")
    utm_content: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    utm_term: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    campaign_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    adgroup_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    adset_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    ad_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    landing_path: str = Field(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")
    ga_client_id: str = Field(default="", pattern=r"^(|[0-9]{1,20}\.[0-9]{1,20})$")
    fbp: str = Field(
        default="", max_length=300, pattern=r"^(|fb\.[0-9]+\.[0-9]{10,16}\.[a-zA-Z0-9_-]{1,256})$"
    )
    fbc: str = Field(
        default="", max_length=300, pattern=r"^(|fb\.[0-9]+\.[0-9]{10,16}\.[a-zA-Z0-9_-]{1,256})$"
    )


@router.post("/touches")
async def touch(input: AttributionInput, request: Request):
    crypt = crypto(request)
    claims = crypt.verify(input.session_token, "session", datetime.now(UTC))
    payload = input.model_dump(
        mode="json", exclude={"session_token", "click_id", "ga_client_id", "fbp", "fbc"}
    )
    payload["environment"] = request.app.state.settings.environment
    permission = await dispatch(request, "session_read", id=claims["id"])
    if (
        permission.get("analytics")
        and permission.get("marketing")
        and permission.get("advertising")
    ):
        identifiers = {
            k: getattr(input, k) for k in ("ga_client_id", "fbp", "fbc") if getattr(input, k)
        }
        if identifiers:
            payload["provider_ids_ciphertext"] = crypt.encrypt(
                __import__("json").dumps(identifiers)
            )
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
    label = next(
        v.get("cta_label") for v in experiment["payload"]["variants"] if v["name"] == value
    )
    return {
        "variant": value,
        "experiment_version": experiment["version"],
        "cta_label": label,
        "trackable": session_id is not None,
    }


class VariantRequest(Command):
    session_token: str | None = Field(default=None, max_length=8192)


@router.post("/experiments/{id}/variant")
async def variant_post(id: UUID, input: VariantRequest, request: Request):
    return await variant(id, request, input.session_token)


@router.get("/admin/experiments/{id}/results")
async def experiment_results(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "marketing.write")
    return await dispatch(request, "experiment_results", actor=actor.user_id, id=str(id))
