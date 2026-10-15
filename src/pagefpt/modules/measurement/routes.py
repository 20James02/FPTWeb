import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.content.cache import public_json
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.measurement.releases import effective, validate_config
from pagefpt.modules.measurement.schemas import (
    ConfigInput,
    ConfigUpdate,
    ConnectionInput,
    ConnectionUpdate,
    CredentialsInput,
    SimulationInput,
    VersionInput,
)

router = APIRouter(prefix="/api/v1/admin/measurement")
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
    public = effective(data, path=input.path, host=request.url.hostname or "", draft=row)
    return {
        "public_config": public,
        "routes": [
            {
                "connection_id": r["connection_id"],
                "event": r["provider_event"],
                "allowed": input.analytics and input.marketing,
                "reason": "consented"
                if input.analytics and input.marketing
                else "consent_required",
            }
            for r in public["targets"]
            if r["event"] == input.event
        ],
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
    request: Request, path: str = Query(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")
):
    data = effective(await bundle(request), path=path, host=request.url.hostname or "")
    response = public_json(request, data)
    response.headers["Cache-Control"] = "public,max-age=0,s-maxage=30,must-revalidate"
    return response


@router.get("/deliveries")
async def deliveries(request: Request):
    actor = await authorize(request)
    return await dispatch(request, "measurement_delivery_list", actor=actor.user_id)


@router.post("/deliveries/{id}/retry")
async def retry_delivery(id: UUID, request: Request):
    actor = await authorize(request, "measurement.replay", mfa=True)
    return await dispatch(request, "measurement_delivery_retry", actor=actor.user_id, id=str(id))
