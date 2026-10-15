from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuoteRequest(Command):
    voucher_code: str | None = Field(
        default=None, max_length=40, pattern=r"^(?:[A-Z0-9_-]{3,40})?$"
    )
    landing_slug: str | None = Field(
        default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$"
    )
    plan_id: UUID
    region_id: UUID | None = None
    billing_months: int = Field(default=6, ge=1, le=36)
    accessory_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def unique_accessories(self):
        if len(set(self.accessory_ids)) != len(self.accessory_ids):
            raise ValueError("Phụ kiện không được trùng")
        return self


class PriceInput(Command):
    plan_id: UUID
    scope_id: UUID
    scope_kind: Literal["region", "group", "default"]
    billing_months: int = Field(ge=1, le=36)
    monthly_vnd: int = Field(ge=0, le=1000000000)
    monthly_coefficient: Decimal = Field(
        default=Decimal("1"), ge=0, le=100, decimal_places=4, allow_inf_nan=False
    )
    setup_vnd: int = Field(default=0, ge=0, le=1000000000)
    equipment_vnd: int = Field(default=0, ge=0, le=1000000000)
    display_monthly_vnd: int | None = Field(default=None, ge=0, le=1000000000)
    equipment: list[Annotated[str, Field(min_length=1, max_length=200)]] | None = Field(
        default=None, max_length=20
    )
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


class MatrixPriceRow(Command):
    price: PriceInput
    id: UUID | None = None
    expected_version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def direct_price(self):
        if (self.id is None) != (self.expected_version is None):
            raise ValueError("Existing price requires its expected version")
        if self.price.monthly_coefficient != 1:
            raise ValueError("Enter direct monthly prices; coefficient is not used")
        return self


class MatrixPriceInput(Command):
    rows: list[MatrixPriceRow] = Field(min_length=1, max_length=500)
    publish: bool = False

    @model_validator(mode="after")
    def unique_targets(self):
        prices = [r.price for r in self.rows]
        BulkPriceInput(rows=prices)
        ids = [r.id for r in self.rows if r.id is not None]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate price version in batch")
        return self
