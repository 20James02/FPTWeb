from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from pagefpt.modules.pricing.schemas import Command


class PreferencesInput(Command):
    marketing_allowed: bool = False
    service_contact_allowed: bool = True
    complaint_open: bool = False


class FollowupInput(Command):
    lead_id: UUID
    channel: Literal["call", "sms", "email", "zalo"]
    purpose: Literal["service", "marketing", "upsell"] = "service"
    scheduled_at: datetime

    @field_validator("scheduled_at")
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError("Timezone required")
        return value


class FeedbackInput(Command):
    token: str = Field(max_length=8192)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class ReferralInput(Command):
    referrer_lead_id: UUID
    referred_lead_id: UUID
    installation_reference: str = Field(min_length=1, max_length=100)
