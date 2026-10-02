from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import Field, field_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.catalog.schemas import VersionCommand

router = APIRouter(prefix="/api/v1/admin")


class AppointmentCreate(VersionCommand):
    due_at: datetime
    kind: Literal["callback", "survey", "installation"] = "callback"
    notes: str = Field(default="", max_length=2000)

    @field_validator("due_at")
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError("Timezone required")
        return value


class AppointmentUpdate(VersionCommand):
    status: Literal["pending", "completed", "cancelled"]
    due_at: datetime | None = None

    @field_validator("due_at")
    @classmethod
    def aware(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Timezone required")
        return value


@router.get("/leads/{id}/appointments")
async def listing(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "appointment_list", actor=actor.user_id, id=str(id))


@router.post("/leads/{id}/appointments", status_code=201)
async def create(id: UUID, input: AppointmentCreate, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    data = input.model_dump(mode="json")
    data["notes_ciphertext"] = crypto(request).encrypt(data.pop("notes"))
    return await dispatch(
        request, "appointment_create", actor=actor.user_id, id=str(id), payload=data
    )


@router.patch("/appointments/{id}")
async def update(id: UUID, input: AppointmentUpdate, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    return await dispatch(
        request,
        "appointment_update",
        actor=actor.user_id,
        id=str(id),
        payload=input.model_dump(mode="json"),
    )
