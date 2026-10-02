from typing import Literal
from urllib.parse import urlparse

import bleach
from pydantic import Field, field_validator, model_validator

from pagefpt.modules.pricing.schemas import Command


class Block(Command):
    type: Literal["text", "heading", "cta", "image", "pricing", "faq"]
    text: str = Field(default="", max_length=5000)
    url: str | None = Field(default=None, max_length=1000)
    media_id: str | None = Field(default=None, max_length=100)

    @field_validator("url")
    @classmethod
    def safe_url(cls, value):
        if value and not (
            (value.startswith("/") and not value.startswith("//"))
            or (urlparse(value).scheme in {"https", "http"} and urlparse(value).hostname)
        ):
            raise ValueError("Only safe links allowed")
        return value

    @field_validator("text")
    @classmethod
    def text_only(cls, value):
        return bleach.clean(value, tags=[], attributes={}, strip=True)


class PageInput(Command):
    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    blocks: list[Block] = Field(max_length=100)
    description: str = Field(default="", max_length=300)
    canonical_path: str | None = Field(default=None, max_length=200, pattern=r"^/[a-z0-9/-]*$")

    @model_validator(mode="after")
    def public_slug(self):
        if self.slug in {"admin", "api", "internal", "receipt", "health", "docs"}:
            raise ValueError("Reserved slug")
        return self
