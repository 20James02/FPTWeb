from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from pagefpt.modules.pricing.schemas import Command


class ConsentInput(Command):
    analytics: bool = False
    marketing: bool = False
    advertising: bool = False
    personalization: bool = False
    consent_version: str = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def separate_purposes(self):
        if self.advertising and not (self.analytics and self.marketing):
            raise ValueError("Đo chuyển đổi quảng cáo cần đồng ý phân tích và nguồn tiếp thị")
        if self.personalization and not self.advertising:
            raise ValueError("Cá nhân hóa cần lựa chọn quảng cáo")
        return self


class ConsentUpdate(ConsentInput):
    session_token: str = Field(max_length=8192)


class EventInput(Command):
    id: UUID
    name: Literal[
        "view_plan",
        "select_plan",
        "select_region",
        "compare_plans",
        "start_form",
        "view_cost",
        "click_call",
        "click_zalo",
        "return_visit",
        "experiment_exposure",
        "view_landing",
    ]
    plan_id: UUID | None = None
    region_id: UUID | None = None
    experiment_id: UUID | None = None
    variant: str | None = Field(default=None, max_length=50)
    experiment_version: int | None = Field(default=None, ge=1)
    landing_slug: str | None = Field(
        default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$"
    )


class EventBatch(Command):
    session_token: str = Field(max_length=8192)
    events: list[EventInput] = Field(max_length=20)


class CampaignInput(Command):
    name: str = Field(min_length=1, max_length=200)
    platform: Literal["google", "meta", "tiktok", "zalo", "seo", "referral"]
    utm_campaign: str = Field(max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    branch_id: UUID | None = None
    connection_id: UUID | None = None
    external_campaign_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    landing_path: str = Field(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")
    content_note: str = Field(default="", max_length=1000)


class Variant(Command):
    name: str = Field(min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    weight: int = Field(ge=0, le=10000)
    cta_label: str | None = Field(default=None, min_length=1, max_length=24)


class ExperimentInput(Command):
    name: str = Field(min_length=1, max_length=200)
    variants: list[Variant] = Field(min_length=2, max_length=5)
    salt: str = Field(min_length=32, max_length=128)

    @model_validator(mode="after")
    def total(self):
        if sum(v.weight for v in self.variants) != 10000 or len(
            set(v.name for v in self.variants)
        ) != len(self.variants):
            raise ValueError("Unique variants and total weight 10000 required")
        return self


class PromotionInput(Command):
    name: str = Field(min_length=1, max_length=200)
    discount_vnd: int = Field(ge=0, le=1000000000)
    priority: int = Field(default=0, ge=0, le=1000)
    group: str = Field(default="exclusive", max_length=60)
    start: datetime
    end: datetime
    plan_ids: list[UUID] = Field(default_factory=list, max_length=100)
    region_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def dates(self):
        if self.start.tzinfo is None or self.end.tzinfo is None or self.end <= self.start:
            raise ValueError("Aware valid interval required")
        return self
