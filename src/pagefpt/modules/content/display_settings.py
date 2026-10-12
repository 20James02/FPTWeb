"""Durable display configuration; defaults contain no commercial price claims."""

import re
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import Field, field_validator, model_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.catalog.images import plan_payload
from pagefpt.modules.catalog.schemas import PlanInput
from pagefpt.modules.content.navigation_settings import (
    NavigationItem,
    NavigationLink,
    default_navigation,
    unique_navigation,
)
from pagefpt.modules.pricing.schemas import Command

BANNER_ZONES = {
    "hero_slider",
    "showcase_posters",
    "ribbon_banner",
    "promo_grid",
    "app_banner",
    "floating_promo",
}


def normalize_contact_phone(value: str) -> str:
    if not re.fullmatch(r"[+0-9 .()-]+", value):
        raise ValueError("Nhập số điện thoại Việt Nam hợp lệ")
    phone = re.sub(r"[ .()-]", "", value)
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    elif phone.startswith("84"):
        phone = "0" + phone[2:]
    if not re.fullmatch(r"0(?:[35789][0-9]{8}|2[0-9]{9})|1[89]00[0-9]{4,6}", phone):
        raise ValueError("Nhập số điện thoại Việt Nam hợp lệ")
    return phone


class PromoSlideInput(Command):
    title: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=160)
    image_id: UUID | None = None
    image_alt: str = Field(default="", max_length=120)
    cta_label: str = Field(default="Nhận tư vấn", min_length=1, max_length=24)
    plan_id: UUID | None = None
    href: str = Field(default="", max_length=300)
    video_url: str = Field(default="", max_length=300)
    enabled: bool = True
    start: datetime | None = None
    end: datetime | None = None

    @field_validator("href", "video_url")
    @classmethod
    def destination(cls, value, info):
        if not value:
            return value
        value = NavigationLink(label="Slide", href=value).href
        if info.field_name == "video_url":
            parsed = urlparse(value)
            if parsed.scheme != "https" or not parsed.path.lower().endswith((".mp4", ".webm")):
                raise ValueError("Video cần URL HTTPS trực tiếp của tệp MP4 hoặc WebM")
        return value

    @model_validator(mode="after")
    def window(self):
        if any(d is not None and d.tzinfo is None for d in (self.start, self.end)):
            raise ValueError("Thời gian cần có múi giờ")
        if self.start and self.end and self.end <= self.start:
            raise ValueError("Kết thúc phải sau bắt đầu")
        return self


class PromoSlide(PromoSlideInput):
    image_url: str | None = None
    image_width: int | None = None
    image_height: int | None = None


class PlanCategory(Command):
    name: str = Field(min_length=1, max_length=40)
    short_name: str = Field(min_length=1, max_length=12)
    plan_ids: list[UUID] = Field(default_factory=list, max_length=100)
    services: list[Literal["internet", "business", "combo", "play", "camera"]] = Field(
        default_factory=list, max_length=5
    )
    all_plans: bool = False


def default_categories():
    return [
        PlanCategory(name="Tất cả gói", short_name="Tất cả", all_plans=True),
        PlanCategory(name="Internet gia đình", short_name="Gia đình", services=["internet"]),
        PlanCategory(
            name="Internet doanh nghiệp", short_name="Doanh nghiệp", services=["business"]
        ),
    ]


def validate_categories(value):
    if value is not None and len({c.short_name.casefold().strip() for c in value}) != 3:
        raise ValueError("Cần đúng 3 danh mục có tên khác nhau")
    return value


class DisplaySettings(Command):
    navigation_items: list[NavigationItem] = Field(
        default_factory=default_navigation, max_length=12
    )

    @field_validator("navigation_items")
    @classmethod
    def navigation(cls, value):
        return unique_navigation(value)

    contact_phone: str = "0868247625"
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
    hero_experiment_id: UUID | None = None
    promo_slides: list[PromoSlide] = Field(default_factory=list, max_length=12)
    plan_categories: list[PlanCategory] = Field(
        default_factory=default_categories, min_length=3, max_length=3
    )

    @field_validator("plan_categories")
    @classmethod
    def categories(cls, value):
        return validate_categories(value)

    @field_validator("contact_phone")
    @classmethod
    def valid_contact(cls, value):
        return normalize_contact_phone(value)


