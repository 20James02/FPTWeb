from datetime import time
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from pagefpt.modules.pricing.schemas import Command

Permission = Literal[
    "*",
    "identity.manage",
    "catalog.write",
    "pricing.write",
    "pricing.publish",
    "content.write",
    "content.publish",
    "lead.read",
    "lead.write",
    "lead.all",
    "lead.assign",
    "lead.pii",
    "intelligence.write",
    "marketing.write",
    "measurement.read",
    "measurement.configure",
    "measurement.publish",
    "measurement.credentials",
    "measurement.replay",
    "measurement.external_write",
    "care.write",
    "care.approve",
    "report.read",
    "governance.write",
    "governance.delete",
    "governance.export",
    "governance.audit",
    "workflow.manage",
]


class Shift(Command):
    weekdays: list[int] = Field(default=[0, 1, 2, 3, 4, 5], max_length=7)
    start: time = time(8)
    end: time = time(18)

    @model_validator(mode="after")
    def validate_shift(self):
        if (
            self.start >= self.end
            or any(day not in range(7) for day in self.weekdays)
            or len(set(self.weekdays)) != len(self.weekdays)
        ):
            raise ValueError("Invalid working calendar")
        return self


class MembershipInput(Command):
    expected_version: int | None = Field(default=None, ge=1)
    display_name: str = Field(default="", max_length=100)
    user_id: UUID
    branch_id: UUID
    permissions: list[Permission] = Field(max_length=30)
    capacity: int = Field(default=20, ge=1, le=1000)
    active: bool = True
    shift: Shift = Field(default_factory=Shift)
