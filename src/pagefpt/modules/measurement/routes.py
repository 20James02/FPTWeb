import asyncio
import json
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.content.cache import public_json
from pagefpt.modules.marketing.routes import SessionResume
from pagefpt.modules.measurement import reporting
from pagefpt.modules.measurement.accounts import router as account_router
from pagefpt.modules.measurement.campaigns import router as campaign_router
from pagefpt.modules.measurement.diagnostics import router as diagnostics_router
from pagefpt.modules.measurement.external_updates import router as external_update_router
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.measurement.releases import effective, validate_config
from pagefpt.modules.measurement.schemas import (
    BulkInput,
    ConfigInput,
    ConfigUpdate,
    ConnectionInput,
    ConnectionUpdate,
    CredentialsInput,
    SimulationInput,
    VersionInput,
)
from pagefpt.modules.measurement.simulation import simulate_routes
from pagefpt.modules.measurement.sync import router as sync_router

router = APIRouter(prefix="/api/v1/admin/measurement")
router.include_router(diagnostics_router)
public_router = APIRouter(prefix="/api/v1/measurement")


@router.get("/connections")
async def connections(request: Request):
    actor = await authorize(request)
    return await dispatch(request, "measurement_connection_list", actor=actor.user_id)


@router.post("/connections", status_code=201)
async def create_connection(input: ConnectionInput, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    return await dispatch(
        request,
        "measurement_connection_save",
        actor=actor.user_id,
        id=str(uuid4()),
        payload=input.model_dump(mode="json"),
        expected_version=0,
    )


@router.put("/connections/{id}")
async def update_connection(id: UUID, input: ConnectionUpdate, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    return await dispatch(
        request,
        "measurement_connection_save",
        actor=actor.user_id,
        id=str(id),
        payload=input.model_dump(mode="json", exclude={"expected_version"}),
        expected_version=input.expected_version,
    )


@router.post("/connections/{id}/credentials")
async def credentials(id: UUID, input: CredentialsInput, request: Request):
    actor = await authorize(request, "measurement.credentials", mfa=True)
    ciphertext = crypto(request).encrypt(
        json.dumps({k: v.get_secret_value() for k, v in input.values.items()})
    )
    return await dispatch(
        request,
        "measurement_secret_save",
        actor=actor.user_id,
        id=str(id),
        ciphertext=ciphertext,
        expected_version=input.expected_version,
        expires_at=input.expires_at.isoformat() if input.expires_at else None,
    )


async def bundle(request):
    return await dispatch(
        request, "measurement_bundle", environment=request.app.state.settings.environment
    )


@router.get("/configs")
async def configs(request: Request):
    actor = await authorize(request)
    return await dispatch(request, "measurement_config_list", actor=actor.user_id)


@router.post("/configs", status_code=201)
async def config_create(input: ConfigInput, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    return await dispatch(
        request,
        "measurement_config_save",
        actor=actor.user_id,
        id=str(uuid4()),
        payload=input.model_dump(mode="json", exclude_none=True),
        expected_version=0,
    )


@router.put("/configs/{id}")
async def config_update(id: UUID, input: ConfigUpdate, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    return await dispatch(
        request,
        "measurement_config_save",
        actor=actor.user_id,
        id=str(id),
        payload=input.model_dump(mode="json", exclude_none=True, exclude={"expected_version"}),
        expected_version=input.expected_version,
    )


async def draft_at(request, id, actor, version):
    row = await dispatch(
        request,
        "measurement_config_read",
        actor=actor.user_id,
        id=str(id),
        expected_version=version,
    )
    data = await dispatch(request, "measurement_bundle", environment=row["payload"]["environment"])
    return row, data


@router.post("/configs/{id}/validate")
async def config_validate(id: UUID, input: VersionInput, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    row, data = await draft_at(request, id, actor, input.expected_version)
    return validate_config(row["payload"], data)


@router.post("/configs/{id}/simulate")
async def config_simulate(id: UUID, input: SimulationInput, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    row, data = await draft_at(request, id, actor, input.expected_version)
    validate_config(row["payload"], data)
    public = effective(
        data,
        path=input.path,
        host=request.url.hostname or "",
        campaign=row["payload"]["scope_key"] if row["payload"]["scope"] == "campaign" else "",
        draft=row,
    )
    return {
        "public_config": public,
        "routes": simulate_routes(public, data, input),
        "dry_run": True,
    }


@router.post("/configs/{id}/publish")
async def config_publish(id: UUID, input: VersionInput, request: Request):
    actor = await authorize(request, "measurement.publish", mfa=True)
    row, data = await draft_at(request, id, actor, input.expected_version)
    validate_config(row["payload"], data)
    return await dispatch(
        request,
        "measurement_config_publish",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


@router.get("/releases")
async def releases(request: Request):
    actor = await authorize(request)
    return await dispatch(request, "measurement_release_list", actor=actor.user_id)


@router.post("/releases/{id}/restore")
async def restore(id: UUID, input: VersionInput, request: Request):
    actor = await authorize(request, "measurement.publish", mfa=True)
    return await dispatch(
        request,
        "measurement_release_restore",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


@router.post("/connections/{id}/disable")
async def disable(id: UUID, input: VersionInput, request: Request):
    actor = await authorize(request, "measurement.publish", mfa=True)
    return await dispatch(
        request,
        "measurement_connection_disable",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


@public_router.get("/config")
async def public_config(
    request: Request,
    path: str = Query(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$"),
    campaign: str = Query(default="", max_length=40, pattern=r"^[0-9]*$"),
    platform: str = Query(
        default="", max_length=20, pattern=r"^(google|meta|facebook|instagram)?$"
    ),
):
    key = await dispatch(
        request,
        "measurement_campaign_key",
        environment=request.app.state.settings.environment,
        platform=platform,
        campaign=campaign,
    )
    data = effective(
        await bundle(request),
        path=path,
        host=request.url.hostname or "",
        campaign=key.get("key", ""),
    )
    response = public_json(request, data)
    response.headers["Cache-Control"] = "public,max-age=0,s-maxage=30,must-revalidate"
    return response


class SessionConfigInput(SessionResume):
    path: str = Field(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")


@public_router.post("/config/session")
async def session_config(input: SessionConfigInput, request: Request):
    claims = crypto(request).verify(input.session_token, "session", datetime.now(UTC))
    data = await bundle(request)
    baseline = effective(data, path=input.path, host=request.url.hostname or "")
    source = await dispatch(
        request,
        "measurement_session_source",
        id=claims["id"],
        window_days=baseline["attribution_window_days"],
    )
    key = await dispatch(
        request,
        "measurement_campaign_key",
        environment=request.app.state.settings.environment,
        **source,
    )
    return JSONResponse(
        effective(
            data, path=input.path, host=request.url.hostname or "", campaign=key.get("key", "")
        ),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/deliveries")
async def deliveries(request: Request):
    actor = await authorize(request)
    return await dispatch(request, "measurement_delivery_list", actor=actor.user_id)


@router.post("/deliveries/{id}/retry")
async def retry_delivery(id: UUID, request: Request):
    actor = await authorize(request, "measurement.replay", mfa=True)
    return await dispatch(request, "measurement_delivery_retry", actor=actor.user_id, id=str(id))


router.add_api_route("/cost-imports/preview", reporting.preview, methods=["POST"])
router.add_api_route("/cost-imports/apply", reporting.apply, methods=["POST"])


@router.get("/reports")
async def measurement_report(request: Request, start: date, end: date):
    return await reporting.report(request, start, end)


router.include_router(account_router)

router.include_router(sync_router)
router.include_router(campaign_router)

router.include_router(external_update_router)


@router.post("/bulk")
async def bulk(input: BulkInput, request: Request):
    await authorize(request, "measurement.publish", mfa=True)
    semaphore = asyncio.Semaphore(4)

    async def run(item):
        async with semaphore:
            try:
                handler = disable if input.action == "disable" else config_publish
                result = await handler(
                    item.id, VersionInput(expected_version=item.expected_version), request
                )
                return {"id": str(item.id), "ok": True, "result": result}
            except DomainError as exc:
                return {"id": str(item.id), "ok": False, "code": exc.code, "status": exc.status}

    return {"items": await asyncio.gather(*(run(item) for item in input.items))}
