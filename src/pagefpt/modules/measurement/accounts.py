"""Provider account reads and OAuth callbacks; secrets never leave server code."""

import base64
import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.measurement.policy import authorize

router = APIRouter()
OAUTH_COOKIE = "pagefpt_measurement_oauth"
OAUTH_PATH = "/api/v1/admin/measurement/oauth/callback"
CAPABILITIES = {
    "ga4": {
        "browser": True,
        "server": True,
        "oauth": True,
        "cost_sync": False,
        "report_sync": True,
        "external_url_update": False,
    },
    "google_ads": {
        "browser": True,
        "server": True,
        "oauth": True,
        "cost_sync": True,
        "report_sync": True,
        "external_url_update": True,
    },
    "meta": {
        "browser": True,
        "server": True,
        "oauth": False,
        "cost_sync": True,
        "report_sync": True,
        "external_url_update": False,
    },
}


async def private_connection(request, id, actor):
    row = await dispatch(request, "measurement_connection_private", actor=actor.user_id, id=str(id))
    from pagefpt.modules.measurement.credentials import credentials_for

    await credentials_for(
        request.app.state.db, crypto(request), request.app.state.provider_http, id
    )
    row = await dispatch(request, "measurement_connection_private", actor=actor.user_id, id=str(id))
    values = json.loads(crypto(request).decrypt(row["ciphertext"])) if row.get("ciphertext") else {}
    return row, values


@router.get("/capabilities")
async def capabilities(request: Request):
    await authorize(request)
    return {
        "providers": CAPABILITIES,
        "connected_is_account_specific": True,
        "secrets_exposed": False,
        "meta_url_parameters": "copy_into_ads_manager",
        "bulk_limit": 50,
    }


@router.post("/connections/{id}/check")
async def check_connection(id: UUID, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    row, values = await private_connection(request, id, actor)
    p = row["payload"]
    settings = p["settings"]
    token = values.get("access_token")
    result = {"state": "not_configured", "code": "ACCESS_TOKEN_REQUIRED", "provider": p["provider"]}
    if token:
        headers = {"Authorization": "Bearer " + token}
        try:
            if p["provider"] == "ga4":
                prop, stream = settings.get("property_id"), settings.get("stream_id")
                if not prop or not stream:
                    raise ValueError("PROPERTY_AND_STREAM_REQUIRED")
                response = await request.app.state.provider_http.get(
                    f"https://analyticsadmin.googleapis.com/v1beta/properties/{prop}/dataStreams/{stream}",
                    headers=headers,
                )
                data = response.json() if response.is_success else {}
                valid = (
                    data.get("webStreamData", {}).get("measurementId") == settings["measurement_id"]
                )
            elif p["provider"] == "meta":
                version = settings.get("api_version")
                pixel = settings.get("pixel_id")
                if not version:
                    raise ValueError("API_VERSION_REQUIRED")
                response = await request.app.state.provider_http.get(
                    f"https://graph.facebook.com/{version}/{pixel}",
                    headers=headers,
                    params={"fields": "id"},
                )
                data = response.json() if response.is_success else {}
                valid = str(data.get("id", "")) == pixel
            else:
                version = settings.get("ads_api_version")
                customer = settings.get("customer_id")
                if not version or not customer or not values.get("developer_token"):
                    raise ValueError("ADS_API_SETTINGS_REQUIRED")
                headers["developer-token"] = values["developer_token"]
                if settings.get("login_customer_id"):
                    headers["login-customer-id"] = settings["login_customer_id"]
                response = await request.app.state.provider_http.post(
                    f"https://googleads.googleapis.com/{version}/customers/{customer}/googleAds:search",
                    headers=headers,
                    json={
                        "query": "SELECT customer.id, customer.currency_code FROM customer LIMIT 1"
                    },
                )
                data = response.json() if response.is_success else {}
                record = (data.get("results") or [{}])[0].get("customer", {})
                valid = str(record.get("id", "")) == customer and record.get(
                    "currencyCode"
                ) == settings.get("currency", "VND")
            result = {
                "state": "connected" if valid else "unavailable",
                "code": "ACCOUNT_VERIFIED" if valid else "ACCOUNT_NOT_VERIFIED",
                "provider": p["provider"],
            }
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, httpx.HTTPError):
            result = {
                "state": "unavailable",
                "code": "PROVIDER_CHECK_FAILED",
                "provider": p["provider"],
            }
    return await dispatch(
        request,
        "measurement_check_save",
        actor=actor.user_id,
        id=str(id),
        expected_version=row["version"],
        result=result,
    )


