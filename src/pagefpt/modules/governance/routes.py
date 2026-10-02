from uuid import UUID

from fastapi import APIRouter, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.governance.schemas import CostInput, ExportInput, PrivacyInput

router = APIRouter(prefix="/api/v1/admin")


@router.get("/reports")
async def reports(request: Request):
    actor = await current_actor(request)
    check(actor, "report.read")
    return await dispatch(request, "report", actor=actor.user_id)


@router.post("/costs", status_code=201)
async def costs(input: CostInput, request: Request):
    actor = await current_actor(request)
    check(actor, "marketing.write")
    return await dispatch(
        request,
        "resource_save",
        actor=actor.user_id,
        kind="cost",
        payload=input.model_dump(mode="json"),
    )


@router.post("/privacy/requests", status_code=201)
async def privacy(input: PrivacyInput, request: Request):
    actor = await current_actor(request)
    check(actor, "governance.write", mfa=True)
    return await dispatch(
        request, "privacy_request", actor=actor.user_id, payload=input.model_dump(mode="json")
    )


@router.post("/privacy/requests/{id}/execute")
async def execute_privacy(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "governance.delete", mfa=True)
    return await dispatch(request, "privacy_execute", actor=actor.user_id, id=str(id))


@router.post("/exports", status_code=201)
async def export(input: ExportInput, request: Request):
    actor = await current_actor(request)
    check(actor, "governance.export", str(input.branch_id) if input.branch_id else None, mfa=True)
    request.app.state.storage.require()
    return await dispatch(
        request,
        "export_create",
        actor=actor.user_id,
        branch_id=str(input.branch_id) if input.branch_id else None,
    )


@router.get("/exports/{id}")
async def export_result(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "governance.export", mfa=True)
    result = await dispatch(request, "export_read", actor=actor.user_id, id=str(id))
    # Result is a list of bounded CSV chunks, not an unbounded serverless download.
    if result["status"] == "complete":
        result["download_urls"] = [
            await request.app.state.storage.sign_get(k) for k in result["payload"]["parts"]
        ]
        await dispatch(request, "audit_download", actor=actor.user_id, id=str(id))
    return result
