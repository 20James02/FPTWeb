import asyncio
import random

import httpx

from pagefpt.core.errors import DomainError


class SupabaseGateway:
    def __init__(self, url: str, secret: str):
        self.url, self.secret = url.rstrip("/"), secret
        self.client = httpx.AsyncClient(
            timeout=2, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)
        )

    async def rpc(self, name: str, payload: dict, actor_token: str | None = None) -> dict:
        if name not in {
            "health",
            "dispatch",
            "submit_lead",
            "claim_jobs",
            "complete_job",
            "fail_job",
        }:
            raise ValueError("Unsupported RPC")
        if not self.url or not self.secret:
            raise DomainError("DATABASE_UNAVAILABLE", 503)
        headers = {"apikey": self.secret, "Content-Profile": "api"}
        if actor_token or not self.secret.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {actor_token or self.secret}"
        timeout = (
            10
            if name == "dispatch" and payload.get("command", {}).get("op") == "geography_sync"
            else 2
        )
        try:
            async with asyncio.timeout(timeout):
                for attempt in range(2):
                    response = await self.client.post(
                        f"{self.url}/rest/v1/rpc/{name}",
                        json=payload,
                        headers=headers,
                        timeout=timeout,
                    )
                    # Only explicit rolled-back PostgreSQL transactions are retried.
                    # A transport timeout may occur after commit and is returned to the caller.
                    if attempt == 0 and response.status_code >= 400:
                        try:
                            code = response.json().get("code")
                        except ValueError:
                            code = None
                        if code in {"40P01", "40001"}:
                            await asyncio.sleep(random.uniform(0.01, 0.04))
                            continue
                    response.raise_for_status()
                    value = response.json()
                    if isinstance(value, dict) and value.get("error"):
                        raise DomainError(
                            value["error"],
                            value.get("status", 400),
                            fields={"retry_after": value["retry_after"]}
                            if "retry_after" in value
                            else {},
                        )
                    return value
        except (httpx.HTTPError, ValueError, TimeoutError) as exc:
            raise DomainError("DATABASE_UNAVAILABLE", 503) from exc
        raise DomainError("DATABASE_UNAVAILABLE", 503)

    async def close(self):
        await self.client.aclose()
