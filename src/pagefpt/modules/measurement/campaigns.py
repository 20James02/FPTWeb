"""Campaign metadata uses the existing resource store and optimistic versioning."""

from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.marketing.schemas import CampaignInput
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.measurement.schemas import VersionInput

router = APIRouter()


class CampaignMapping(VersionInput):
    connection_id: UUID
    external_campaign_id: str = Field(max_length=40, pattern=r"^[0-9]+$")
    landing_path: str = Field(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")
    content_note: str = Field(default="", max_length=1000)


@router.get("/campaigns")
async def campaigns(request: Request):
    actor = await authorize(request)
    check(actor, "marketing.write")
    return await dispatch(request, "resource_list", actor=actor.user_id, kind="campaign", limit=100)


@router.put("/campaigns/{id}/mapping")
async def mapping(id: UUID, input: CampaignMapping, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    check(actor, "marketing.write")
    source = await dispatch(
        request, "resource_get", actor=actor.user_id, kind="campaign", id=str(id)
    )
    conns = await dispatch(request, "measurement_connection_list", actor=actor.user_id)
    conn = next((r for r in conns["items"] if r["id"] == str(input.connection_id)), None)
    if not conn or conn["payload"]["provider"] != {"google": "google_ads", "meta": "meta"}.get(
        source["payload"]["platform"]
    ):
        raise DomainError("CAMPAIGN_CONNECTION_MISMATCH", 422)
    payload = CampaignInput.model_validate(
        {**source["payload"], **input.model_dump(mode="json", exclude={"expected_version"})}
    ).model_dump(mode="json")
    return await dispatch(
        request,
        "resource_update",
        actor=actor.user_id,
        id=str(id),
        kind="campaign",
        expected_version=input.expected_version,
        payload=payload,
    )


@router.get("/campaigns/{id}/tracking")
async def tracking(id: UUID, request: Request):
    actor = await authorize(request)
    check(actor, "marketing.write")
    source = await dispatch(
        request, "resource_get", actor=actor.user_id, id=str(id), kind="campaign"
    )
    p = source["payload"]
    google = p["platform"] == "google"
    params = {
        "utm_source": "google"
        if google
        else "facebook"
        if p["platform"] == "meta"
        else p["platform"],
        "utm_medium": "cpc" if google else "paid_social",
        "utm_campaign": p["utm_campaign"],
    }
    if google:
        params.update(
            {
                "utm_id": "{campaignid}",
                "campaign_id": "{campaignid}",
                "adgroup_id": "{adgroupid}",
                "ad_id": "{creative}",
                "utm_content": "{creative}",
            }
        )
    elif p["platform"] == "meta":
        params.update(
            {
                "campaign_id": "{{campaign.id}}",
                "adset_id": "{{adset.id}}",
                "ad_id": "{{ad.id}}",
                "utm_content": "{{ad.id}}",
            }
        )
    suffix = urlencode(params, safe="{}")
    origin = request.app.state.settings.public_origin or str(request.base_url).rstrip("/")
    return {
        "campaign_id": str(id),
        "version": source["version"],
        "final_url": origin + p.get("landing_path", "/"),
        "parameters": params,
        "suffix": suffix,
        "external_campaign_id": p.get("external_campaign_id", ""),
        "external_update_supported": google,
    }
