"""One durable cost chunk (50 rows) per job; provider pagination uses fixed hosts."""

import hashlib
import json
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import httpx
from fastapi import APIRouter, Request
from pydantic import model_validator

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.pricing.schemas import Command

router = APIRouter()


class SyncInput(Command):
    connection_id: UUID
    start: date
    end: date

    @model_validator(mode="after")
    def dates(self):
        if not 0 <= (self.end - self.start).days <= 30:
            raise ValueError("Mỗi lần đồng bộ tối đa 31 ngày")
        return self


@router.post("/sync-jobs", status_code=202)
async def create_sync(input: SyncInput, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    return await dispatch(
        request,
        "measurement_sync_create",
        actor=actor.user_id,
        id=str(input.connection_id),
        payload=input.model_dump(mode="json", exclude={"connection_id"}),
    )


@router.get("/sync-jobs")
async def sync_jobs(request: Request):
    actor = await authorize(request)
    return await dispatch(request, "measurement_sync_list", actor=actor.user_id)


async def fetch_page(http, connection, secrets, payload):
    p = connection["payload"]
    settings = p["settings"]
    provider = p["provider"]
    headers = {"Authorization": "Bearer " + secrets.get("access_token", "")}
    if not secrets.get("access_token"):
        raise DomainError("ACCESS_TOKEN_REQUIRED", 422)
    start = date.fromisoformat(payload["start"]).isoformat()
    end = date.fromisoformat(payload["end"]).isoformat()
    if provider == "ga4":
        prop = settings.get("property_id")
        if not prop:
            raise DomainError("PROPERTY_ID_REQUIRED", 422)
        offset = int(payload.get("cursor") or 0)
        response = await http.post(
            f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}:runReport",
            headers=headers,
            json={
                "dateRanges": [{"startDate": start, "endDate": end}],
                "dimensions": [
                    {"name": k} for k in ("date", "sessionSourceMedium", "sessionCampaignName")
                ],
                "metrics": [
                    {"name": k} for k in ("sessions", "engagedSessions", "averageSessionDuration")
                ],
                "orderBys": [
                    {"dimension": {"dimensionName": k}}
                    for k in ("date", "sessionSourceMedium", "sessionCampaignName")
                ],
                "offset": str(offset),
                "limit": "100",
            },
        )
        if response.status_code == 429 or response.status_code >= 500:
            raise DomainError("PROVIDER_RETRY", 503)
        if not response.is_success or len(response.content) > 1024 * 1024:
            raise DomainError("GA4_REPORT_REJECTED", 422)
        data = response.json()
        rows = []
        from pagefpt.modules.measurement.schemas import TrafficRow

        for row in data.get("rows", []):
            dims = [v["value"] for v in row["dimensionValues"]]
            metrics = [v["value"] for v in row["metricValues"]]
            day = date.fromisoformat(dims[0]).isoformat()
            if not start <= day <= end:
                raise DomainError("PROVIDER_DATE_MISMATCH", 422)
            rows.append(
                TrafficRow(
                    day=date.fromisoformat(day),
                    source=dims[1],
                    campaign=dims[2],
                    sessions=int(metrics[0]),
                    engaged_sessions=int(metrics[1]),
                    average_session_seconds=float(metrics[2]),
                ).model_dump(mode="json")
            )
        cursor = (
            str(offset + len(rows))
            if rows and offset + len(rows) < int(data.get("rowCount", 0))
            else None
        )
        return rows, cursor
    if provider == "meta":
        if not settings.get("api_version") or not settings.get("ad_account_id"):
            raise DomainError("META_ACCOUNT_REQUIRED", 422)
        account = await http.get(
            f"https://graph.facebook.com/{settings['api_version']}/act_{settings['ad_account_id']}",
            headers=headers,
            params={"fields": "id,currency,timezone_name"},
        )
        if account.status_code == 429 or account.status_code >= 500:
            raise DomainError("PROVIDER_RETRY", 503)
        if not account.is_success or account.json().get("currency") != "VND":
            raise DomainError("ACCOUNT_OR_CURRENCY_NOT_VERIFIED", 422)
        if account.json().get("timezone_name") not in {
            "Asia/Ho_Chi_Minh",
            "Asia/Saigon",
            "Asia/Bangkok",
            "Asia/Jakarta",
        }:
            raise DomainError("ACCOUNT_TIMEZONE_MISMATCH", 422)
        params = {
            "fields": "campaign_id,date_start,spend,clicks,impressions",
            "level": "campaign",
            "time_increment": "1",
            "time_range": json.dumps({"since": start, "until": end}),
            "limit": "100",
        }
        if payload.get("cursor"):
            params["after"] = payload["cursor"]
        response = await http.get(
            f"https://graph.facebook.com/{settings['api_version']}/act_{settings['ad_account_id']}/insights",
            headers=headers,
            params=params,
        )
    elif provider == "google_ads":
        if (
            not settings.get("ads_api_version")
            or not settings.get("customer_id")
            or not secrets.get("developer_token")
        ):
            raise DomainError("ADS_API_SETTINGS_REQUIRED", 422)
        headers["developer-token"] = secrets["developer_token"]
        if settings.get("login_customer_id"):
            headers["login-customer-id"] = settings["login_customer_id"]
        query = f"SELECT campaign.id, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, customer.currency_code, customer.time_zone FROM campaign WHERE segments.date BETWEEN '{start}' AND '{end}' ORDER BY segments.date,campaign.id"
        body = {"query": query}
        if payload.get("cursor"):
            body["pageToken"] = payload["cursor"]
        response = await http.post(
            f"https://googleads.googleapis.com/{settings['ads_api_version']}/customers/{settings['customer_id']}/googleAds:search",
            headers=headers,
            json=body,
        )
    else:
        raise DomainError("COST_SYNC_NOT_SUPPORTED", 422)
    if response.status_code == 429 or response.status_code >= 500:
        raise DomainError("PROVIDER_RETRY", 503)
    if not response.is_success or len(response.content) > 4 * 1024 * 1024:
        raise DomainError("PROVIDER_REPORT_REJECTED", 422)
    data = response.json()
    rows = []
    if provider == "meta":
        for r in data.get("data", []):
            rows.append(
                {
                    "day": r["date_start"],
                    "campaign_id": str(r["campaign_id"]),
                    "adgroup_id": "",
                    "ad_id": "",
                    "cost_vnd": int(
                        Decimal(r["spend"]).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                    ),
                    "clicks": int(r["clicks"]),
                    "impressions": int(r["impressions"]),
                }
            )
        cursor = (
            data.get("paging", {}).get("cursors", {}).get("after")
            if data.get("paging", {}).get("next")
            else None
        )
    else:
        for r in data.get("results", []):
            if r.get("customer", {}).get("currencyCode") != "VND":
                raise DomainError("CURRENCY_NOT_VND", 422)
            if r.get("customer", {}).get("timeZone") not in {
                "Asia/Ho_Chi_Minh",
                "Asia/Saigon",
                "Asia/Bangkok",
                "Asia/Jakarta",
            }:
                raise DomainError("ACCOUNT_TIMEZONE_MISMATCH", 422)
            metrics = r["metrics"]
            rows.append(
                {
                    "day": r["segments"]["date"],
                    "campaign_id": str(r["campaign"]["id"]),
                    "adgroup_id": "",
                    "ad_id": "",
                    "cost_vnd": int(
                        (Decimal(metrics["costMicros"]) / 1000000).quantize(
                            Decimal("1"), rounding=ROUND_HALF_UP
                        )
                    ),
                    "clicks": int(metrics["clicks"]),
                    "impressions": int(metrics["impressions"]),
                }
            )
        cursor = data.get("nextPageToken")
    if cursor and (
        not isinstance(cursor, str) or len(cursor) > 2048 or cursor == payload.get("cursor")
    ):
        raise DomainError("INVALID_PROVIDER_CURSOR", 422)
    # Validate provider responses against the same typed row schema as manual imports.
    from pagefpt.modules.measurement.schemas import CostRow

    rows = [CostRow.model_validate(r).model_dump(mode="json") for r in rows]
    if any(not start <= r["day"] <= end for r in rows):
        raise DomainError("PROVIDER_DATE_MISMATCH", 422)
    return rows, cursor


