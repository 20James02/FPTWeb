"""Provider-independent contracts. Acceptance is distinct from final processing."""

import json
from dataclasses import dataclass
from enum import StrEnum

import httpx


class DeliveryState(StrEnum):
    DISABLED = "disabled"
    ACCEPTED = "accepted"
    UNKNOWN = "unknown"
    RETRY = "retry"
    FAILED = "failed"


@dataclass(frozen=True)
class DeliveryResult:
    state: DeliveryState
    code: str
    provider_id: str | None = None
    retry_after: int = 0


class JsonAdapter:
    def __init__(self, endpoint: str, headers: dict, enabled=False, client=None):
        self.endpoint, self.headers, self.enabled = endpoint, headers, enabled
        self.client = client

    async def deliver(self, event: dict) -> DeliveryResult:
        if not self.enabled:
            return DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
        owned = self.client is None
        client = self.client or httpx.AsyncClient(
            timeout=httpx.Timeout(3, connect=1), follow_redirects=False
        )
        try:
            try:
                response = await client.post(
                    self.endpoint,
                    headers={**self.headers, "Content-Type": "application/json"},
                    content=json.dumps(event, sort_keys=True, separators=(",", ":")),
                )
            except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.ReadError, httpx.WriteError):
                return DeliveryResult(DeliveryState.UNKNOWN, "RESPONSE_UNKNOWN")
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
                return DeliveryResult(DeliveryState.RETRY, "CONNECTION_FAILED")
            if response.status_code in {429, 500, 502, 503, 504}:
                return DeliveryResult(DeliveryState.RETRY, "PROVIDER_RETRY")
            if not response.is_success:
                return DeliveryResult(DeliveryState.FAILED, "PROVIDER_REJECTED")
            try:
                value = response.json()
            except ValueError:
                return DeliveryResult(DeliveryState.UNKNOWN, "INVALID_RESPONSE")
            if value.get("error") or value.get("code", 0) not in (0, "0", None):
                return DeliveryResult(DeliveryState.FAILED, "PROVIDER_REJECTED")
            provider_id = value.get("requestId") or value.get("request_id")
            return DeliveryResult(
                DeliveryState.ACCEPTED, "ACCEPTED", str(provider_id)[:200] if provider_id else None
            )
        finally:
            if owned:
                await client.aclose()
