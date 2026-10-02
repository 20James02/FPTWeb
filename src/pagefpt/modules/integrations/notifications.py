import hashlib
import hmac
import json

from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState, JsonAdapter


class NotificationAdapter:
    """Server-configured notification gateway; it must honor Idempotency-Key.

    Read/write timeout is unknown, and automatic replay is intentionally blocked.
    Gateway request contains minimum PII necessary to contact the customer.
    """

    def __init__(self, settings, client=None):
        self.settings, self.client = settings, client

    async def deliver(self, command: dict) -> DeliveryResult:
        if not self.settings.integrations_enabled or not self.settings.notification_url:
            return DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
        serialized = json.dumps(command, sort_keys=True, separators=(",", ":"))
        signature = hmac.new(
            self.settings.notification_secret.get_secret_value().encode(),
            serialized.encode(),
            hashlib.sha256,
        ).hexdigest()
        adapter = JsonAdapter(
            self.settings.notification_url,
            {"X-Signature": signature, "Idempotency-Key": command["event_id"]},
            True,
            self.client,
        )
        return await adapter.deliver(command)
