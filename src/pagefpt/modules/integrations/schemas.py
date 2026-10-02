from typing import Literal

from pydantic import Field

from pagefpt.modules.pricing.schemas import Command


class IntegrationInput(Command):
    name: str = Field(min_length=1, max_length=100)
    platform: Literal["google", "meta", "tiktok", "notification"]
    enabled: bool = False
    description: str = Field(default="", max_length=500)
