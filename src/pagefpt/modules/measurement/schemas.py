from datetime import date, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import Field, SecretStr, field_validator, model_validator

from pagefpt.modules.pricing.schemas import Command

Provider = Literal["ga4", "google_ads", "meta"]


class ConnectionSettings(Command):
    measurement_id: str = Field(default="", pattern=r"^(G-[A-Z0-9]{3,30})?$")
    property_id: str = Field(default="", pattern=r"^[0-9]{0,30}$")
    stream_id: str = Field(default="", pattern=r"^[0-9]{0,30}$")
    tag_id: str = Field(default="", pattern=r"^(AW-[0-9]{3,30})?$")
    customer_id: str = Field(default="", pattern=r"^[0-9]{0,30}$")
    login_customer_id: str = Field(default="", pattern=r"^[0-9]{0,30}$")
    pixel_id: str = Field(default="", pattern=r"^[0-9]{0,30}$")
    ad_account_id: str = Field(default="", pattern=r"^[0-9]{0,30}$")
    api_version: str = Field(default="", pattern=r"^(v[0-9]{1,2}\.0)?$")
    ads_api_version: str = Field(default="", pattern=r"^(v[0-9]{1,2})?$")
    currency: Literal["VND", "USD"] = "VND"
    browser_enabled: bool = False
    server_enabled: bool = False
    sync_interval_minutes: int = Field(default=0, ge=0, le=1440)
    sync_lookback_days: int = Field(default=3, ge=1, le=31)
    test_event_code: str = Field(default="", max_length=50, pattern=r"^[a-zA-Z0-9_-]*$")

    @field_validator("sync_interval_minutes")
    @classmethod
    def sync_interval(cls, value):
        if value and value < 15:
            raise ValueError("Chu kỳ đồng bộ tối thiểu 15 phút, 0 để tắt")
        return value


class ConnectionInput(Command):
    name: str = Field(min_length=1, max_length=100)
    provider: Provider
    environment: Literal["test", "staging", "production"]
    enabled: bool = False
    settings: ConnectionSettings

    @field_validator("name")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Nhập tên kết nối")
        return value.strip()

    @model_validator(mode="after")
    def identifiers(self):
        required = {"ga4": "measurement_id", "google_ads": "tag_id", "meta": "pixel_id"}
        if not getattr(self.settings, required[self.provider]):
            raise ValueError("Thiếu mã đo lường của nền tảng")
        return self


EVENTS = [
    "page_view",
    "view_plan",
    "select_plan",
    "form_open",
    "form_start",
    "click_call",
    "click_zalo",
    "click_messenger",
    "select_billing_period",
    "select_accessory",
    "select_region",
    "compare_plans",
    "view_cost",
    "return_visit",
    "view_landing",
    "experiment_exposure",
    "generate_lead",
]
BEHAVIOR_EVENTS = [e for e in EVENTS if e != "generate_lead"]
MeasurementEvent = Literal[
    "lead",
    "qualified",
    "closed",
    "installed",
    "page_view",
    "view_plan",
    "select_plan",
    "form_open",
    "form_start",
    "click_call",
    "click_zalo",
    "click_messenger",
    "select_billing_period",
    "select_accessory",
    "select_region",
    "compare_plans",
    "view_cost",
    "return_visit",
    "view_landing",
    "experiment_exposure",
]


class MeasurementPolicy(Command):
    ga4_connection_id: UUID | None = None
    ga4_enabled: bool | None = None
    consent_mode: Literal["basic", "advanced"] | None = None
    consent_title: str | None = Field(default=None, min_length=1, max_length=80)
    consent_description: str | None = Field(default=None, min_length=1, max_length=400)
    event_enabled: list[str] | None = Field(default=None, max_length=30)
    attribution_window_days: int | None = Field(default=None, ge=1, le=90)
    minimum_samples: int | None = Field(default=None, ge=30, le=10000)
    maturity_days: int | None = Field(default=None, ge=1, le=90)
    refresh_seconds: int | None = Field(default=None, ge=30, le=300)
    retention_days: int | None = Field(default=None, ge=1, le=90)

    @field_validator("event_enabled")
    @classmethod
    def supported_events(cls, value):
        if value is not None and (set(value) - set(EVENTS) or len(set(value)) != len(value)):
            raise ValueError("Chọn sự kiện có sẵn trong hệ thống")
        return value


class ConversionRule(Command):
    id: UUID = Field(default_factory=uuid4)
    event: MeasurementEvent
    connection_id: UUID
    provider_event: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z][A-Za-z0-9_]*$")
    conversion_label: str = Field(default="", max_length=100, pattern=r"^[a-zA-Z0-9_-]*$")
    conversion_action: str = Field(
        default="", max_length=100, pattern=r"^(customers/[0-9]+/conversionActions/[0-9]+)?$"
    )
    primary: bool = False
    route: Literal["browser", "server", "ga4_import"] = "browser"
    value_vnd: int = Field(default=0, ge=0, le=1000000000)


