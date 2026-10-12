from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from pagefpt.modules.pricing.schemas import Command


class VersionCommand(Command):
    expected_version: int = Field(ge=1)


class CardLabels(Command):
    model_config = ConfigDict(extra="forbid", serialize_by_alias=True)
    badge: str = Field(default="Gói đang cung cấp", max_length=40)
    speed: str = Field(default="Tốc độ", min_length=1, max_length=24)
    offers: str = Field(default="Ưu đãi đi kèm", min_length=1, max_length=40)
    equipment: str = Field(default="Thiết bị", min_length=1, max_length=40)
    register_text: str = Field(alias="register", default="Đăng ký gói", min_length=1, max_length=32)
    details: str = Field(default="Chi tiết gói", min_length=1, max_length=32)


class PlanInput(Command):
    name: str = Field(min_length=1, max_length=200)
    service: Literal["internet", "combo", "camera", "business", "play"]
    code: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")
    description: str = Field(default="", max_length=4000)
    card_labels: CardLabels = Field(default_factory=CardLabels)
    speed_mbps: int | None = Field(default=None, ge=1, le=100000)
    upload_speed_mbps: int | None = Field(default=None, ge=1, le=100000)
    equipment: list[str] = Field(default_factory=list, max_length=20)
    applicable_region_ids: list[UUID] = Field(default_factory=list, max_length=500)
    image_id: UUID | None = None
    image_alt: str = Field(default="", max_length=200)


class RegionInput(Command):
    zone_id: Literal["mien_bac", "mien_trung", "mien_nam", "khac"] = "khac"
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=80)
    branch_id: UUID
    price_group_id: UUID | None = None
    aliases: list[str] = Field(default_factory=list, max_length=30)
    level: Literal["province", "ward"] = "province"
    parent_id: UUID | None = None

    @model_validator(mode="after")
    def hierarchy(self):
        if (self.level == "ward") != (self.parent_id is not None):
            raise ValueError("Ward requires a province parent; province cannot have a parent")
        return self


class ProductInput(Command):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")
    service: Literal["internet", "combo", "camera", "business", "play"]
    description: str = Field(default="", max_length=4000)
    plan_ids: list[UUID] = Field(default_factory=list, max_length=50)
    price_vnd: int | None = Field(default=None, ge=0, le=1000000000)
    original_price_vnd: int | None = Field(default=None, ge=0, le=1000000000)
    offer_label: str = Field(default="", max_length=200)
    billing_mode: Literal["one_time", "monthly"] = "one_time"
    image_id: UUID | None = None
    image_alt: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def offer_price(self):
        if self.original_price_vnd is not None and (
            self.price_vnd is None or self.original_price_vnd < self.price_vnd
        ):
            raise ValueError("Giá gốc phải lớn hơn hoặc bằng giá ưu đãi")
        return self
