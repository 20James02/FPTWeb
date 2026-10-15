"""Distributed refresh lease; the root encryption key remains outside the database."""

import json
from datetime import UTC, datetime, timedelta

import httpx

from pagefpt.core.errors import DomainError


async def credentials_for(db, crypt, http, id):
    row = await db.rpc("dispatch", {"command": {"op": "measurement_token_prepare", "id": str(id)}})
    values = json.loads(crypt.decrypt(row["ciphertext"])) if row.get("ciphertext") else {}
    if row["status"] == "ready":
        return values
    if row.get("provider") not in ("ga4", "google_ads") or not all(
        values.get(k) for k in ("client_id", "client_secret", "refresh_token")
    ):
        raise DomainError("CREDENTIALS_EXPIRED", 422)
    try:
        response = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": values["client_id"],
                "client_secret": values["client_secret"],
                "refresh_token": values["refresh_token"],
                "grant_type": "refresh_token",
            },
        )
        data = response.json()
        if (
            not response.is_success
            or not isinstance(data.get("access_token"), str)
            or not 1 <= int(data.get("expires_in", 0)) <= 86400
        ):
            raise ValueError("Invalid refresh")
    except (httpx.HTTPError, ValueError, TypeError, AttributeError, IndexError) as exc:
        raise DomainError("TOKEN_REFRESH_FAILED", 503) from exc
    values["access_token"] = data["access_token"]
    if isinstance(data.get("refresh_token"), str):
        values["refresh_token"] = data["refresh_token"]
    saved = await db.rpc(
        "dispatch",
        {
            "command": {
                "op": "measurement_token_finish",
                "id": str(id),
                "expected_version": row["version"],
                "lease_token": row["lease_token"],
                "ciphertext": crypt.encrypt(json.dumps(values)),
                "expires_at": (
                    datetime.now(UTC) + timedelta(seconds=int(data["expires_in"]))
                ).isoformat(),
            }
        },
    )
    if not saved["saved"]:
        raise DomainError("VERSION_CONFLICT", 503)
    return values
