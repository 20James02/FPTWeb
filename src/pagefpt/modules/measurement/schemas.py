from datetime import datetime
from typing import Literal

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
    currency: Literal["VND", "USD"] = "VND"
    browser_enabled: bool = False
    server_enabled: bool = False
    test_event_code: str = Field(default="", max_length=50, pattern=r"^[a-zA-Z0-9_-]*$")


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
