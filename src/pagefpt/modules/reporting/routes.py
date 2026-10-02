from datetime import date
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin")


class RebuildInput(Command):
    day: date


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
