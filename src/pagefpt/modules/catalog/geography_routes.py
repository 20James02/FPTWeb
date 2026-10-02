from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.catalog.geography import import_rows

router = APIRouter()


class GeographySyncInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    branch_id: UUID
    province_codes: list[int] = Field(default_factory=list, max_length=100)
    source: Literal["live", "bundled"] = "live"


@router.get("/admin/locations/source")
async def source_preview(request: Request):
    actor = await current_actor(request)
    check(actor, "catalog.write")
    snapshot = request.app.state.geography.bundled
    return {
        **{k: v for k, v in snapshot.items() if k != "data"},
        "provinces": [
            {"code": p["code"], "name": p["name"], "ward_count": len(p["wards"])}
            for p in snapshot["data"]
        ],
        "syncs": await dispatch(request, "geography_status", actor=actor.user_id),
    }


@router.post("/admin/locations/sync")
async def sync_locations(input: GeographySyncInput, request: Request):
    actor = await current_actor(request)
    branch = str(input.branch_id)
    check(actor, "catalog.write", branch, mfa=True)
    snapshot = await request.app.state.geography.load(input.source)
    try:
        rows = import_rows(snapshot, branch, input.province_codes)
    except ValueError as exc:
        raise DomainError("INVALID_PROVINCE_CODE", 422) from exc
    metadata = {k: v for k, v in snapshot.items() if k != "data"}
    result = await dispatch(
        request,
        "geography_sync",
        actor=actor.user_id,
        branch_id=branch,
        rows=rows,
        source=metadata,
        province_codes=sorted(set(input.province_codes)),
    )
    return {**result, "source": metadata}
