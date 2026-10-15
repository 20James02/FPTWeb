import json
from uuid import UUID, uuid4

from fastapi import APIRouter, Request

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.measurement.schemas import ConnectionInput, ConnectionUpdate, CredentialsInput

router = APIRouter(prefix="/api/v1/admin/measurement")


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
