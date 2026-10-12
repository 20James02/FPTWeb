"""Admin alerts and explicitly bound private-chat six-digit recovery codes."""

import re
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx

from pagefpt.modules.integrations.base import DeliveryResult, DeliveryState


class TelegramAdapter:
    def __init__(self, settings, client):
        self.settings, self.client = settings, client

    async def deliver(self, notice):
        if not self.settings.telegram_enabled:
            return DeliveryResult(DeliveryState.DISABLED, "INTEGRATION_DISABLED")
        origin = (self.settings.telegram_admin_origin or self.settings.public_origin).rstrip("/")
        if notice["kind"] == "recovery_code":
            code, chat_id = notice.get("code", ""), notice.get("chat_id", "")
            if (
                not re.fullmatch(r"[0-9]{6}", code)
                or not re.fullmatch(r"[1-9][0-9]{0,19}", chat_id)
                or chat_id not in self.settings.telegram_recovery_accounts.values()
            ):
                return DeliveryResult(DeliveryState.FAILED, "RECOVERY_UNCONFIGURED")
            expires = datetime.fromisoformat(notice["expires_at"])
            if expires <= datetime.now(UTC):
                return DeliveryResult(DeliveryState.DISABLED, "RECOVERY_EXPIRED")
            until = expires.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).strftime("%H:%M:%S")
            payload = {
                "chat_id": chat_id,
                "text": (
                    f"Mã khôi phục mật khẩu Admin: {code}\n"
                    f"Hết hạn lúc {until} (UTC+7). Mã chỉ dùng một lần.\n"
                    "Nhập mã tại trang Admin đang mở. Không chia sẻ mã này."
                ),
                "protect_content": True,
                "link_preview_options": {"is_disabled": True},
            }
        else:
            created_at = (
                datetime.fromisoformat(notice["created_at"])
                .astimezone(ZoneInfo("Asia/Ho_Chi_Minh"))
                .strftime("%d/%m/%Y %H:%M")
            )
            if notice["kind"] == "lead_created":
                lead_id = str(UUID(notice["lead_id"]))
                text = (
                    "Có yêu cầu tư vấn mới\n"
                    f"Mã yêu cầu: {notice['receipt']}\n"
                    f"Gói quan tâm: {str(notice.get('plan') or 'Cần tư vấn')[:200]}\n"
                    f"Tiếp nhận lúc: {created_at} (UTC+7)\n"
                    "Mở Admin để xem thông tin và liên hệ khách."
                )
                url = origin + "/admin/leads/detail?id=" + lead_id
            elif notice["kind"] == "recovery_requested":
                text = (
                    "Có yêu cầu khôi phục mật khẩu Admin\n"
                    f"Thời gian: {created_at} (UTC+7)\n"
                    "Mã khôi phục chỉ gửi vào chat riêng đã liên kết. Thông báo này không xác nhận tài khoản tồn tại."
                )
                url = origin + "/admin/login"
            else:
                return DeliveryResult(DeliveryState.FAILED, "UNSUPPORTED_NOTICE")
            payload = {
                "chat_id": self.settings.telegram_chat_id,
                "text": text,
                "protect_content": True,
                "link_preview_options": {"is_disabled": True},
                "reply_markup": {"inline_keyboard": [[{"text": "Mở Admin", "url": url}]]},
            }
        endpoint = (
            "https://api.telegram.org/bot"
            + self.settings.telegram_bot_token.get_secret_value()
            + "/sendMessage"
        )
        try:
            response = await self.client.post(endpoint, json=payload)
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.ReadError, httpx.WriteError):
            # Telegram does not support an idempotency key: an ambiguous send
            # must be recorded for review instead of automatically sending twice.
            return DeliveryResult(DeliveryState.UNKNOWN, "RESPONSE_UNKNOWN")
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
            return DeliveryResult(DeliveryState.RETRY, "CONNECTION_FAILED")
        if response.status_code == 429:
            retry_after = 60
            try:
                value = response.json()
                params = value.get("parameters") if isinstance(value, dict) else None
                wait = params.get("retry_after") if isinstance(params, dict) else None
                if type(wait) is int:
                    retry_after = max(1, min(86400, wait))
            except ValueError:
                pass
            return DeliveryResult(
                DeliveryState.RETRY, "PROVIDER_RATE_LIMITED", retry_after=retry_after
            )
        if response.status_code >= 500:
            return DeliveryResult(DeliveryState.RETRY, "PROVIDER_RETRY")
        if not response.is_success:
            return DeliveryResult(DeliveryState.FAILED, "PROVIDER_REJECTED")
        try:
            value = response.json()
            if not isinstance(value, dict) or value.get("ok") is not True:
                return DeliveryResult(DeliveryState.UNKNOWN, "INVALID_RESPONSE")
            result = value.get("result")
            if not isinstance(result, dict) or not isinstance(result.get("message_id"), int):
                return DeliveryResult(DeliveryState.UNKNOWN, "INVALID_RESPONSE")
        except ValueError:
            return DeliveryResult(DeliveryState.UNKNOWN, "INVALID_RESPONSE")
        return DeliveryResult(DeliveryState.ACCEPTED, "ACCEPTED", str(result["message_id"]))
