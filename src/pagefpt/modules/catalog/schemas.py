from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from pagefpt.modules.pricing.schemas import Command


class VersionCommand(Command):
    expected_version: int = Field(ge=1)


class PlanInput(Command):
    name: str = Field(min_length=1, max_length=200)
    service: Literal["internet", "combo", "camera", "business", "play"]
    code: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")
    description: str = Field(default="", max_length=4000)
    speed_mbps: int | None = Field(default=None, ge=1, le=100000)
    equipment: list[str] = Field(default_factory=list, max_length=20)
    applicable_region_ids: list[UUID] = Field(default_factory=list, max_length=500)


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
