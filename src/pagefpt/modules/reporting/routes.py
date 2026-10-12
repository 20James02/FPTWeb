from datetime import date, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin")


class RebuildInput(Command):
    day: date


@router.get("/reports/branches")
async def report_branches(request: Request):
    actor = await current_actor(request)
    check(actor, "report.read")
    return await dispatch(
        request, "account_branches", actor=actor.user_id, permission="report.read"
    )


@router.get("/reports/analytics")
async def analytics(
    request: Request,
    start: date | None = None,
    end: date | None = None,
    branch_id: UUID | None = None,
    campaign: str | None = Query(default=None, max_length=100),
):
    actor = await current_actor(request)
    check(actor, "report.read", str(branch_id) if branch_id else None)
    end = end or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    start = start or end - timedelta(days=29)
    if start > end or (end - start).days > 92:
        raise DomainError("INVALID_DATE_RANGE", 422)
    return await dispatch(
        request,
        "report_analytics",
        actor=actor.user_id,
        start=start.isoformat(),
        end=end.isoformat(),
        branch_id=str(branch_id) if branch_id else None,
        campaign=campaign,
    )


@router.post("/reports/rebuild")
async def rebuild(input: RebuildInput, request: Request):
    actor = await current_actor(request)
    check(actor, "report.read")
    return await dispatch(
        request, "metrics_rebuild", actor=actor.user_id, day=input.day.isoformat()
    )


@router.get("/reports/daily")
async def daily(request: Request):
    actor = await current_actor(request)
    check(actor, "report.read")
    return await dispatch(request, "metrics_daily", actor=actor.user_id)


@router.get("/audit")
async def audit(request: Request, after: int = Query(default=0, ge=0)):
    actor = await current_actor(request)
    check(actor, "governance.audit", mfa=True)
    return await dispatch(request, "audit_list", actor=actor.user_id, after=after)


@router.get("/jobs")
async def jobs(request: Request):
    actor = await current_actor(request)
    check(actor, "workflow.manage")
    return await dispatch(request, "job_list", actor=actor.user_id)


@router.post("/jobs/{id}/replay")
async def replay(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "workflow.manage", mfa=True)
    return await dispatch(
        request, "job_replay", actor=actor.user_id, id=str(id), request_id=str(uuid4())
    )
