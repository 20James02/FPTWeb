"""Functional pricing hints, not verified addresses or visit analytics."""

import ipaddress
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import unquote

from pydantic import BaseModel

from pagefpt.api.client_address import trusted_client_ip


class LocationHint(BaseModel):
    status: Literal["unknown", "estimated"] = "unknown"
    source: Literal["vercel", "geoip"] | None = None
    country: str | None = None
    province_name: str | None = None
    subdivision_code: str | None = None
    city: str | None = None
    accuracy_radius_km: int | None = None
    ward_id: None = None
    address_confirmed: Literal[False] = False


@lru_cache(maxsize=1)
def iso_names():
    return json.loads(
        Path(__file__).with_name("data").joinpath("vn_iso_subdivisions.json").read_text()
    )["names"]


def text(value):
    if not isinstance(value, str) or len(value) > 600:
        return None
    value = unquote(value).strip()
    if not value or len(value) > 200 or any(ord(c) < 32 or ord(c) == 127 for c in value):
        return None
    return value


def location_hint(request):
    result: dict[str, object] = {
        "status": "unknown",
        "source": None,
        "country": None,
        "province_name": None,
        "subdivision_code": None,
        "city": None,
        "accuracy_radius_km": None,
        "ward_id": None,
        "address_confirmed": False,
    }
    ip = trusted_client_ip(request)
    if not ip or not ipaddress.ip_address(ip).is_global:
        return result
    country = text(request.headers.get("x-vercel-ip-country"))
    if country and re.fullmatch(r"[A-Z]{2}", country):
        code = text(request.headers.get("x-vercel-ip-country-region"))
        code = code if code and re.fullmatch(r"[A-Z0-9]{1,3}", code) else None
        result.update(
            status="estimated",
            source="vercel",
            country=country,
            subdivision_code=f"{country}-{code}" if code else None,
            province_name=iso_names().get(code) if country == "VN" else None,
            city=text(request.headers.get("x-vercel-ip-city")),
        )
        return result
    geo = request.app.state.geoip.lookup(ip)
    if geo.get("status") != "inferred":
        return result
    country = text(geo.get("country"))
    if not country or not re.fullmatch(r"[A-Z]{2}", country):
        return result
    radius = geo.get("accuracy_radius")
    result.update(
        status="estimated",
        source="geoip",
        country=country,
        province_name=text(geo.get("province")) if country == "VN" else None,
        city=text(geo.get("city")),
        accuracy_radius_km=radius if type(radius) is int and 0 < radius <= 20000 else None,
    )
    return result
