"""Durable display configuration; defaults contain no commercial price claims."""

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import Field, field_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.pricing.schemas import Command

BANNER_ZONES = {
    "hero_slider",
    "showcase_posters",
    "ribbon_banner",
    "promo_grid",
    "app_banner",
    "floating_promo",
}


class DisplaySettings(Command):
    fpt_anim: bool = True
    fpt_anim_style: Literal["wave", "bounce", "glow"] = "wave"
    runline_enabled: bool = True
    runline_speed: Literal["slow", "normal", "fast"] = "normal"
    runline_text: str = Field(
        default="Tư vấn gói dịch vụ và giá theo khu vực. Gửi yêu cầu để được xác nhận.",
        max_length=2000,
    )
    banner_zones: dict[str, bool] = Field(
        default_factory=lambda: {name: True for name in sorted(BANNER_ZONES)}
    )
    lenis_scroll: bool = True
    tilt_parallax: bool = True


class DisplayPatch(Command):
    expected_version: int = Field(ge=0)
    fpt_anim: bool | None = None
    fpt_anim_style: Literal["wave", "bounce", "glow"] | None = None
    runline_enabled: bool | None = None
    runline_speed: Literal["slow", "normal", "fast"] | None = None
    runline_text: str | None = Field(default=None, max_length=2000)
    banner_zones: dict[str, bool] | None = None
    lenis_scroll: bool | None = None
    tilt_parallax: bool | None = None

    @field_validator("banner_zones")
    @classmethod
    def known_zones(cls, value):
        if value and not set(value) <= BANNER_ZONES:
            raise ValueError("Unknown banner zone")
        return value


async def get_display_settings(request) -> dict:
    defaults = DisplaySettings().model_dump()
    try:
        record = await dispatch(request, "display_settings_read", defaults=defaults)
    except DomainError:
        if request.app.state.settings.environment not in {"development", "test"}:
            raise
        return {**defaults, "version": 0}
    return {
        **DisplaySettings.model_validate(record["payload"]).model_dump(),
        "version": record["version"],
    }


router = APIRouter(prefix="/api/v1/system", tags=["Display settings"])


@router.get("/display-settings")
async def read(request: Request):
    return await get_display_settings(request)


@router.post("/display-settings")
async def save(input: DisplayPatch, request: Request):
    actor = await current_actor(request)
    check(actor, "content.publish", mfa=True)
    record = await dispatch(
        request,
        "display_settings_save",
        actor=actor.user_id,
        expected_version=input.expected_version,
        defaults=DisplaySettings().model_dump(),
        payload=input.model_dump(exclude={"expected_version"}, exclude_none=True),
    )
    return {"success": True, "settings": {**record["payload"], "version": record["version"]}}
