from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuoteRequest(Command):
    plan_id: UUID
    region_id: UUID | None = None
    billing_months: int = Field(default=6, ge=1, le=36)


class PriceInput(Command):
    plan_id: UUID
    scope_id: UUID
    scope_kind: Literal["region", "group", "default"]
    billing_months: int = Field(ge=1, le=36)
    monthly_vnd: int = Field(ge=0, le=1000000000)
    setup_vnd: int = Field(default=0, ge=0, le=1000000000)
    equipment_vnd: int = Field(default=0, ge=0, le=1000000000)
    vat_included: bool = True
    vat_bps: int = Field(default=0, ge=0, le=10000)
    gift_months: int = Field(default=0, ge=0, le=36)
    start: datetime
    end: datetime | None = None
    source: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def interval(self):
        if self.start.tzinfo is None or (
            self.end and (self.end.tzinfo is None or self.end <= self.start)
        ):
            raise ValueError("Timezone-aware nonempty interval required")
        if self.scope_kind == "default" and self.scope_id.int != 0:
            raise ValueError("Default scope must use the zero UUID")
        return self


class BulkPriceInput(Command):
    rows: list[PriceInput] = Field(min_length=1, max_length=500)
    publish: bool = False

    @model_validator(mode="after")
    def unique_targets(self):
        keys = [(p.plan_id, p.scope_kind, p.scope_id, p.billing_months) for p in self.rows]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate price target in batch")
        return self
