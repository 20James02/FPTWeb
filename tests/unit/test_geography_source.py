import asyncio
import copy

import httpx
import pytest

from pagefpt.modules.catalog.geography import GeographySource, validate_snapshot


def fixture():
    return [
        {
            "code": 1,
            "name": "Thành phố Hà Nội",
            "wards": [{"code": 4, "name": "Phường Ba Đình", "province_code": 1}],
        }
    ]


def test_invalid_parent_duplicate_and_empty_rejected():
    data = fixture()
    data[0]["wards"][0]["province_code"] = 2
    with pytest.raises(ValueError):
        validate_snapshot(data)
    data = fixture()
    data[0]["wards"].append(copy.deepcopy(data[0]["wards"][0]))
    with pytest.raises(ValueError):
        validate_snapshot(data)
    with pytest.raises(ValueError):
        validate_snapshot([])


async def test_live_singleflight_and_bounded_fallback():
    count = 0

    async def handler(request):
        nonlocal count
        count += 1
        await asyncio.sleep(0.01)
        return httpx.Response(200, json=fixture())

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        source = GeographySource(http)
        a, b = await asyncio.gather(source.load(), source.load())
        assert count == 1 and a == b and a["mode"] == "live"
        assert len(a["data"]) == 1
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(502))
    ) as http:
        source = GeographySource(http)
        data = await source.load()
        assert data["mode"] == "bundled" and data["warning"]
        assert len(data["data"]) == 34
        assert sum(len(p["wards"]) for p in data["data"]) == 3321


async def test_oversize_and_nonjson_use_fallback():
    for response in [
        httpx.Response(200, content=b"x" * 2_000_001),
        httpx.Response(200, text="<html>oops"),
    ]:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r, response=response: response)
        ) as http:
            assert (await GeographySource(http).load())["mode"] == "bundled"


async def test_timeout_uses_snapshot_without_unbounded_retry():
    count = 0

    def timeout(request):
        nonlocal count
        count += 1
        raise httpx.ReadTimeout("offline")

    async with httpx.AsyncClient(transport=httpx.MockTransport(timeout)) as http:
        source = GeographySource(http)
        first, second = await asyncio.gather(source.load(), source.load())
        assert first["mode"] == second["mode"] == "bundled"
        assert first["warning"] and count == 1


async def test_failed_refresh_keeps_last_valid_api_snapshot():
    count = 0

    def handler(request):
        nonlocal count
        count += 1
        return httpx.Response(200, json=fixture()) if count == 1 else httpx.Response(502)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        source = GeographySource(http)
        live = await source.load()
        source.expires = 0
        fallback = await source.load()
        assert fallback["data"] == live["data"]
        assert fallback["fetched_at"] == live["fetched_at"]
        assert fallback["mode"] == "cached" and fallback["warning"]
