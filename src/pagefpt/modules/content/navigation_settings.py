"""Navigation configuration only allows explicit safe destinations, with bounded nesting."""

import re
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator

from pagefpt.modules.pricing.schemas import Command


class NavigationLink(Command):
    label: str = Field(min_length=1, max_length=40)
    href: str = Field(min_length=1, max_length=300)

    @field_validator("href")
    @classmethod
    def safe_destination(cls, value):
        if not value.startswith("//") and re.fullmatch(r"/[A-Za-z0-9/_#?=&%.\-]*", value):
            return value
        p = urlparse(value)
        if (
            p.scheme != "https"
            or not p.hostname
            or p.username
            or p.password
            or re.search(r"[\s\\]", value)
        ):
            raise ValueError("Dùng đường dẫn nội bộ bắt đầu / hoặc URL HTTPS không chứa tài khoản")
        return value


class NavigationItem(NavigationLink):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    preset: Literal[
        "internet", "play", "camera", "smart-home", "speedtest", "promotions", "custom"
    ] = "custom"
    enabled: bool = True
    children: list[NavigationLink] = Field(default_factory=list, max_length=12)


def default_navigation():
    return [
        NavigationItem.model_validate(dict(id=k, preset=k, label=label, href=href))
        for k, label, href in [
            ("internet", "Internet FPT", "/san-pham/internet-gia-dinh"),
            ("play", "FPT Play", "/san-pham/fpt-play"),
            ("camera", "FPT Camera", "/san-pham/camera-fpt"),
            ("smart-home", "Smart Home", "/#ecosystem-section"),
            ("promotions", "Khuyến Mãi", "/khuyen-mai"),
        ]
    ]


def unique_navigation(value):
    if value is not None:
        presets = [i.preset for i in value if i.preset != "custom"]
        if len({i.id for i in value}) != len(value) or len(set(presets)) != len(presets):
            raise ValueError("Mã menu và nhóm có sẵn không được trùng")
    return value
