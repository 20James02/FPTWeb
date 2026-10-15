from datetime import UTC, datetime

import httpx
import respx


def command(provider):
    return {
        "connection": {
            "provider": provider,
            "settings": {
                "measurement_id": "G-QA123",
                "pixel_id": "123456789",
                "api_version": "v24.0",
                "customer_id": "123456789",
            },
        },
        "rule": {
            "provider_event": "Lead",
            "value_vnd": 0,
            "conversion_action": "customers/123456789/conversionActions/888",
        },
        "event": {
            "event_id": "11111111-1111-4111-8111-111111111111",
            "stage": "lead",
            "event_time": datetime.now(UTC).isoformat(),
            "source": {"click_id_type": "gclid"},
        },
        "identifiers": {"ga_client_id": "123456.7890", "fbp": "fb.1.1234567890123.123456789"},
        "click_id": "opaque",
        "client_context": {
            "user_agent": "QA synthetic browser",
            "source_url": "https://example.test/offer",
        },
    }


@respx.mock
async def test_meta_provider_parses_receipt_and_never_sends_contact_data():
    from pagefpt.modules.measurement.providers import deliver

    route = respx.post("https://graph.facebook.com/v24.0/123456789/events").mock(
        return_value=httpx.Response(200, json={"events_received": 1, "fbtrace_id": "trace"})
    )
    async with httpx.AsyncClient() as client:
        result = await deliver(client, command("meta"), {"access_token": "synthetic-secret"})
    assert result.state == "accepted"
    body = route.calls[0].request.content.decode()
    assert (
        "user_data" in body
        and "fbp" in body
        and "client_user_agent" in body
        and "event_source_url" in body
        and "phone" not in body
        and "synthetic-secret" not in body
    )


@respx.mock
async def test_google_data_manager_builds_explicit_destination():
    from pagefpt.modules.measurement.providers import deliver

    route = respx.post("https://datamanager.googleapis.com/v1/events:ingest").mock(
        return_value=httpx.Response(200, json={"requestId": "request-one"})
    )
    async with httpx.AsyncClient() as client:
        result = await deliver(client, command("google_ads"), {"access_token": "synthetic-secret"})
    assert result.state == "received"
    import json

    body = json.loads(route.calls[0].request.content)
    assert body["destinations"][0]["productDestinationId"] == "888"
    assert body["events"][0]["adIdentifiers"]["gclid"] == "opaque"


@respx.mock
async def test_partial_failure_and_ga4_receipt_not_attribution_success():
    from pagefpt.modules.measurement.providers import deliver

    respx.post("https://graph.facebook.com/v24.0/123456789/events").mock(
        return_value=httpx.Response(200, json={"events_received": 0})
    )
    async with httpx.AsyncClient() as client:
        assert (
            await deliver(client, command("meta"), {"access_token": "synthetic-secret"})
        ).state == "failed"
        respx.post("https://www.google-analytics.com/mp/collect").mock(
            return_value=httpx.Response(204)
        )
        assert (
            await deliver(client, command("ga4"), {"api_secret": "synthetic-secret"})
        ).state == "received"


@respx.mock
async def test_meta_website_event_rejects_missing_real_client_context():
    from pagefpt.modules.measurement.providers import deliver

    value = command("meta")
    value.pop("client_context", None)
    async with httpx.AsyncClient() as client:
        result = await deliver(client, value, {"access_token": "synthetic-secret"})
    assert result.state == "failed"
