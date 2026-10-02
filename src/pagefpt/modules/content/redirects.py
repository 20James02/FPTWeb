from typing import Literal
from urllib.parse import unquote

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import Field, field_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1")


def local_path(value):
    decoded = unquote(value).lower()
    if (
        not value.startswith("/")
        or decoded.startswith("//")
        or "\\" in decoded
        or "?" in value
        or "#" in value
        or any(ord(c) < 32 for c in decoded)
    ):
        raise ValueError("A local absolute path is required")
    if decoded.split("/")[1] in {
        "api",
        "admin",
        "internal",
        "static",
        "health",
        "receipt",
    } or ".." in decoded.split("/"):
        raise ValueError("Reserved path")
    return value


class RedirectInput(Command):
    path: str = Field(min_length=1, max_length=250)
    target: str = Field(min_length=1, max_length=250)
    status_code: Literal[301, 302, 307, 308] = 301

    @field_validator("path", "target")
    @classmethod
    def safe_path(cls, value):
        return local_path(value)


@router.put("/admin/redirects")
async def save(input: RedirectInput, request: Request):
    actor = await current_actor(request)
    check(actor, "content.publish", mfa=True)
    return await dispatch(request, "redirect_save", actor=actor.user_id, **input.model_dump())


@router.get("/admin/redirects")
async def listing(request: Request):
    actor = await current_actor(request)
    check(actor, "content.write")
    return await dispatch(request, "redirect_list", actor=actor.user_id)


@router.get("/redirects/resolve")
async def resolve(request: Request, path: str = Query(max_length=250)):
    data = await dispatch(request, "redirect_read", path=path)
    return RedirectResponse(data["target"], status_code=data["status_code"])
