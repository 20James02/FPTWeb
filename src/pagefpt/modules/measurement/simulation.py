"""Explain effective routes without creating events or contacting ad providers."""

from pagefpt.modules.measurement.schemas import BEHAVIOR_EVENTS


def simulate_routes(public, bundle, input):
    targets = list(public["targets"])
    # Native GA4 exists independently of explicitly managed conversion links.
    native = next(
        (
            c
            for c in bundle["connections"]
            if c["payload"]["provider"] == "ga4"
            and c["payload"]["enabled"]
            and c["payload"]["settings"].get("measurement_id") == public["measurement_id"]
        ),
        None,
    )
    if (
        native
        and (input.event in BEHAVIOR_EVENTS or input.event == "lead")
        and not any(
            t["event"] == input.event
            and t["provider"] == "ga4"
            and t["route"] in {"browser", "ga4_import"}
            for t in targets
        )
    ):
        targets.append(
            {
                "connection_id": native["id"],
                "event": input.event,
                "provider": "ga4",
                "provider_event": "generate_lead" if input.event == "lead" else input.event,
                "route": "browser",
                "native": True,
            }
        )
    connections = {c["id"]: c["payload"] for c in bundle["connections"]}
    routes = []
    for target in targets:
        if target["event"] != input.event:
            continue
        ga_browser = target["provider"] == "ga4" and (
            target["route"] == "browser"
            or target["route"] == "ga4_import"
            and input.event == "lead"
        )
        limited = ga_browser and public["consent_mode"] == "advanced" and not input.analytics
        consent = (
            limited or input.analytics and (ga_browser or input.marketing and input.advertising)
        )
        settings = connections[target["connection_id"]]["settings"]
        browser = target["route"] == "browser" or ga_browser
        event = "generate_lead" if input.event == "lead" else input.event
        reason = "ready_to_attempt"
        if not consent:
            reason = "consent_required"
        elif (input.event in BEHAVIOR_EVENTS or ga_browser) and event not in public[
            "event_enabled"
        ]:
            reason = "event_disabled"
        elif not settings.get("browser_enabled" if browser else "server_enabled"):
            reason = "browser_disabled" if browser else "server_disabled"
        elif ga_browser and settings.get("measurement_id") != public["measurement_id"]:
            reason = "ga4_destination_inactive"
        routes.append(
            {
                "connection_id": target["connection_id"],
                "source_event": input.event,
                "event": target["provider_event"],
                "provider": target["provider"],
                "route": target["route"],
                "native": target.get("native", False),
                "allowed": reason == "ready_to_attempt",
                "limited": limited and reason == "ready_to_attempt",
                "reason": reason,
                "delivery_verified": False,
                "external_setup_required": target["route"] == "ga4_import",
            }
        )
    return routes
