from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field

from pagefpt.modules.pricing.schemas import Command


class PrivacyInput(Command):
    lead_id: UUID
    action: Literal["delete", "stop_marketing"]
    reason: str = Field(min_length=1, max_length=500)


class ExportInput(Command):
    format: Literal["csv"] = "csv"
    branch_id: UUID | None = None


class CostInput(Command):
    campaign_id: UUID
    day: date
    cost_vnd: int = Field(ge=0, le=100000000000)
