"""Resolve validated media into the plan's draft/publication snapshot."""

import re

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError


async def plan_payload(input, request, actor):
    data = input.model_dump(mode="json")
    if not input.image_id:
        return data
    data.update(await media_image(input.image_id, request, actor))
    return data


async def media_image(image_id, request, actor):
    asset = await dispatch(request, "resource_get", actor=actor, kind="media", id=str(image_id))
    media = asset["payload"]
    key = media.get("object_key", "")
    if (
        asset["status"] == "retired"
        or media.get("state") != "ready"
        or not re.fullmatch(r"images/[a-f0-9]{64}\.webp", key)
    ):
        raise DomainError("INVALID_PLAN_IMAGE", 422)
    domain = request.app.state.settings.media_domain.rstrip("/")
    if not domain:
        raise DomainError("MEDIA_DOMAIN_UNCONFIGURED", 503)
    return {
        "image_url": domain + "/" + key,
        "image_width": media["width"],
        "image_height": media["height"],
    }