class DisplayPatch(Command):
    navigation_items: list[NavigationItem] | None = Field(default=None, max_length=12)

    @field_validator("navigation_items")
    @classmethod
    def navigation(cls, value):
        return unique_navigation(value)

    expected_version: int = Field(ge=0)
    contact_phone: str | None = Field(default=None, max_length=32)
    fpt_anim: bool | None = None
    fpt_anim_style: Literal["wave", "bounce", "glow"] | None = None
    runline_enabled: bool | None = None
    runline_speed: Literal["slow", "normal", "fast"] | None = None
    runline_text: str | None = Field(default=None, max_length=2000)
    banner_zones: dict[str, bool] | None = None
    lenis_scroll: bool | None = None
    tilt_parallax: bool | None = None
    hero_experiment_id: UUID | None = None
    promo_slides: list[PromoSlideInput] | None = Field(default=None, max_length=12)
    plan_categories: list[PlanCategory] | None = Field(default=None, min_length=3, max_length=3)

    @field_validator("plan_categories")
    @classmethod
    def categories(cls, value):
        return validate_categories(value)

    @field_validator("contact_phone")
    @classmethod
    def valid_contact(cls, value):
        return normalize_contact_phone(value) if value is not None else None

    @field_validator("banner_zones")
    @classmethod
    def known_zones(cls, value):
        if value and not set(value) <= BANNER_ZONES:
            raise ValueError("Unknown banner zone")
        return value


def display_response(payload, version):
    data = DisplaySettings.model_validate(payload).model_dump(mode="json")
    phone = data["contact_phone"]
    data["contact_phone_display"] = (
        f"{phone[:4]}.{phone[4:7]}.{phone[7:]}" if len(phone) == 10 else phone
    )
    return {**data, "version": version}


def active_slides(settings):
    now = datetime.now(UTC)
    return [
        s
        for s in settings.get("promo_slides", [])
        if s["enabled"]
        and (not s.get("start") or datetime.fromisoformat(s["start"]) <= now)
        and (not s.get("end") or datetime.fromisoformat(s["end"]) > now)
    ]


async def get_display_settings(request) -> dict:
    defaults = DisplaySettings().model_dump()
    try:
        record = await dispatch(request, "display_settings_read", defaults=defaults)
    except DomainError:
        if request.app.state.settings.environment not in {"development", "test"}:
            raise
        return display_response(defaults, 0)
    return display_response(record["payload"], record["version"])


router = APIRouter(prefix="/api/v1/system", tags=["Display settings"])


@router.get("/display-settings")
async def read(request: Request):
    return await get_display_settings(request)


@router.post("/display-settings")
async def save(input: DisplayPatch, request: Request):
    actor = await current_actor(request)
    check(actor, "content.publish", mfa=True)
    payload = input.model_dump(mode="json", exclude={"expected_version"}, exclude_none=True)
    if "hero_experiment_id" in input.model_fields_set:
        payload["hero_experiment_id"] = (
            str(input.hero_experiment_id) if input.hero_experiment_id else None
        )
        if input.hero_experiment_id:
            await dispatch(
                request, "public_resource", kind="experiment", id=str(input.hero_experiment_id)
            )
    plan_ids = {str(p) for c in input.plan_categories or [] for p in c.plan_ids}
    plan_ids.update(str(s.plan_id) for s in input.promo_slides or [] if s.plan_id)
    for id in plan_ids:
        plan = await dispatch(request, "resource_get", actor=actor.user_id, kind="plan", id=id)
        if plan["status"] == "retired":
            raise DomainError("INVALID_PLAN", 422)
    if input.promo_slides is not None:
        slides = []
        for slide in input.promo_slides:
            data = slide.model_dump(mode="json")
            if slide.image_id:
                # Reuse the ready-only media validator; URLs are server-derived.
                image = await plan_payload(
                    PlanInput(
                        name=slide.title,
                        code="slide-image",
                        service="internet",
                        image_id=slide.image_id,
                    ),
                    request,
                    actor.user_id,
                )
                data.update(
                    {key: image[key] for key in ("image_url", "image_width", "image_height")}
                )
            slides.append(data)
        payload["promo_slides"] = slides
    record = await dispatch(
        request,
        "display_settings_save",
        actor=actor.user_id,
        expected_version=input.expected_version,
        defaults=DisplaySettings().model_dump(mode="json"),
        payload=payload,
    )
    return {
        "success": True,
        "settings": display_response(record["payload"], record["version"]),
    }
