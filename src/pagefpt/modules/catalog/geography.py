"""Bounded, server-only administrative source; no customer information is sent."""

import asyncio
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic
from uuid import NAMESPACE_URL, uuid5

import httpx

SOURCE_URL = "https://provinces.open-api.vn/api/v2/?depth=2"
PROVIDER = "province_open_api_v2"
MAX_BYTES = 2_000_000


def location_id(level: str, code: int) -> str:
    return str(uuid5(NAMESPACE_URL, f"{PROVIDER}:{level}:{code}"))


def validate_snapshot(data):
    if not isinstance(data, list) or not 1 <= len(data) <= 100:
        raise ValueError("Invalid province list")
    seen_provinces, seen_wards = set(), set()

    def code(value):
        if type(value) is not int or not 1 <= value <= 999999:
            raise ValueError("Invalid administrative code")
        return value

    def name(value):
        if not isinstance(value, str) or not value.strip() or len(value) > 200:
            raise ValueError("Invalid location name")
        return value.strip()

    result = []
    for province in data:
        p = code(province["code"])
        if p in seen_provinces:
            raise ValueError("Duplicate province")
        seen_provinces.add(p)
        wards = province["wards"]
        if not isinstance(wards, list) or not 1 <= len(wards) <= 1000:
            raise ValueError("Missing wards: depth=2 required")
        normalized = []
        for ward in wards:
            w = code(ward["code"])
            if w in seen_wards or code(ward.get("province_code", p)) != p:
                raise ValueError("Duplicate ward or invalid parent")
            seen_wards.add(w)
            normalized.append({"code": w, "name": name(ward["name"]), "province_code": p})
        result.append({"code": p, "name": name(province["name"]), "wards": normalized})
    if len(seen_wards) > 10000:
        raise ValueError("Too many wards")
    return result


def prepare_snapshot(raw, mode, warning=None):
    data = validate_snapshot(raw["data"])
    digest = hashlib.sha256(
        json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    return {
        "provider": PROVIDER,
        "source_url": SOURCE_URL,
        "fetched_at": raw["fetched_at"],
        "checksum": digest,
        "mode": mode,
        "warning": warning,
        "data": data,
    }


class GeographySource:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self.bundled = prepare_snapshot(
            json.loads(
                Path(__file__).with_name("data").joinpath("vn_geography_v2.json").read_text()
            ),
            "bundled",
        )
        self.lock = asyncio.Lock()
        self.cached = None
        self.expires = 0.0

    async def load(self, mode="live"):
        if mode == "bundled":
            return self.bundled
        async with self.lock:
            if self.cached and monotonic() < self.expires:
                return self.cached
            try:
                async with asyncio.timeout(10):
                    async with self.http.stream(
                        "GET", SOURCE_URL, timeout=httpx.Timeout(8, connect=2)
                    ) as response:
                        response.raise_for_status()
                        chunks = bytearray()
                        async for chunk in response.aiter_bytes():
                            if len(chunks) + len(chunk) > MAX_BYTES:
                                raise ValueError("Oversized geography response")
                            chunks.extend(chunk)
                raw = {"data": json.loads(chunks), "fetched_at": datetime.now(UTC).isoformat()}
                value = prepare_snapshot(raw, "live")
            except (httpx.HTTPError, TimeoutError, ValueError, KeyError, TypeError):
                previous = (
                    self.cached
                    if self.cached and self.cached["mode"] in {"live", "cached"}
                    else self.bundled
                )
                value = {
                    **previous,
                    "mode": "cached" if previous["mode"] in {"live", "cached"} else "bundled",
                    "warning": "API chưa khả dụng hoặc dữ liệu không hợp lệ; dùng bản đã lưu có ngày tải bên dưới.",
                }
            self.cached, self.expires = (
                value,
                monotonic() + (300 if value["mode"] == "live" else 30),
            )
            return value


def import_rows(snapshot, branch_id, province_codes):
    selected = set(province_codes)
    found = {p["code"] for p in snapshot["data"]}
    if selected - found:
        raise ValueError("Unknown province code")
    rows = []
    for province in snapshot["data"]:
        if selected and province["code"] not in selected:
            continue
        parent = location_id("province", province["code"])
        for level, item in [("province", province), *[("ward", w) for w in province["wards"]]]:
            rows.append(
                {
                    "id": location_id(level, item["code"]),
                    "external_code": item["code"],
                    "payload": {
                        "name": item["name"],
                        "code": f"vn2025-{level}-{item['code']}",
                        "branch_id": branch_id,
                        "level": level,
                        "parent_id": parent if level == "ward" else None,
                        "zone_id": "khac",
                        "aliases": [],
                        "price_group_id": None,
                    },
                }
            )
    return rows