@router.post("/connections/{id}/oauth/start")
async def oauth_start(id: UUID, request: Request):
    actor = await authorize(request, "measurement.credentials", mfa=True)
    row, values = await private_connection(request, id, actor)
    if row["payload"]["provider"] not in {"ga4", "google_ads"}:
        raise DomainError("OAUTH_MANUAL_TOKEN_REQUIRED", 422)
    if not values.get("client_id") or not values.get("client_secret"):
        raise DomainError("OAUTH_CLIENT_REQUIRED", 422)
    crypt = crypto(request)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    await dispatch(
        request,
        "measurement_oauth_start",
        actor=actor.user_id,
        id=str(id),
        nonce_hash=crypt.match(nonce, "measurement-oauth"),
        verifier_ciphertext=crypt.encrypt(verifier),
    )
    state = crypt.sign(
        {
            "purpose": "measurement-oauth",
            "actor": actor.user_id,
            "id": str(id),
            "nonce": nonce,
            "version": row["version"],
            "exp": datetime.now(UTC).timestamp() + 600,
        }
    )
    origin = request.app.state.settings.public_origin or str(request.base_url).rstrip("/")
    callback = origin + "/api/v1/admin/measurement/oauth/callback"
    scope = (
        "https://www.googleapis.com/auth/analytics.readonly"
        if row["payload"]["provider"] == "ga4"
        else "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager"
    )
    query = {
        "client_id": values["client_id"],
        "redirect_uri": callback,
        "response_type": "code",
        "scope": scope,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge_method": "S256",
        "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("="),
    }
    result = {
        "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(query),
        "redirect_uri": callback,
    }
    response = JSONResponse(result)
    from pagefpt.modules.identity.sessions import SESSION_COOKIE

    opaque = request.cookies.get(SESSION_COOKIE)
    if opaque:
        bridge = crypt.encrypt(
            crypt.sign(
                {
                    "purpose": "measurement-oauth-bridge",
                    "session": opaque,
                    "nonce": nonce,
                    "exp": datetime.now(UTC).timestamp() + 600,
                }
            )
        )
        response.set_cookie(
            OAUTH_COOKIE,
            bridge,
            max_age=600,
            httponly=True,
            secure=request.app.state.settings.environment in {"staging", "production"},
            samesite="lax",
            path=OAUTH_PATH,
        )
    return response


@router.get("/oauth/callback")
async def oauth_callback(
    request: Request, state: str = Query(max_length=8192), code: str = Query(max_length=2048)
):
    crypt = crypto(request)
    claims = crypt.verify(state, "measurement-oauth", datetime.now(UTC))
    from pagefpt.modules.identity.sessions import SESSION_COOKIE

    if not request.headers.get("authorization") and not request.cookies.get(SESSION_COOKIE):
        bridge_value = request.cookies.get(OAUTH_COOKIE, "")
        if not bridge_value:
            raise DomainError("UNAUTHENTICATED", 401)
        try:
            bridge = crypt.verify(
                crypt.decrypt(bridge_value), "measurement-oauth-bridge", datetime.now(UTC)
            )
        except DomainError as exc:
            raise DomainError("INVALID_OAUTH_STATE", 403) from exc
        if bridge.get("nonce") != claims.get("nonce") or len(bridge.get("session", "")) != 43:
            raise DomainError("INVALID_OAUTH_STATE", 403)
        # Only this callback receives the original session; normal session revocation,
        # current membership and MFA checks are still performed below.
        scope = dict(request.scope)
        scope["headers"] = [(k, v) for k, v in scope["headers"] if k.lower() != b"cookie"] + [
            (b"cookie", (SESSION_COOKIE + "=" + bridge["session"]).encode())
        ]
        request = Request(scope)
    actor = await authorize(request, "measurement.credentials", mfa=True)
    if claims.get("actor") != actor.user_id:
        raise DomainError("INVALID_OAUTH_STATE", 403)
    existing, _ = await private_connection(request, claims["id"], actor)
    if claims.get("version") != existing["version"]:
        raise DomainError("VERSION_CONFLICT", 409)
    proof = await dispatch(
        request,
        "measurement_oauth_consume",
        actor=actor.user_id,
        id=claims["id"],
        nonce_hash=crypt.match(claims["nonce"], "measurement-oauth"),
    )
    row, values = await private_connection(request, claims["id"], actor)
    callback = (
        request.app.state.settings.public_origin or str(request.base_url).rstrip("/")
    ) + "/api/v1/admin/measurement/oauth/callback"
    try:
        response = await request.app.state.provider_http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": values["client_id"],
                "client_secret": values["client_secret"],
                "code": code,
                "code_verifier": crypt.decrypt(proof["verifier_ciphertext"]),
                "redirect_uri": callback,
                "grant_type": "authorization_code",
            },
        )
        data = response.json()
        if (
            not response.is_success
            or not isinstance(data.get("access_token"), str)
            or not 1 <= int(data.get("expires_in", 0)) <= 86400
        ):
            raise ValueError("Invalid token")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError, IndexError) as exc:
        raise DomainError("OAUTH_EXCHANGE_FAILED", 503) from exc
    for key in ("access_token", "refresh_token"):
        if isinstance(data.get(key), str):
            values[key] = data[key]
    await dispatch(
        request,
        "measurement_secret_save",
        actor=actor.user_id,
        id=row["id"],
        expected_version=row["version"],
        ciphertext=crypt.encrypt(json.dumps(values)),
        expires_at=(datetime.now(UTC) + timedelta(seconds=int(data["expires_in"]))).isoformat(),
    )
    response = RedirectResponse("/admin/measurement?connected=1", 303)
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_PATH)
    return response
