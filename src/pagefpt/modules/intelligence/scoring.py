from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

CONFIDENCE = {"phone_valid": 20, "otp": 30, "contacted": 30, "needs_confirmed": 20}
INTENT = {
    "select_plan": 25,
    "compare_plans": 20,
    "appointment": 25,
    "view_cost": 20,
    "return_visit": 10,
}
RISK = {"honeypot": 50, "burst": 30, "automation_pattern": 30, "impossible_sequence": 20}


def round_score(value):
    return max(0, min(100, int(Decimal(str(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP))))


def score_lead(evidence: dict, as_of: datetime, ruleset_version="rules-v1") -> dict:
    confidence = sum(w for k, w in CONFIDENCE.items() if evidence.get(k) is True)
    latest: dict[str, float] = {}
    for event in evidence.get("events", []):
        if event.get("name") not in INTENT:
            continue
        try:
            at = datetime.fromisoformat(event["at"])
            age = (as_of - at).total_seconds() / 86400
        except (KeyError, ValueError, TypeError):
            continue
        if 0 <= age <= 7:
            latest[event["name"]] = min(latest.get(event["name"], age), age)
    intent = sum(INTENT[name] * 2 ** (-age / 3) for name, age in latest.items())
    fit_values = [
        evidence.get("fit", {}).get(k, "unknown") for k in ("need", "region", "infrastructure")
    ]
    known = sum(v in {"yes", "no"} for v in fit_values)
    fit = round_score(100 * sum(v == "yes" for v in fit_values) / known) if known else None
    risk = sum(w for k, w in RISK.items() if evidence.get(k) is True)
    reasons = [
        {"signal": k, "weight": w, "kind": "confidence"}
        for k, w in CONFIDENCE.items()
        if evidence.get(k) is True
    ]
    reasons.extend(
        {"signal": k, "weight": w, "kind": "risk"}
        for k, w in RISK.items()
        if evidence.get(k) is True
    )
    reasons.extend({"signal": k, "age_days": age, "kind": "intent"} for k, age in latest.items())
    return {
        "contact_confidence": round_score(confidence),
        "intent": round_score(intent),
        "fit": fit,
        "completeness": known / 3,
        "automation_risk": round_score(risk),
        "reasons": reasons,
        "ruleset_version": ruleset_version,
        "computed_at": as_of.isoformat(),
    }


def priority(scores: dict, wait_minutes: float, urgency: float = 50, overdue=False):
    value = (
        0.35 * scores["intent"]
        + 0.25 * (scores["fit"] if scores["fit"] is not None else 50)
        + 0.2 * urgency
        + 0.2 * min(max(0, wait_minutes) / 60 * 100, 100)
    )
    return (1 if overdue else 0, value)
