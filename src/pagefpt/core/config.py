import re

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PAGEFPT_", env_file=".env", extra="ignore")
    environment: str = "development"
    supabase_url: str = ""
    supabase_secret: SecretStr = SecretStr("")
    supabase_auth_key: str = ""
    admin_session_hours: int = Field(default=12, ge=1, le=24)
    jwt_audience: str = "authenticated"
    encryption_key: SecretStr = SecretStr("")
    encryption_key_version: str = "v1"
    encryption_previous_keys: dict[str, SecretStr] = {}
    matching_key: SecretStr = SecretStr("")
    token_key: SecretStr = SecretStr("")
    job_secret: SecretStr = SecretStr("")
    allowed_origins: list[str] = []
    r2_endpoint: str = ""
    r2_access_key: SecretStr = SecretStr("")
    r2_secret_key: SecretStr = SecretStr("")
    r2_bucket: str = ""
    r2_public_bucket: str = ""
    media_domain: str = ""
    public_origin: str = ""
    turnstile_secret: SecretStr = SecretStr("")
    turnstile_hostnames: list[str] = []
    geoip_path: str = ""
    trusted_vercel_proxy: bool = False
    integrations_enabled: bool = False
    conversion_url: str = ""
    conversion_secret: SecretStr = SecretStr("")
    incoming_webhook_secret: SecretStr = SecretStr("")
    notification_url: str = ""
    notification_secret: SecretStr = SecretStr("")
    telegram_enabled: bool = False
    telegram_bot_token: SecretStr = SecretStr("")
    telegram_chat_id: str = ""
    telegram_admin_origin: str = ""
    telegram_recovery_accounts: dict[str, str] = {}

    @model_validator(mode="after")
    def validate_production(self):
        if self.environment not in {"development", "test", "staging", "production"}:
            raise ValueError("Unsupported environment")
        if self.environment in {"staging", "production"}:
            if (
                not self.supabase_url.startswith("https://")
                or not self.supabase_secret.get_secret_value()
            ):
                raise ValueError("Supabase configuration required")
            for key in (self.encryption_key, self.matching_key, self.token_key, self.job_secret):
                if len(key.get_secret_value()) < 32:
                    raise ValueError("Independent strong keys required")
            if (
                len(
                    {
                        k.get_secret_value()
                        for k in (
                            self.encryption_key,
                            self.matching_key,
                            self.token_key,
                            self.job_secret,
                        )
                    }
                )
                != 4
            ):
                raise ValueError("Keys must be independent")
        if self.supabase_auth_key.startswith("sb_secret_"):
            raise ValueError("Auth requires a publishable/anon key")
        if self.telegram_enabled and (
            not re.fullmatch(
                r"[0-9]{5,20}:[A-Za-z0-9_-]{30,100}", self.telegram_bot_token.get_secret_value()
            )
            or not re.fullmatch(r"-?[1-9][0-9]{0,19}", self.telegram_chat_id)
            or not (self.telegram_admin_origin or self.public_origin).startswith("https://")
        ):
            raise ValueError("Telegram requires bot token, numeric chat ID and HTTPS origin")
        normalized = {}
        for email, chat_id in self.telegram_recovery_accounts.items():
            email_key = email.strip().lower()
            if (
                not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email_key)
                or len(email_key) > 254
                or not re.fullmatch(r"[1-9][0-9]{0,19}", chat_id)
                or email_key in normalized
            ):
                raise ValueError("Recovery requires unique emails bound to private Telegram IDs")
            normalized[email_key] = chat_id
        self.telegram_recovery_accounts = normalized
        if normalized and not self.telegram_enabled:
            raise ValueError("Telegram recovery requires Telegram enabled")
        if self.notification_url and (
            not self.notification_url.startswith("https://")
            or len(self.notification_secret.get_secret_value()) < 32
        ):
            raise ValueError("HTTPS notification gateway and signing secret required")
        if self.conversion_url and (
            not self.conversion_url.startswith("https://")
            or len(self.conversion_secret.get_secret_value()) < 32
        ):
            raise ValueError("HTTPS conversion gateway and signing secret required")
        return self
