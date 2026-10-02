from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import model_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.catalog.schemas import VersionCommand

router = APIRouter(prefix="/api/v1/admin/pages")


class ScheduleInput(VersionCommand):
    publish_at: datetime

    @model_validator(mode="after")
    def aware_future(self):
        if self.publish_at.tzinfo is None or self.publish_at <= datetime.now(UTC):
            raise ValueError("Future timezone-aware time required")
        return self


@router.post("/{id}/schedule", status_code=201)
async def schedule(id: UUID, input: ScheduleInput, request: Request):
    actor = await current_actor(request)
    check(actor, "content.publish", mfa=True)
    return await dispatch(
        request, "page_schedule", actor=actor.user_id, id=str(id), **input.model_dump(mode="json")
    )
