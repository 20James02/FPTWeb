"""Bounded provider contracts. Transport receipt is distinct from attribution."""

import re
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx


@dataclass(frozen=True)
class Outcome:
    state: str
    code: str
    provider_id: str | None = None


def build(command, secrets):
    connection, rule, event = command["connection"], command["rule"], command["event"]
    provider, settings = connection["provider"], connection["settings"]
    ids = command.get("identifiers", {})
    time = datetime.fromisoformat(event["event_time"].replace("Z", "+00:00"))
    if time.tzinfo is None or (datetime.now(UTC) - time).total_seconds() < -60:
        raise ValueError("INVALID_EVENT_TIME")
    if (datetime.now(UTC) - time).total_seconds() > (
        72 * 3600 if provider == "ga4" else 7 * 86400 if provider == "meta" else 90 * 86400
    ):
        raise ValueError("EVENT_TOO_OLD")
    headers = {"Content-Type": "application/json"}
    if provider == "ga4":
        if not re.fullmatch(r"[0-9]{1,20}\.[0-9]{1,20}", ids.get("ga_client_id", "")):
            raise ValueError("CLIENT_IDENTIFIER_REQUIRED")
        if not secrets.get("api_secret"):
            raise ValueError("CREDENTIALS_REQUIRED")
        if not re.fullmatch(r"G-[A-Z0-9]{3,30}", settings.get("measurement_id", "")):
            raise ValueError("INVALID_DESTINATION")
        params = {"api_secret": secrets["api_secret"], "measurement_id": settings["measurement_id"]}
        name = rule["provider_event"]
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,39}", name):
            raise ValueError("INVALID_EVENT")
        return (
            "https://www.google-analytics.com/mp/collect",
            headers,
            params,
            {
                "client_id": ids["ga_client_id"],
                "timestamp_micros": int(time.timestamp() * 1000000),
                "consent": {
                    "ad_user_data": "GRANTED",
                    "ad_personalization": "GRANTED" if command.get("personalization") else "DENIED",
                },
                "events": [{"name": name, "params": {"measurement_origin": "crm"}}],
            },
        )
    if not secrets.get("access_token"):
        raise ValueError("CREDENTIALS_REQUIRED")
    headers["Authorization"] = "Bearer " + secrets["access_token"]
    if provider == "google_ads":
        customer = settings.get("customer_id", "")
        action = re.fullmatch(
            r"customers/([0-9]+)/conversionActions/([0-9]+)", rule.get("conversion_action", "")
        )
        click_type = (event.get("source") or {}).get("click_id_type")
        if (
            not action
            or action[1] != customer
            or click_type not in {"gclid", "gbraid", "wbraid"}
            or not command.get("click_id")
        ):
            raise ValueError("DESTINATION_OR_CLICK_REQUIRED")
        destination = {
            "reference": "primary",
            "operatingAccount": {"accountType": "GOOGLE_ADS", "accountId": customer},
            "productDestinationId": action[2],
        }
        if settings.get("login_customer_id"):
            destination["loginAccount"] = {
                "accountType": "GOOGLE_ADS",
                "accountId": settings["login_customer_id"],
            }
        return (
            "https://datamanager.googleapis.com/v1/events:ingest",
            headers,
            {},
            {
                "destinations": [destination],
                "consent": {
                    "adUserData": "CONSENT_GRANTED",
                    "adPersonalization": "CONSENT_GRANTED"
                    if command.get("personalization")
                    else "CONSENT_DENIED",
                },
                "events": [
                    {
                        "destinationReferences": ["primary"],
                        "transactionId": event["event_id"],
                        "eventTimestamp": time.isoformat(),
                        "adIdentifiers": {click_type: command["click_id"]},
                        "currency": "VND",
                        "conversionValue": rule.get("value_vnd", 0),
                        "eventSource": "WEB" if event["stage"] == "lead" else "OTHER",
                    }
                ],
            },
        )
    if provider == "meta":
        pixel = settings.get("pixel_id", "")
        version = settings.get("api_version", "")
        if not re.fullmatch(r"[0-9]{1,30}", pixel) or not re.fullmatch(r"v[0-9]{1,2}\.0", version):
            raise ValueError("INVALID_DESTINATION")
        user_data = {
            k: ids[k]
            for k in ("fbp", "fbc")
            if re.fullmatch(r"fb\.[0-9]+\.[0-9]{10,16}\.[a-zA-Z0-9_-]{1,256}", ids.get(k, ""))
        }
        if not user_data:
            raise ValueError("CLIENT_IDENTIFIER_REQUIRED")
        payload = {
            "data": [
                {
                    "event_id": event["event_id"],
                    "event_name": rule["provider_event"],
                    "event_time": int(time.timestamp()),
                    "action_source": "website" if event["stage"] == "lead" else "system_generated",
                    "user_data": user_data,
                }
            ]
        }
        if settings.get("test_event_code"):
            payload["test_event_code"] = settings["test_event_code"]
        return f"https://graph.facebook.com/{version}/{pixel}/events", headers, {}, payload
    raise ValueError("UNSUPPORTED_CONNECTOR")


async def deliver(client, command, secrets):
    try:
        endpoint, headers, params, payload = build(command, secrets)
    except (ValueError, KeyError, TypeError):
        return Outcome("failed", "INVALID_PROVIDER_INPUT")
    try:
        response = await client.post(
            endpoint,
            headers=headers,
            params=params,
            json=payload,
            timeout=httpx.Timeout(5, connect=2),
            follow_redirects=False,
        )
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
        return Outcome("retry", "CONNECTION_FAILED")
    except httpx.HTTPError:
        return Outcome("unknown", "RESPONSE_UNKNOWN")
    if response.status_code == 429:
        return Outcome("retry", "PROVIDER_RATE_LIMIT")
    if response.status_code >= 500:
        return Outcome("unknown", "PROVIDER_RESPONSE_UNKNOWN")
    if not response.is_success:
        return Outcome("failed", "PROVIDER_REJECTED")
    provider = command["connection"]["provider"]
    if provider == "ga4":
        return Outcome("received", "TRANSPORT_RECEIVED")
    try:
        data = response.json()
    except ValueError:
        return Outcome("unknown", "INVALID_PROVIDER_RESPONSE")
    if not isinstance(data, dict) or data.get("error") or data.get("partialFailureError"):
        return Outcome("failed", "PROVIDER_REJECTED")
    if provider == "meta":
        if data.get("events_received") != 1:
            return Outcome("failed", "EVENT_NOT_ACCEPTED")
        return Outcome("accepted", "EVENT_ACCEPTED", str(data.get("fbtrace_id", ""))[:200])
    if not data.get("requestId"):
        return Outcome("unknown", "MISSING_PROVIDER_RECEIPT")
    # Data Manager receipt is asynchronous; warnings are surfaced for reconciliation.
    return Outcome(
        "received",
        "RECEIVED_WITH_WARNINGS" if data.get("fieldWarnings") else "AWAITING_PROVIDER_PROCESSING",
        str(data["requestId"])[:200],
    )
