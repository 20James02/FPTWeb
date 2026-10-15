"""Explicit Google campaign URL changes. No ad budgets or delivery state are changed."""

import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.measurement.accounts import private_connection
from pagefpt.modules.measurement.campaigns import tracking
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.measurement.schemas import VersionInput
from pagefpt.modules.pricing.schemas import Command

router = APIRouter()


class ApplyUpdate(Command):
    preview_token: str = Field(max_length=8192)
    confirm: Literal[True]


async def context(id, request, actor):
    campaign = await dispatch(
        request, "resource_get", actor=actor.user_id, kind="campaign", id=str(id)
    )
    p = campaign["payload"]
    if p["platform"] != "google" or not p.get("connection_id") or not p.get("external_campaign_id"):
        raise DomainError("EXTERNAL_MAPPING_REQUIRED", 422)
    conn, secrets = await private_connection(request, p["connection_id"], actor)
    if conn["payload"]["provider"] != "google_ads":
        raise DomainError("CAMPAIGN_CONNECTION_MISMATCH", 422)
    settings = conn["payload"]["settings"]
    if (
        not settings.get("ads_api_version")
        or not settings.get("customer_id")
        or not secrets.get("access_token")
        or not secrets.get("developer_token")
    ):
        raise DomainError("ADS_API_SETTINGS_REQUIRED", 422)
    headers = {
        "Authorization": "Bearer " + secrets["access_token"],
        "developer-token": secrets["developer_token"],
    }
    if settings.get("login_customer_id"):
        headers["login-customer-id"] = settings["login_customer_id"]
    prefix = f"https://googleads.googleapis.com/{settings['ads_api_version']}/customers/{settings['customer_id']}"
    return campaign, conn, headers, prefix


async def provider_post(request, url, headers, body, *, code):
    try:
        response = await request.app.state.provider_http.post(url, headers=headers, json=body)
        if not response.is_success or len(response.content) > 1024 * 1024:
            raise ValueError("Invalid provider response")
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Invalid provider body")
        return data
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise DomainError(code, 503) from exc


async def current(request, prefix, headers, campaign):
    external = campaign["payload"]["external_campaign_id"]
    data = await provider_post(
        request,
        prefix + "/googleAds:search",
        headers,
        {
            "query": f"SELECT campaign.resource_name, campaign.id, campaign.final_url_suffix FROM campaign WHERE campaign.id = {external}"
        },
        code="PROVIDER_READ_FAILED",
    )
    rows = data.get("results", [])
    if (
        not isinstance(rows, list)
        or len(rows) != 1
        or not isinstance(rows[0], dict)
        or not isinstance(rows[0].get("campaign"), dict)
        or str(rows[0]["campaign"].get("id", "")) != external
    ):
        raise DomainError("EXTERNAL_CAMPAIGN_NOT_VERIFIED", 422)
    remote = rows[0]["campaign"]
    customer = prefix.rsplit("/", 1)[-1]
    if (
        remote.get("resourceName") != f"customers/{customer}/campaigns/{external}"
        or not isinstance(remote.get("finalUrlSuffix", ""), str)
        or len(remote.get("finalUrlSuffix", "")) > 8192
    ):
        raise DomainError("EXTERNAL_CAMPAIGN_NOT_VERIFIED", 422)
    return remote


@router.post("/campaigns/{id}/sync-preview")
async def preview(id: UUID, input: VersionInput, request: Request):
    actor = await authorize(request, "measurement.external_write", mfa=True)
    check(actor, "marketing.write")
    campaign, conn, headers, prefix = await context(id, request, actor)
    if campaign["version"] != input.expected_version:
        raise DomainError("VERSION_CONFLICT", 409)
    remote = await current(request, prefix, headers, campaign)
    desired = (await tracking(id, request))["suffix"]
    claims = {
        "purpose": "measurement-ad-write",
        "actor": actor.user_id,
        "id": str(id),
        "version": campaign["version"],
        "connection_version": conn["version"],
        "before_hash": hashlib.sha256(remote.get("finalUrlSuffix", "").encode()).hexdigest(),
        "suffix": desired,
        "exp": datetime.now(UTC).timestamp() + 120,
    }
    return {
        "before": remote.get("finalUrlSuffix", ""),
        "after": desired,
        "preview_token": crypto(request).sign(claims),
        "scope": "campaign.final_url_suffix",
        "warning": "Thay đổi đồng thời trong Ads Manager không có khóa giao dịch chung; hệ thống sẽ đọc kiểm tra lại trước và sau khi lưu.",
    }


@router.post("/campaigns/{id}/sync-apply")
async def apply(id: UUID, input: ApplyUpdate, request: Request):
    actor = await authorize(request, "measurement.external_write", mfa=True)
    check(actor, "marketing.write")
    claims = crypto(request).verify(input.preview_token, "measurement-ad-write", datetime.now(UTC))
    if claims.get("actor") != actor.user_id or claims.get("id") != str(id):
        raise DomainError("INVALID_PREVIEW", 403)
    campaign, conn, headers, prefix = await context(id, request, actor)
    if campaign["version"] != claims["version"] or conn["version"] != claims["connection_version"]:
        raise DomainError("VERSION_CONFLICT", 409)
    remote = await current(request, prefix, headers, campaign)
    if remote.get("finalUrlSuffix", "") == claims["suffix"]:
        return {"verified": True, "replayed": True}
    if (
        hashlib.sha256(remote.get("finalUrlSuffix", "").encode()).hexdigest()
        != claims["before_hash"]
    ):
        raise DomainError("EXTERNAL_VERSION_CONFLICT", 409)
    data = await provider_post(
        request,
        prefix + "/campaigns:mutate",
        headers,
        {
            "operations": [
                {
                    "update": {
                        "resourceName": remote["resourceName"],
                        "finalUrlSuffix": claims["suffix"],
                    },
                    "updateMask": "final_url_suffix",
                }
            ],
            "partialFailure": False,
            "validateOnly": False,
        },
        code="EXTERNAL_UPDATE_UNKNOWN",
    )
    if data.get("partialFailureError"):
        raise DomainError("EXTERNAL_UPDATE_UNKNOWN", 503)
    checked = await current(request, prefix, headers, campaign)
    if checked.get("finalUrlSuffix", "") != claims["suffix"]:
        raise DomainError("EXTERNAL_UPDATE_NOT_VERIFIED", 409)
    await dispatch(
        request,
        "measurement_external_audit",
        actor=actor.user_id,
        id=conn["id"],
        campaign_id=str(id),
        before_hash=claims["before_hash"],
        after_hash=hashlib.sha256(claims["suffix"].encode()).hexdigest(),
    )
    return {"verified": True, "replayed": False}
