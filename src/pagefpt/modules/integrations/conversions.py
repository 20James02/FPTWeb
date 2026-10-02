import hashlib
import hmac
import json

from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState, JsonAdapter


class ConversionGateway:
    """Normalized conversion bridge to configured vendor-specific connectors.
    Provider deduplication MUST use our stable event_id; an HTTP 2xx is accepted.
    """

    def __init__(self, settings, client=None):
        self.settings, self.client = settings, client

    async def deliver(self, event):
        if not self.settings.integrations_enabled or not self.settings.conversion_url:
            return DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
        body = json.dumps(event, sort_keys=True, separators=(",", ":")).encode()
        signature = hmac.new(
            self.settings.conversion_secret.get_secret_value().encode(), body, hashlib.sha256
        ).hexdigest()
        return await JsonAdapter(
            self.settings.conversion_url,
            {"X-Signature": signature, "Idempotency-Key": event["event_id"]},
            True,
            self.client,
        ).deliver(event)
