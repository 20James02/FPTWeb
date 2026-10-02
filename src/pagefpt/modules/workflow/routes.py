import hmac
from typing import Literal

from fastapi import APIRouter, Request

from pagefpt.api.dependencies import crypto
from pagefpt.core.errors import DomainError
from pagefpt.modules.pricing.schemas import Command
from pagefpt.modules.workflow.worker import Worker

router = APIRouter()


class ProcessInput(Command):
    queue: Literal["lead_local", "lead_external", "conversions", "notifications", "maintenance"] = (
        "lead_local"
    )


def verify_job(request):
    secret = request.app.state.settings.job_secret.get_secret_value()
    supplied = request.headers.get("x-job-secret", "")
    cron = request.headers.get("authorization", "")
    if len(secret) < 32 or not (
        hmac.compare_digest(supplied, secret) or hmac.compare_digest(cron, "Bearer " + secret)
    ):
        raise DomainError("UNAUTHENTICATED", 401)


@router.post("/internal/jobs/process", include_in_schema=False)
async def process(input: ProcessInput, request: Request):
    verify_job(request)
    return await Worker(
        request.app.state.db,
        crypto(request),
        request.app.state.geoip,
        request.app.state.storage,
        request.app.state.notifications,
        request.app.state.conversions,
    ).process(input.queue)


@router.get("/internal/jobs/recover", include_in_schema=False)
async def recover(request: Request):
    verify_job(request)
    worker = Worker(
        request.app.state.db,
        crypto(request),
        request.app.state.geoip,
        request.app.state.storage,
        request.app.state.notifications,
        request.app.state.conversions,
    )
    await request.app.state.db.rpc("dispatch", {"command": {"op": "schedule_tick"}})
    # Bounded total: at most one small batch per queue, independent queue deadlines.
    import asyncio

    results = await asyncio.gather(
        *(
            worker.process(q, max_messages=3, deadline_seconds=15)
            for q in ("lead_local", "lead_external", "conversions", "notifications", "maintenance")
        )
    )
    return {"queues": results}
