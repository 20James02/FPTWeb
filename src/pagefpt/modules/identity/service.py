import asyncio
import time
from dataclasses import dataclass
from uuid import UUID

import httpx
import jwt

from pagefpt.core.errors import DomainError


@dataclass(frozen=True)
class Actor:
    user_id: str
    aal: str
    memberships: list[dict]

    def permits(self, permission: str, branch_id: str | None = None) -> bool:
        if self.aal != "aal2" and any(m.get("require_mfa", False) for m in self.memberships):
            return False
        return any(
            (
                branch_id is None
                or m["branch_id"] in {branch_id, "00000000-0000-0000-0000-000000000000"}
            )
            and (permission in m["permissions"] or "*" in m["permissions"])
            for m in self.memberships
        )


class IdentityService:
    def __init__(self, gateway):
        self.db = gateway

    async def actor_for_subject(self, subject: str, aal: str) -> Actor:
        result = await self.db.rpc("dispatch", {"command": {"op": "identity", "subject": subject}})
        if not result.get("memberships"):
            raise DomainError("PERMISSION_DENIED", 403)
        return Actor(subject, aal, result["memberships"])


class TokenVerifier:
    def __init__(self, url: str, audience: str):
        self.url, self.audience = url.rstrip("/"), audience
        self.keys: dict = {}
        self.expires = 0.0
        self.lock = asyncio.Lock()
        self.last_refresh = 0.0

    async def verify(self, token: str) -> dict:
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in {"RS256", "ES256"} or not header.get("kid"):
                raise ValueError("Unsupported key")
            now = time.monotonic()
            if now > self.expires or header["kid"] not in self.keys:
                async with self.lock:
                    if now - self.last_refresh >= 5:
                        self.last_refresh = now
                        async with httpx.AsyncClient(timeout=2) as client:
                            r = await client.get(f"{self.url}/auth/v1/.well-known/jwks.json")
                            r.raise_for_status()
                            keys = r.json()["keys"]
                        self.keys = {k["kid"]: k for k in keys}
                        self.expires, self.last_refresh = now + 300, now
            key = self.keys.get(header["kid"])
            if not key or key.get("alg", header["alg"]) != header["alg"]:
                raise ValueError("Unknown key")
            claims = jwt.decode(
                token,
                jwt.PyJWK.from_dict(key).key,
                algorithms=[header["alg"]],
                audience=self.audience,
                issuer=f"{self.url}/auth/v1",
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
            UUID(claims["sub"])
            if claims.get("aal", "aal1") not in {"aal1", "aal2"}:
                raise ValueError("Invalid assurance")
            return claims
        except (ValueError, KeyError, jwt.PyJWTError, httpx.HTTPError) as exc:
            raise DomainError("UNAUTHENTICATED", 401) from exc
