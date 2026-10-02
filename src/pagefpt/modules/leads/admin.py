import json
from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import Field, model_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.catalog.schemas import VersionCommand
from pagefpt.modules.pricing.schemas import Command
from pagefpt.modules.workflow.sla import compute_sla

router = APIRouter(prefix="/api/v1/admin")


class AssignmentCommand(VersionCommand):
    assignee_id: UUID | None = None


class BulkAssignmentItem(VersionCommand):
    id: UUID


class BulkAssignmentCommand(Command):
    assignee_id: UUID
    items: list[BulkAssignmentItem] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_leads(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("Duplicate lead IDs")
        return self


class TransitionCommand(VersionCommand):
    status: Literal[
        "new",
        "assigned",
        "contacting",
        "contacted",
        "qualified",
        "survey",
        "quoted",
        "closed",
        "installed",
        "unreachable",
        "no_infrastructure",
        "invalid",
        "duplicate",
        "rejected",
    ]
    reason: str = Field(default="", max_length=500)
    installation: dict | None = None


class ObservationCommand(Command):
    field: Literal[
        "otp",
        "contacted",
        "needs_confirmed",
        "need",
        "region",
        "infrastructure",
        "home_isp",
        "phone_carrier",
    ]
    value: bool | str
    status: Literal["confirmed", "inferred", "unknown"] = "confirmed"
    evidence_ref: str = Field(min_length=1, max_length=500)
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def evidence_type(self):
        if self.field in {"otp", "contacted", "needs_confirmed"} and not isinstance(
            self.value, bool
        ):
            raise ValueError("Boolean evidence required")
        if self.field in {"need", "region", "infrastructure"} and self.value not in {
            True,
            False,
            "yes",
            "no",
            "unknown",
        }:
            raise ValueError("Fit requires yes/no/unknown or boolean")
        if isinstance(self.value, str) and len(self.value) > 250:
            raise ValueError("Observation too long")
        if self.expires_at is not None and self.expires_at.tzinfo is None:
            raise ValueError("Timezone required")
        return self


class ActivityCommand(Command):
    kind: Literal["call", "note", "appointment", "complaint", "resolved"]
    notes: str = Field(default="", max_length=2000)
    due_at: datetime | None = None


@router.get("/leads")
async def leads(
    request: Request,
    limit: int = Query(default=30, ge=1, le=100),
    cursor: str | None = None,
    status: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=100),
    branch_id: UUID | None = None,
    assignee_id: UUID | None = None,
    region_id: UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    overdue: bool = False,
):
    actor = await current_actor(request)
    check(actor, "lead.read")
    filters = {
        "q": q.strip() if q else None,
        "branch_id": str(branch_id) if branch_id else None,
        "assignee_id": str(assignee_id) if assignee_id else None,
        "region_id": str(region_id) if region_id else None,
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
        "overdue": overdue,
    }
    if start and end and start > end:
        from pagefpt.core.errors import DomainError

        raise DomainError("INVALID_DATE_RANGE", 422)
    data = {"limit": limit + 1, "status": status, **filters}
    if cursor:
        claims = crypto(request).verify(cursor, "lead_cursor", datetime.now(UTC))
        from pagefpt.core.errors import DomainError

        if (
            claims["actor"] != actor.user_id
            or claims.get("filter") != status
            or claims.get("filters", {**dict.fromkeys(filters), "overdue": False}) != filters
        ):
            raise DomainError("INVALID_CURSOR", 422)
        data.update(before_at=claims["at"], before_id=claims["id"])
    result = await dispatch(request, "lead_list", actor=actor.user_id, **data)
    items = result["items"]
    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        last = items[-1]
        next_cursor = crypto(request).sign(
            {
                "purpose": "lead_cursor",
                "actor": actor.user_id,
                "filter": status,
                "filters": filters,
                "id": last["id"],
                "at": last["created_at"],
                "exp": datetime.now(UTC).timestamp() + 3600,
            }
        )
    return {"items": items, "next_cursor": next_cursor}


@router.get("/changes")
async def changes(request: Request, after: int = Query(default=0, ge=0)):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "changes", actor=actor.user_id, after=after)


@router.get("/leads/{id}")
async def detail(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "lead_detail", actor=actor.user_id, id=str(id))


@router.post("/leads/{id}/reveal")
async def reveal(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.pii", mfa=True)
    data = await dispatch(request, "lead_reveal", actor=actor.user_id, id=str(id))
    return json.loads(crypto(request).decrypt(data["pii_ciphertext"]))


@router.post("/leads/{id}/assignments")
async def assign(id: UUID, input: AssignmentCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.assign")
    due = compute_sla(
        datetime.now(UTC), {"weekdays": [0, 1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"}
    )
    return await dispatch(
        request,
        "manual_assign" if input.assignee_id else "assign",
        assignee_id=str(input.assignee_id) if input.assignee_id else None,
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        sla_due_at=due.isoformat(),
    )


@router.post("/leads/{id}/transitions")
async def transition(id: UUID, input: TransitionCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    return await dispatch(
        request, "transition", actor=actor.user_id, id=str(id), **input.model_dump(mode="json")
    )


@router.post("/leads/{id}/observations")
async def observation(id: UUID, input: ObservationCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "intelligence.write")
    return await dispatch(
        request,
        "observation",
        actor=actor.user_id,
        id=str(id),
        payload=input.model_dump(mode="json"),
    )


@router.post("/leads/{id}/activities")
async def activity(id: UUID, input: ActivityCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    data = input.model_dump(mode="json")
    data["notes_ciphertext"] = crypto(request).encrypt(data.pop("notes"))
    return await dispatch(request, "activity", actor=actor.user_id, id=str(id), payload=data)


@router.get("/assignees")
async def assignees(request: Request):
    actor = await current_actor(request)
    check(actor, "lead.assign")
    return await dispatch(request, "assignees", actor=actor.user_id)


@router.post("/lead-assignments")
async def bulk_assign(input: BulkAssignmentCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.assign")
    return await dispatch(
        request, "bulk_assign", actor=actor.user_id, **input.model_dump(mode="json")
    )
