from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from pagefpt.modules.pricing.schemas import Command


class LeadRequest(Command):
    measurement_path: str = Field(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")
    link_source_token: str | None = Field(default=None, max_length=8192)
    link_visit_token: str | None = Field(default=None, max_length=8192)
    voucher_code: str | None = Field(
        default=None, max_length=40, pattern=r"^(?:[A-Z0-9_-]{3,40})?$"
    )
    voucher_link: str | None = Field(default=None, max_length=50, pattern=r"^[a-z0-9-]+$")
    phone: str = Field(min_length=5, max_length=40)
    name: str = Field(default="", max_length=150)
    service_ids: list[Literal["internet", "combo", "camera", "business", "play"]] = Field(
        default_factory=list, max_length=5
    )
    plan_id: UUID | None = None
    accessory_ids: list[UUID] = Field(default_factory=list, max_length=20)
    region_id: UUID | None = None
    installation_address: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=2000)
    preferred_contact_at: datetime | None = None
    quote_token: str | None = Field(default=None, max_length=8192)
    consent_version: str = Field(min_length=1, max_length=50)
    analytics_opt_in: bool = False
    marketing_opt_in: bool = False
    session_token: str | None = Field(default=None, max_length=8192)
    attribution_token: str | None = Field(default=None, max_length=8192)
    challenge_token: str | None = Field(default=None, max_length=8192)
    website: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def accessories(self):
        if self.accessory_ids and (
            not self.plan_id or len(set(self.accessory_ids)) != len(self.accessory_ids)
        ):
            raise ValueError("Chọn gói và mỗi phụ kiện một lần")
        return self

    @field_validator("preferred_contact_at")
    @classmethod
    def aware(cls, value):
        if value and value.tzinfo is None:
            raise ValueError("Timezone required")
        return value