class ConfigInput(Command):
    name: str = Field(min_length=1, max_length=100)
    scope: Literal["global", "domain", "landing", "campaign"] = "global"
    scope_key: str = Field(default="*", max_length=150)
    environment: Literal["test", "staging", "production"]
    policy: MeasurementPolicy = Field(default_factory=MeasurementPolicy)
    rules: list[ConversionRule] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def supported_scope(self):
        import re

        if not self.name.strip():
            raise ValueError("Nhập tên cấu hình")
        if self.scope != "global" and any(
            getattr(self.policy, k) is not None
            for k in ("minimum_samples", "maturity_days", "retention_days")
        ):
            raise ValueError("Ngưỡng báo cáo và lưu trữ chỉ thiết lập ở phạm vi toàn website")
        patterns = {
            "global": r"\*",
            "domain": r"[a-z0-9.-]+",
            "landing": r"/(?:[a-z0-9-]+(?:/[a-z0-9-]+)*)?",
            "campaign": r"[a-zA-Z0-9_-]{1,100}",
        }
        if not re.fullmatch(patterns[self.scope], self.scope_key):
            raise ValueError("Phạm vi không hợp lệ")
        identities = [(r.event, str(r.connection_id)) for r in self.rules or []]
        if len(set(identities)) != len(identities):
            raise ValueError("Mỗi kết nối chỉ nhận một mục tiêu cho cùng kết quả")
        if any(
            r.event == "lead" and r.provider_event.lower() == "purchase" for r in self.rules or []
        ):
            raise ValueError("Form tư vấn không phải giao dịch mua hàng")
        for r in self.rules or []:
            if r.event in BEHAVIOR_EVENTS and (
                r.route != "browser"
                or r.primary
                or r.value_vnd
                or r.provider_event.lower()
                in {
                    "purchase",
                    "generate_lead",
                    "lead",
                    "crm_closed",
                    "crm_qualified",
                    "crm_installed",
                }
            ):
                raise ValueError(
                    "Sự kiện hành vi chỉ đo trên trình duyệt, không phải doanh thu hoặc chuyển đổi chính"
                )
        return self


class ConfigUpdate(ConfigInput):
    expected_version: int = Field(ge=1)


class SimulationInput(Command):
    expected_version: int = Field(ge=1)
    path: str = Field(default="/", max_length=150, pattern=r"^/[a-z0-9/-]*$")
    event: MeasurementEvent = "lead"
    analytics: bool = False
    marketing: bool = False
    advertising: bool = False


class ConnectionUpdate(ConnectionInput):
    expected_version: int = Field(ge=1)


class VersionInput(Command):
    expected_version: int = Field(ge=1)


class CredentialsInput(VersionInput):
    values: dict[str, SecretStr] = Field(min_length=1, max_length=6)
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def credential_fields(self):
        allowed = {
            "access_token",
            "refresh_token",
            "client_id",
            "client_secret",
            "developer_token",
            "api_secret",
        }
        if set(self.values) - allowed:
            raise ValueError("Loại khóa không được hỗ trợ")
        if any(not 4 <= len(v.get_secret_value()) <= 4096 for v in self.values.values()):
            raise ValueError("Khóa không hợp lệ")
        if self.expires_at and self.expires_at.tzinfo is None:
            raise ValueError("Thời hạn cần múi giờ")
        return self


class CostRow(Command):
    day: date
    campaign_id: str = Field(min_length=1, max_length=40, pattern=r"^[0-9]+$")
    adgroup_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    ad_id: str = Field(default="", max_length=40, pattern=r"^[0-9]*$")
    cost_vnd: int = Field(ge=0, le=100000000000)
    clicks: int | None = Field(default=None, ge=0, le=1000000000)
    impressions: int | None = Field(default=None, ge=0, le=1000000000)


class CostImport(Command):
    connection_id: UUID
    rows: list[CostRow] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique_grain(self):
        keys = [(r.day, r.campaign_id, r.adgroup_id, r.ad_id) for r in self.rows]
        if len(set(keys)) != len(keys):
            raise ValueError("Một kỳ và nhóm quảng cáo chỉ có một dòng chi phí")
        grains: dict[tuple[date, str], str] = {}
        for row in self.rows:
            key = (row.day, row.campaign_id)
            grain = "ad" if row.ad_id else "group" if row.adgroup_id else "campaign"
            if key in grains and grains[key] != grain:
                raise ValueError("Không cộng cả tổng chiến dịch và các quảng cáo con")
            grains[key] = grain
        return self


class CostApply(CostImport):
    preview_token: str = Field(max_length=8192)


class TrafficRow(Command):
    day: date
    source: str = Field(max_length=150)
    campaign: str = Field(max_length=150)
    sessions: int = Field(ge=0, le=1000000000)
    engaged_sessions: int = Field(ge=0, le=1000000000)
    average_session_seconds: float = Field(ge=0, le=604800, allow_inf_nan=False)


class BulkItem(VersionInput):
    id: UUID


class BulkInput(Command):
    action: Literal["disable", "publish"]
    items: list[BulkItem] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({r.id for r in self.items}) != len(self.items):
            raise ValueError("Mỗi mục chỉ được chọn một lần")
        return self
