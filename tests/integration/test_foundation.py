import importlib

import httpx
import pytest


def test_application_exists():
    assert importlib.util.find_spec("pagefpt.application") is not None


@pytest.mark.asyncio
async def test_health_and_error_contract():
    from pagefpt.application import create_app
    from pagefpt.core.config import Settings

    app = create_app(Settings(environment="test", _env_file=None))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health/live")
        assert response.status_code == 200
        assert response.json() == {"status": "alive"}
        missing = await client.get("/not-present")
        assert missing.status_code == 404
        assert missing.json()["request_id"]
        assert missing.headers["cache-control"] == "no-store"


def test_production_requires_keys():
    from pagefpt.core.config import Settings

    with pytest.raises(ValueError):
        Settings(environment="production", _env_file=None)
