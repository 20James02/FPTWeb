"""Three sandbox adapter ports. Account/version/credentials are explicit configuration.
No conversion data is transmitted when enabled=False (the deployment default).
"""

from pagefpt.modules.integrations.base import JsonAdapter


def google_adapter(access_token: str, enabled=False, client=None):
    return JsonAdapter(
        "https://datamanager.googleapis.com/v1/events:ingest",
        {"Authorization": "Bearer " + access_token},
        enabled,
        client,
    )


def meta_adapter(pixel_id: str, api_version: str, access_token: str, enabled=False, client=None):
    if (
        not pixel_id.isdecimal()
        or not api_version.startswith("v")
        or not api_version[1:].replace(".", "").isdecimal()
    ):
        raise ValueError("Explicit valid account and API version required")
    return JsonAdapter(
        f"https://graph.facebook.com/{api_version}/{pixel_id}/events",
        {"Authorization": "Bearer " + access_token},
        enabled,
        client,
    )


def tiktok_adapter(access_token: str, enabled=False, client=None):
    return JsonAdapter(
        "https://business-api.tiktok.com/open_api/v1.3/event/track/",
        {"Access-Token": access_token},
        enabled,
        client,
    )
