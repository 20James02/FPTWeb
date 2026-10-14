from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from pagefpt.modules.pricing.schemas import Command


class LinkInput(Command):
    title: str = Field(min_length=1, max_length=160)
    slug: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9-]+$")
    target: str = Field(default="/", max_length=120, pattern=r"^/(?:[a-z0-9-]+(?:/[a-z0-9-]+)?)?$")
    platform: str = Field(default="other", max_length=40, pattern=r"^[a-zA-Z0-9_-]+$")
    utm_medium: str = Field(default="social", max_length=100, pattern=r"^[a-z0-9_.-]*$")
    utm_campaign: str = Field(default="", max_length=100, pattern=r"^[a-z0-9_.-]*$")
    utm_content: str = Field(default="", max_length=100, pattern=r"^[a-z0-9_.-]*$")
    content_note: str = Field(default="", max_length=2000)
    active: bool = True

    @field_validator("title")
    @classmethod
    def title_text(cls, value):
        if not value.strip():
            raise ValueError("Nhập tên link")
        return value.strip()


class LinkUpdate(LinkInput):
    expected_version: int = Field(ge=1)


class BulkItem(Command):
    id: UUID
    expected_version: int = Field(ge=1)


class BulkInput(Command):
    action: Literal["pause", "activate"]
    items: list[BulkItem] = Field(min_length=1, max_length=50)


class VisitInput(Command):
    source_token: str = Field(min_length=1, max_length=8192)
    session_token: str = Field(min_length=1, max_length=8192)
    visit_token: str | None = Field(default=None, max_length=8192)


class EngagementInput(Command):
    visit_token: str = Field(min_length=1, max_length=8192)
    session_token: str = Field(min_length=1, max_length=8192)
    page_id: UUID
    sequence: int = Field(ge=1, le=100000)
    total_ms: int = Field(ge=0, le=28800000)


class RevokeInput(Command):
    visit_token: str = Field(min_length=1, max_length=8192)
