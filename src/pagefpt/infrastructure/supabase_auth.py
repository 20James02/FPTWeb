"""Pooled Supabase Auth REST adapter. Tokens never leave the server session boundary."""

from uuid import UUID

import httpx

from pagefpt.core.errors import DomainError


class SupabaseAuth:
    def __init__(self, settings):
        self.settings = settings
        self.client = httpx.AsyncClient(
            timeout=3, limits=httpx.Limits(max_connections=10, max_keepalive_connections=5)
        )

    async def call(self, path, data=None, token=None, params=None, method="POST", admin=False):
        if not self.settings.supabase_url or not self.settings.supabase_auth_key:
            raise DomainError("AUTH_UNCONFIGURED", 503)
        key = (
            self.settings.supabase_secret.get_secret_value()
            if admin
            else self.settings.supabase_auth_key
        )
        if not key:
            raise DomainError("AUTH_UNCONFIGURED", 503)
        headers = {"apikey": key}
        if admin:
            headers["Authorization"] = "Bearer " + key
        if token:
            headers["Authorization"] = "Bearer " + token
        try:
            r = await self.client.request(
                method,
                self.settings.supabase_url.rstrip("/") + "/auth/v1/" + path,
                json=data,
                params=params,
                headers=headers,
            )
            if r.status_code == 429:
                raise DomainError("RATE_LIMITED", 429)
            if r.status_code >= 500:
                raise DomainError("AUTH_UNAVAILABLE", 503)
            if not r.is_success:
                if admin and path == "admin/users" and method == "POST":
                    rejection = r.json()
                    if isinstance(rejection, dict) and rejection.get(
                        "error_code", rejection.get("code")
                    ) in {"email_exists", "user_already_exists"}:
                        raise DomainError("ACCOUNT_EXISTS", 409)
                    raise DomainError("ACCOUNT_CREATE_REJECTED", 422)
                if path == "user" and method == "PUT":
                    rejection = r.json()
                    if not isinstance(rejection, dict):
                        raise DomainError("AUTH_UNAVAILABLE", 503)
                    if rejection.get("error_code", rejection.get("code")) in {
                        "weak_password",
                        "same_password",
                        "password_too_short",
                    }:
                        raise DomainError("PASSWORD_REJECTED", 422)
                raise DomainError("UNAUTHENTICATED", 401)
            data = r.json() if r.content else {}
            if not isinstance(data, dict):
                raise DomainError("AUTH_UNAVAILABLE", 503)
            return data
        except (httpx.HTTPError, ValueError) as exc:
            raise DomainError("AUTH_UNAVAILABLE", 503) from exc

    async def password(self, email, password, otp, factor_id=None):
        result = await self.call(
            "token", {"email": email, "password": password}, params={"grant_type": "password"}
        )
        return await self.assure_mfa(result, otp, factor_id)

    async def assure_mfa(self, result, otp, factor_id=None):
        user = result.get("user", {})
        if not isinstance(user, dict):
            raise DomainError("AUTH_UNAVAILABLE", 503)
        raw_factors = user.get("factors", [])
        if not isinstance(raw_factors, list) or any(not isinstance(f, dict) for f in raw_factors):
            raise DomainError("AUTH_UNAVAILABLE", 503)
        factors = [f for f in raw_factors if f.get("status") == "verified"]
        if factors:
            totp_factors = [f for f in factors if f.get("factor_type") == "totp"]
            try:
                choices = [
                    {
                        "id": str(UUID(f["id"])),
                        "name": str(f.get("friendly_name") or "Thiết bị MFA")[:60],
                    }
                    for f in totp_factors
                ]
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                raise DomainError("AUTH_UNAVAILABLE", 503) from exc
            if not otp or (len(totp_factors) > 1 and not factor_id):
                raise DomainError("MFA_REQUIRED", 403, fields={"factors": choices})
            totp = next(
                (f for f in totp_factors if not factor_id or f.get("id") == str(factor_id)), None
            )
            if not totp:
                raise DomainError("MFA_TOTP_REQUIRED", 403)
            try:
                fid = str(UUID(totp["id"]))
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                raise DomainError("AUTH_UNAVAILABLE", 503) from exc
            challenge = await self.call(
                f"factors/{fid}/challenge", {}, token=result["access_token"]
            )
            if not isinstance(challenge.get("id"), str) or not challenge["id"]:
                raise DomainError("AUTH_UNAVAILABLE", 503)
            result = await self.call(
                f"factors/{fid}/verify",
                {"challenge_id": challenge["id"], "code": otp},
                token=result["access_token"],
            )
        return result

    async def refresh(self, token):
        return await self.call(
            "token", {"refresh_token": token}, params={"grant_type": "refresh_token"}
        )

    async def logout(self, token):
        await self.call("logout", token=token, params={"scope": "local"})

    async def close(self):
        await self.client.aclose()
