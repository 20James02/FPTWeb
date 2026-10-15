"""Pure compilation: only schema-approved public settings leave the server."""

from pagefpt.core.errors import DomainError
from pagefpt.modules.measurement.schemas import EVENTS, ConfigInput

DEFAULT_POLICY = {
    "consent_mode": "advanced",
    "event_enabled": EVENTS,
    "attribution_window_days": 30,
    "minimum_samples": 30,
    "maturity_days": 7,
    "refresh_seconds": 60,
    "retention_days": 90,
}


def effective(bundle, *, path="/", host="", campaign="", draft=None):
    policy = dict(DEFAULT_POLICY)
    rules = []
    versions = []
    records = list(bundle.get("releases", []))
    if draft:
        records = [r for r in records if r["config_id"] != draft["id"]]
        records.append({"config_id": draft["id"], "payload": draft["payload"], "id": "draft"})
    levels = {"global": 0, "domain": 1, "landing": 2, "campaign": 3}
    for row in sorted(records, key=lambda r: levels[r["payload"]["scope"]]):
        p = row["payload"]
        matches = {"global": "*", "domain": host, "landing": path, "campaign": campaign}
        if p["scope_key"] != matches[p["scope"]]:
            continue
        policy.update(p.get("policy", {}))
        if "rules" in p:
            rules = p["rules"]
        versions.append(row["id"])
    conns = {r["id"]: r for r in bundle.get("connections", [])}
    active = {id: r for id, r in conns.items() if r["payload"]["enabled"]}
    ga = active.get(policy.get("ga4_connection_id"), {})
    targets = []
    for rule in rules:
        connection = active.get(rule["connection_id"])
        if not connection:
            continue
        p = connection["payload"]
        settings = p["settings"]
        targets.append(
            {
                **rule,
                "provider": p["provider"],
                "settings": {
                    key: settings.get(key, "")
                    for key in ("tag_id", "pixel_id", "measurement_id", "browser_enabled")
                },
            }
        )
    return {
        "measurement_id": ga.get("payload", {}).get("settings", {}).get("measurement_id", ""),
        "consent_mode": policy["consent_mode"],
        "event_enabled": policy["event_enabled"],
        "refresh_seconds": policy["refresh_seconds"],
        "versions": versions,
        "targets": targets,
        "attribution_window_days": policy["attribution_window_days"],
    }


def validate_config(payload, bundle):
    parsed = ConfigInput.model_validate(payload)
    connections = {row["id"]: row for row in bundle.get("connections", [])}
    refs = [str(parsed.policy.ga4_connection_id)] if parsed.policy.ga4_connection_id else []
    refs += [str(r.connection_id) for r in parsed.rules or []]
    for id in refs:
        conn = connections.get(id)
        if (
            not conn
            or not conn["payload"]["enabled"]
            or conn["payload"]["environment"] != parsed.environment
        ):
            raise DomainError("INVALID_MEASUREMENT_REFERENCE", 422)
    if (
        parsed.policy.ga4_connection_id
        and connections[str(parsed.policy.ga4_connection_id)]["payload"]["provider"] != "ga4"
    ):
        raise DomainError("INVALID_MEASUREMENT_REFERENCE", 422)
    primary = set()
    for rule in parsed.rules or []:
        conn = connections[str(rule.connection_id)]["payload"]
        if (
            conn["provider"] == "google_ads"
            and rule.route == "browser"
            and not rule.conversion_label
        ):
            raise DomainError("CONVERSION_LABEL_REQUIRED", 422)
        key = (
            rule.event,
            conn["provider"],
            conn["settings"].get("customer_id")
            or conn["settings"].get("measurement_id")
            or conn["settings"].get("pixel_id")
            or conn["settings"].get("tag_id"),
        )
        if rule.primary and key in primary:
            raise DomainError("DUPLICATE_PRIMARY_CONVERSION", 422)
        if rule.primary:
            primary.add(key)
    return {
        "valid": True,
        "warnings": ["Cấu hình website không tự thay đổi mục tiêu trong tài khoản quảng cáo."],
    }
