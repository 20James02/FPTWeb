from typing import Literal
from uuid import UUID

from pydantic import Field

from pagefpt.modules.pricing.schemas import Command


class AbuseRuleCreate(Command):
    target_type: Literal["ip", "session", "phone", "subnet"]
    target_value: str = Field(min_length=1, max_length=100)
    action: Literal["block", "challenge", "shadow_ban"] = "challenge"
    reason: str = Field(default="Admin block", max_length=255)
    duration_hours: int = Field(default=24, ge=0, le=8760)


class LeadBlockCommand(Command):
    block_target: Literal["ip", "session", "phone"] = "ip"
    action: Literal["block", "challenge", "shadow_ban"] = "challenge"
    reason: str = Field(default="Spam lead", max_length=255)
    duration_hours: int = Field(default=24, ge=0, le=8760)
