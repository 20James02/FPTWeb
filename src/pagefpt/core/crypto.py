import base64
import hashlib
import hmac
import json
import os
import unicodedata
from datetime import datetime

import phonenumbers
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from pagefpt.core.errors import DomainError


def normalize_phone(value: str) -> str:
    if len(value) > 40 or any(unicodedata.category(c).startswith("C") for c in value):
        raise DomainError("INVALID_PHONE", 422)
    try:
        phone = phonenumbers.parse(value, "VN")
        if phone.country_code != 84 or not phonenumbers.is_valid_number(phone):
            raise ValueError("Invalid VN number")
        return phonenumbers.format_number(phone, phonenumbers.PhoneNumberFormat.E164)
    except (ValueError, phonenumbers.NumberParseException) as exc:
        raise DomainError("INVALID_PHONE", 422) from exc


class Crypto:
    def __init__(
        self,
        encryption: str,
        matching: str,
        token: str,
        key_version="v1",
        previous_keys: dict[str, str] | None = None,
    ):
        if min(map(len, (encryption, matching, token))) < 32:
            raise DomainError("KEYS_UNCONFIGURED", 503)
        if not key_version.isalnum() or len(key_version) > 12:
            raise ValueError("Invalid key version")
        self.key_version = key_version
        self.keys = {
            version: AESGCM(hashlib.sha256(secret.encode()).digest())
            for version, secret in (previous_keys or {}).items()
            if len(secret) >= 32
        }
        self.aead = AESGCM(hashlib.sha256(encryption.encode()).digest())
        self.keys[key_version] = self.aead
        self.matching, self.token = matching.encode(), token.encode()

    def encrypt(self, value: str) -> str:
        nonce = os.urandom(12)
        return (
            self.key_version
            + "."
            + base64.urlsafe_b64encode(
                nonce
                + self.aead.encrypt(nonce, value.encode(), ("pagefpt:" + self.key_version).encode())
            ).decode()
        )

    def decrypt(self, value: str) -> str:
        try:
            version, data = value.split(".", 1)
            if version not in self.keys:
                raise ValueError("Unsupported key")
            raw = base64.urlsafe_b64decode(data)
            return (
                self.keys[version]
                .decrypt(raw[:12], raw[12:], ("pagefpt:" + version).encode())
                .decode()
            )
        except Exception as exc:
            raise DomainError("DECRYPTION_FAILED", 503) from exc

    def match(self, value: str, namespace="phone") -> str:
        return hmac.new(
            self.matching, (namespace + ":" + value).encode(), hashlib.sha256
        ).hexdigest()

    def sign(self, claims: dict) -> str:
        data = (
            base64.urlsafe_b64encode(
                json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
            )
            .decode()
            .rstrip("=")
        )
        signature = hmac.new(self.token, data.encode(), hashlib.sha256).hexdigest()
        return data + "." + signature

    def verify(self, token: str, purpose: str, now: datetime) -> dict:
        try:
            if len(token) > 8192:
                raise ValueError("Too large")
            data, signature = token.rsplit(".", 1)
            if not hmac.compare_digest(
                hmac.new(self.token, data.encode(), hashlib.sha256).hexdigest(), signature
            ):
                raise ValueError("Signature")
            claims = json.loads(base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)))
            if claims.get("purpose") != purpose or float(claims["exp"]) <= now.timestamp():
                raise ValueError("Expired or wrong purpose")
            return claims
        except (ValueError, KeyError, TypeError) as exc:
            raise DomainError("INVALID_TOKEN", 403) from exc