async def process(db, crypt, http, job):
    record = await db.rpc(
        "dispatch", {"command": {"op": "measurement_sync_read", "id": job["entity_id"]}}
    )
    if record.get("status") != "ready":
        return {"sync_status": record.get("status", "cancelled")}
    try:
        from pagefpt.modules.measurement.credentials import credentials_for

        values = await credentials_for(db, crypt, http, record["connection"]["id"])
        chunk = record.get("chunk")
        if chunk:
            rows, cursor = chunk["rows"], record.get("cursor")
        else:
            rows, cursor = await fetch_page(http, record["connection"], values, record["payload"])
            if record["connection"]["payload"]["provider"] != "ga4":
                staged = await db.rpc(
                    "dispatch",
                    {
                        "command": {
                            "op": "measurement_sync_stage",
                            "id": job["entity_id"],
                            "lease_token": record["lease_token"],
                            "rows": rows,
                            "cursor": cursor,
                        }
                    },
                )
                chunk = staged.get("chunk")
                rows = chunk["rows"] if chunk else []
        if record["connection"]["payload"]["provider"] == "ga4":
            await db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "measurement_traffic_apply",
                        "sync_job_id": job["entity_id"],
                        "sync_lease_token": record["lease_token"],
                        "id": record["connection"]["id"],
                        "actor": record["actor_id"],
                        "rows": rows,
                    }
                },
            )
            rows_for_cost = []
        else:
            rows_for_cost = rows
        for index in range(0, len(rows_for_cost), 50):
            batch = rows_for_cost[index : index + 50]
            command = {
                "connection_id": record["connection"]["id"],
                "actor": record["actor_id"],
                "rows": batch,
                "source": "api",
            }
            preview = await db.rpc(
                "dispatch", {"command": {"op": "measurement_cost_preview", **command}}
            )
            digest = hashlib.sha256(
                json.dumps(
                    {
                        "job": job["entity_id"],
                        "cursor": record["payload"].get("cursor"),
                        "batch": chunk["number"] if chunk else index,
                        **command,
                    },
                    sort_keys=True,
                ).encode()
            ).hexdigest()
            await db.rpc(
                "dispatch",
                {
                    "command": {
                        "op": "measurement_cost_apply",
                        "sync_job_id": job["entity_id"],
                        "sync_lease_token": record["lease_token"],
                        **command,
                        "digest": digest,
                        "versions": preview["versions"],
                        "connection_version": preview["connection_version"],
                    }
                },
            )
        result = {"rows": len(rows), "more": bool(cursor)}
        await db.rpc(
            "dispatch",
            {
                "command": {
                    "op": "measurement_sync_finish",
                    "id": job["entity_id"],
                    "lease_token": record["lease_token"],
                    "cursor": cursor,
                    "chunk_number": chunk["number"] if chunk else None,
                    "result": result,
                }
            },
        )
        return result
    except (
        DomainError,
        httpx.HTTPError,
        ValueError,
        KeyError,
        TypeError,
        ArithmeticError,
        AttributeError,
        IndexError,
    ) as error:
        exc = (
            error
            if isinstance(error, DomainError)
            else DomainError(
                "PROVIDER_SYNC_UNAVAILABLE", 503 if isinstance(error, httpx.HTTPError) else 422
            )
        )
        await db.rpc(
            "dispatch",
            {
                "command": {
                    "op": "measurement_sync_finish",
                    "id": job["entity_id"],
                    "lease_token": record["lease_token"],
                    "error_code": exc.code,
                    "retry": exc.status == 503,
                }
            },
        )
        raise exc from error
