import asyncio
import hashlib
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from pydantic import Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.media.validation import validate_image
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin/media")


class UploadInput(Command):
    filename: str = Field(min_length=1, max_length=200)
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(ge=1, le=10 * 1024 * 1024)


@router.post("/upload-intents", status_code=201)
async def upload_intent(input: UploadInput, request: Request):
    actor = await current_actor(request)
    check(actor, "content.write")
    storage = request.app.state.storage
    storage.require()
    key = "quarantine/" + str(uuid4())
    data = {
        "filename": input.filename,
        "object_key": key,
        "content_type": input.content_type,
        "declared_size": input.size_bytes,
        "state": "quarantine",
    }
    result = await dispatch(
        request, "resource_save", actor=actor.user_id, kind="media", payload=data
    )
    url = await storage.sign_put(key, input.content_type)
    return {
        "id": result["id"],
        "upload_url": url,
        "expires_in": 300,
        "headers": {"Content-Type": input.content_type},
    }


@router.post("/{id}/finalize")
async def finalize(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "content.write")
    asset = await dispatch(request, "resource_get", actor=actor.user_id, kind="media", id=str(id))
    if asset["payload"].get("state") == "ready":
        return {"id": str(id), "state": "ready", "url": asset["payload"]["url"]}
    storage = request.app.state.storage
    image = await asyncio.to_thread(
        validate_image, await storage.read(asset["payload"]["object_key"])
    )
    key = "images/" + hashlib.sha256(image["data"]).hexdigest() + ".webp"
    if not request.app.state.settings.media_domain:
        raise DomainError("MEDIA_DOMAIN_UNCONFIGURED", 503)
    await storage.write(key, image["data"], "image/webp", public=True)
    result = await dispatch(
        request,
        "media_finish",
        actor=actor.user_id,
        id=str(id),
        expected_version=asset["version"],
        payload={
            "filename": asset["payload"].get("filename", ""),
            "object_key": key,
            "quarantine_key": asset["payload"]["object_key"],
            "state": "ready",
            "width": image["width"],
            "height": image["height"],
            "url": request.app.state.settings.media_domain.rstrip("/") + "/" + key,
        },
    )
    # Repeated signed PUT can only replace quarantine, never the published hash object.
    await storage.delete(asset["payload"]["object_key"])
    return {"id": result["id"], "state": "ready", "url": result["payload"]["url"]}
