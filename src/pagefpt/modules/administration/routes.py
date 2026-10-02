import asyncio
from datetime import UTC, date, datetime
from time import perf_counter
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import Field, model_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.identity.schemas import Shift
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])
GLOBAL = "00000000-0000-0000-0000-000000000000"


class OperationalSettings(Command):
    expected_version: int = Field(ge=0)
    sla_minutes: int = Field(default=10, ge=1, le=240)
    sound_alert: bool = True
    shift: Shift = Field(default_factory=Shift)

    @model_validator(mode="after")
    def working_days(self):
        if not self.shift.weekdays:
            raise ValueError("At least one working day required")
        return self


@router.get("/operations/settings")
async def settings_read(request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read" if actor.permits("lead.read") else "workflow.manage")
    return await dispatch(request, "operational_settings_read", actor=actor.user_id)


@router.put("/operations/settings")
async def settings_save(input: OperationalSettings, request: Request):
    actor = await current_actor(request)
    check(actor, "workflow.manage", GLOBAL, mfa=True)
    return await dispatch(
        request,
        "operational_settings_save",
        actor=actor.user_id,
        expected_version=input.expected_version,
        payload=input.model_dump(mode="json", exclude={"expected_version"}),
    )


@router.get("/operations/status")
async def status(request: Request):
    actor = await current_actor(request)
    check(actor, "workflow.manage")
    config = request.app.state.settings
    started = perf_counter()
    try:
        await asyncio.wait_for(request.app.state.db.rpc("health", {}), timeout=2)
        database = {"status": "verified", "latency_ms": round((perf_counter() - started) * 1000, 1)}
    except (DomainError, TimeoutError):
        database = {"status": "unavailable", "latency_ms": None}
    storage_configured = bool(
        config.r2_endpoint
        and config.r2_bucket
        and config.r2_access_key.get_secret_value()
        and config.r2_secret_key.get_secret_value()
    )
    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "environment": config.environment,
        "database": database,
        "storage": {"status": "configured_unverified" if storage_configured else "unconfigured"},
        "auth": {
            "status": "configured_unverified"
            if config.supabase_url and config.supabase_auth_key
            else "unconfigured",
            "aal": actor.aal,
        },
        "conversions": {
            "status": "configured_unverified"
            if config.integrations_enabled and config.conversion_url
            else "disabled"
        },
        "notifications": {
            "status": "configured_unverified" if config.notification_url else "unconfigured"
        },
    }


RESOURCE_PERMISSIONS = {
    "campaign": "marketing.write",
    "experiment": "marketing.write",
    "integration": "marketing.write",
    "cost": "marketing.write",
    "page": "content.write",
    "media": "content.write",
    "promotion": "catalog.write",
    "export": "governance.export",
    "privacy": "governance.write",
}


@router.get("/workspace/{kind}")
async def workspace(
    kind: Literal[
        "campaign",
        "experiment",
        "integration",
        "cost",
        "page",
        "media",
        "promotion",
        "export",
        "privacy",
    ],
    request: Request,
    before: UUID | None = None,
    limit: int = Query(default=30, ge=1, le=100),
):
    actor = await current_actor(request)
    check(actor, RESOURCE_PERMISSIONS[kind], mfa=kind in {"integration", "export", "privacy"})
    result = await dispatch(
        request,
        "admin_resource_list",
        actor=actor.user_id,
        kind=kind,
        before=str(before) if before else None,
        limit=limit,
    )
    items = result["items"]
    return {
        "items": items[:limit],
        "next_before": items[limit - 1]["id"] if len(items) > limit else None,
    }


@router.get("/reports/summary")
async def summary(
    request: Request,
    start: date | None = None,
    end: date | None = None,
    branch_id: UUID | None = None,
    campaign: str | None = Query(default=None, max_length=100),
):
    actor = await current_actor(request)
    check(actor, "report.read", str(branch_id) if branch_id else None)
    if start and end and (start > end or (end - start).days > 366):
        raise DomainError("INVALID_DATE_RANGE", 422)
    return await dispatch(
        request,
        "report_summary",
        actor=actor.user_id,
        start=start.isoformat() if start else None,
        end=end.isoformat() if end else None,
        branch_id=str(branch_id) if branch_id else None,
        campaign=campaign,
    )


class LeadViewFilters(Command):
    status: str | None = Field(default=None, max_length=32)
    q: str | None = Field(default=None, max_length=100)
    branch_id: UUID | None = None
    assignee_id: UUID | None = None
    region_id: UUID | None = None
    start: date | None = None
    end: date | None = None
    overdue: bool = False


class LeadViewInput(Command):
    expected_version: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=80)
    filters: LeadViewFilters


@router.get("/lead-views")
async def lead_views(request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "lead_view_list", actor=actor.user_id)


@router.post("/lead-views", status_code=201)
async def create_lead_view(input: LeadViewInput, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(
        request,
        "lead_view_save",
        actor=actor.user_id,
        expected_version=input.expected_version,
        payload=input.model_dump(mode="json", exclude={"expected_version"}),
    )


@router.put("/lead-views/{id}")
async def update_lead_view(id: UUID, input: LeadViewInput, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(
        request,
        "lead_view_save",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        payload=input.model_dump(mode="json", exclude={"expected_version"}),
    )


@router.delete("/lead-views/{id}")
async def delete_lead_view(id: UUID, request: Request, expected_version: int = Query(ge=1)):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(
        request,
        "lead_view_delete",
        actor=actor.user_id,
        id=str(id),
        expected_version=expected_version,
    )


@router.get("/lead-counts")
async def lead_counts(request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "lead_counts", actor=actor.user_id)
