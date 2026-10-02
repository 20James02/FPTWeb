import hashlib
import hmac


def assign_variant(salt: str, session_id: str | None, variants: list[dict]) -> str:
    if not session_id:
        return variants[0]["name"]
    bucket = (
        int.from_bytes(
            hmac.new(salt.encode(), session_id.encode(), hashlib.sha256).digest()[:8], "big"
        )
        % 10000
    )
    cumulative = 0
    for v in variants:
        cumulative += v["weight"]
        if bucket < cumulative:
            return v["name"]
    raise ValueError("Weights must sum to 10000")
