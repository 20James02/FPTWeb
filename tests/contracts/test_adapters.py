import httpx
import pytest
import respx

from pagefpt.modules.integrations.ads import google_adapter, meta_adapter, tiktok_adapter
from pagefpt.modules.integrations.base import DeliveryState


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "factory",
    [
        lambda: google_adapter("secret"),
        lambda: meta_adapter("123", "v99.0", "secret"),
        lambda: tiktok_adapter("secret"),
    ],
)
async def test_preview_never_sends(factory):
    with respx.mock(assert_all_called=False) as mock:
        result = await factory().deliver({"event_id": "synthetic"})
        assert result.state == DeliveryState.DISABLED
        assert len(mock.calls) == 0


@pytest.mark.asyncio
async def test_retry_and_ambiguous_timeout_are_distinct():
    with respx.mock() as mock:
        endpoint = mock.post("https://datamanager.googleapis.com/v1/events:ingest")
        endpoint.respond(429, json={})
        adapter = google_adapter("synthetic", True)
        assert (await adapter.deliver({})).state == DeliveryState.RETRY
        endpoint.side_effect = httpx.ReadTimeout("response lost")
        assert (await adapter.deliver({})).state == DeliveryState.UNKNOWN
        endpoint.respond(200, json={"requestId": "accepted-id"})
        assert (await adapter.deliver({})).state == DeliveryState.ACCEPTED
