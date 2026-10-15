import httpx
import respx


@respx.mock
async def test_ga4_reporting_uses_bounded_page_and_keeps_missing_data_distinct():
    from pagefpt.modules.measurement.sync import fetch_page

    connection = {"payload": {"provider": "ga4", "settings": {"property_id": "123"}}}
    route = respx.post("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport").mock(
        return_value=httpx.Response(
            200,
            json={
                "rowCount": 1,
                "rows": [
                    {
                        "dimensionValues": [
                            {"value": "20261015"},
                            {"value": "google / cpc"},
                            {"value": "camera"},
                        ],
                        "metricValues": [{"value": "10"}, {"value": "6"}, {"value": "45.5"}],
                    }
                ],
            },
        )
    )
    async with httpx.AsyncClient() as client:
        rows, cursor = await fetch_page(
            client,
            connection,
            {"access_token": "synthetic"},
            {"start": "2026-10-15", "end": "2026-10-15"},
        )
    assert (
        rows[0]["sessions"] == 10 and rows[0]["average_session_seconds"] == 45.5 and cursor is None
    )
    import json

    assert json.loads(route.calls[0].request.content)["limit"] == "100"
