from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from pagefpt.modules.pricing.schemas import Command


class Rule(Command):
    key: str = Field(min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    region_id: UUID | None = None
    region_name: str = Field(default="Toàn quốc", max_length=200)
    discount_kind: Literal["fixed", "percent"] = "fixed"
    amount: int = Field(default=0, ge=0, le=1_000_000_000)
    basis: Literal["initial", "monthly", "setup", "equipment"] = "initial"
    cap_vnd: int | None = Field(default=None, ge=0, le=1_000_000_000)
    quota: int | None = Field(default=None, ge=1, le=1_000_000)
    gift_product_id: UUID | None = None

    @model_validator(mode="after")
    def benefit(self):
        if self.discount_kind == "percent" and (self.amount > 10000 or self.cap_vnd is None):
            raise ValueError("Giảm phần trăm cần mức 0–10000 BPS và trần tiền")
        return self


class PopupConfig(Command):
    eyebrow: str = Field(default="🎁 ĐẶC QUYỀN ƯU ĐÃI FPT", max_length=100)
    title: str = Field(default="Chúc mừng! Bạn nhận được ưu đãi", max_length=150)
    subtitle: str = Field(default="", max_length=200)
    hero_prefix: str = Field(default="GIẢM TRỰC TIẾP", max_length=60)
    hero_highlight: str = Field(default="", max_length=100)
    hero_sub: str = Field(default="Áp dụng trực tiếp vào phí đăng ký lắp đặt FPT", max_length=250)
    hero_image_url: str | None = Field(default=None, max_length=500)
    cta_text: str = Field(default="NHẬN QUÀ & SỬ DỤNG NGAY", max_length=80)
    reassurance_text: str = Field(default="🔒 Nhân viên liên hệ xác nhận, chưa cần thanh toán ngay.", max_length=200)
    dismiss_text: str = Field(default="Để sau, tôi muốn xem các gói trước", max_length=100)
    urgency_badge: str | None = Field(default=None, max_length=120)
    theme: Literal["fpt_orange", "royal_gold", "festive_red", "modern_blue"] = "fpt_orange"
    show_eyebrow: bool = True
    show_subtitle: bool = True
    show_hero: bool = True
    show_benefits: bool = True
    show_code_box: bool = True
    show_terms: bool = True
    show_reassurance: bool = True
    show_dismiss: bool = True


class PhysicalGift(Command):
    name: str = Field(default="", max_length=150)
    market_value_vnd: int = Field(default=0, ge=0, le=100_000_000)
    image_url: str | None = Field(default=None, max_length=500)
    delivery_type: Literal["installation", "shipment", "store_pickup"] = "installation"
    condition_note: str = Field(default="", max_length=300)
    stock_total: int | None = Field(default=None, ge=1, le=1_000_000)


def default_terms() -> list[Literal[1, 6, 12]]:
    return [1, 6, 12]


class VoucherInput(Command):
    code: str = Field(min_length=3, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=150)
    label: str = Field(default="Ưu đãi khu vực", max_length=80)
    terms: str = Field(min_length=1, max_length=2000)
    start: datetime
    end: datetime
    plan_ids: list[UUID] = Field(default_factory=list, max_length=100)
    services: list[Literal["internet", "combo", "camera", "business", "play"]] = Field(
        default_factory=list, max_length=5
    )
    billing_months: list[Literal[1, 6, 12]] = Field(
        default_factory=default_terms, min_length=1, max_length=3
    )
    rules: list[Rule] = Field(min_length=1, max_length=200)
    exclusions: list[UUID] = Field(default_factory=list, max_length=200)
    quota: int = Field(ge=1, le=1_000_000)
    per_contact_limit: int = Field(default=1, ge=1, le=100)
    budget_vnd: int = Field(ge=1, le=1_000_000_000_000)
    hold_hours: int = Field(default=48, ge=1, le=720)
    redeem_at: Literal["closed", "installed"] = "installed"
    stackable: bool = False
    program_type: Literal["cash_discount", "percent_discount", "physical_gift", "combo_gift_cash"] = "cash_discount"
    popup_config: PopupConfig = Field(default_factory=PopupConfig)
    physical_gift: PhysicalGift | None = None

    @model_validator(mode="after")
    def validate_campaign(self):
        if self.start.tzinfo is None or self.end.tzinfo is None or self.end <= self.start:
            raise ValueError("Khoảng thời gian cần múi giờ và ngày kết thúc sau bắt đầu")
        has_voucher_gift = bool(self.physical_gift and self.physical_gift.name.strip())
        for r in self.rules:
            if (r.amount == 0 or r.cap_vnd == 0) and not r.gift_product_id and not has_voucher_gift:
                raise ValueError("Cần mức giảm hoặc quà tặng")
        for values in (
            self.plan_ids,
            self.services,
            self.billing_months,
            self.exclusions,
            [r.key for r in self.rules],
            [r.region_id for r in self.rules],
        ):
            if len(values) != len(set(values)):
                raise ValueError("Các lựa chọn/quy tắc không được trùng")
        return self


class VoucherUpdate(VoucherInput):
    expected_version: int = Field(ge=1)


class LinkInput(Command):
    preview_image_url: str | None = Field(default=None, max_length=1500)

    @field_validator("preview_image_url")
    @classmethod
    def public_image(cls, value):
        from urllib.parse import unquote, urlsplit

        if not value:
            return value
        if any(ord(c) <= 32 or c in '\\"<>' for c in value):
            raise ValueError("Ảnh cần URL công khai hợp lệ")
        parsed = urlsplit(value)
        local = value.startswith("/static/") and not parsed.netloc
        remote = (
            parsed.scheme == "https"
            and parsed.hostname
            and not parsed.username
            and not parsed.password
        )
        if not (local or remote) or parsed.fragment or ".." in unquote(parsed.path).split("/"):
            raise ValueError("Ảnh cần URL HTTPS công khai hoặc đường dẫn /static/")
        return value

    title: str = Field(default="", max_length=160)
    content_note: str = Field(default="", max_length=2000)
    slug: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9-]+$")
    target: str = Field(default="/", max_length=110)
    channel: str = Field(default="direct", min_length=1, max_length=40, pattern=r"^[a-zA-Z0-9_-]+$")
    employee_id: UUID | None = None
    active: bool = True

    @model_validator(mode="after")
    def local_target(self):
        import re

        if self.target not in ("/", "/khuyen-mai", "/do-toc-do") and not re.fullmatch(
            r"/[a-z0-9-]{1,100}", self.target
        ):
            raise ValueError("Đích chỉ được là trang chủ, ưu đãi, đo tốc độ hoặc /ten-landing")
        if self.target.strip("/") in {
            "admin",
            "api",
            "static",
            "health",
            "internal",
            "s",
            "docs",
            "receipt",
        }:
            raise ValueError("Đích thuộc khu vực hệ thống")
        return self


class ReserveInput(Command):
    expected_version: int = Field(ge=1)
    code: str = Field(min_length=3, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    billing_months: Literal[1, 6, 12] = 6


class ContextInput(Command):
    code: str = Field(min_length=3, max_length=40, pattern=r"^[A-Z0-9_-]+$")


class ActionInput(Command):
    reason: str = Field(min_length=3, max_length=500)
    expected_version: int = Field(ge=1)


class InventoryInput(Command):
    product_id: UUID
    stock: int = Field(ge=0, le=1_000_000)
    cost_vnd: int = Field(ge=0, le=1_000_000_000)
    expected_version: int = Field(default=0, ge=0)
