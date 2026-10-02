from datetime import UTC, datetime, timedelta

from hypothesis import given
from hypothesis import strategies as st

NOW = datetime(2026, 9, 30, 8, tzinfo=UTC)


def score(evidence):
    from pagefpt.modules.intelligence.scoring import score_lead

    return score_lead(evidence, NOW)


def test_missing_fit_not_zero_and_confidence_evidence():
    x = score({"phone_valid": True})
    assert x["contact_confidence"] == 20
    assert x["fit"] is None and x["completeness"] == 0
    x = score(
        {
            "phone_valid": True,
            "fit": {"need": "yes", "region": "unknown", "infrastructure": "unknown"},
        }
    )
    assert x["fit"] == 100 and x["completeness"] == 1 / 3


def test_intent_dedup_decay_and_old_events():
    event = {"name": "select_plan", "at": NOW.isoformat()}
    assert score({"events": [event, event]})["intent"] == 25
    assert (
        score({"events": [{"name": "select_plan", "at": (NOW - timedelta(days=3)).isoformat()}]})[
            "intent"
        ]
        == 13
    )
    assert (
        score({"events": [{"name": "select_plan", "at": (NOW - timedelta(days=8)).isoformat()}]})[
            "intent"
        ]
        == 0
    )


def test_vpn_fast_form_not_bot():
    assert score({"vpn": True, "fast_form": True, "missing_js": True})["automation_risk"] == 0
    assert score({"honeypot": True, "burst": True})["automation_risk"] == 80


@given(st.booleans(), st.booleans(), st.booleans(), st.booleans())
def test_confidence_bounded(phone, otp, contacted, confirmed):
    x = score(
        {"phone_valid": phone, "otp": otp, "contacted": contacted, "needs_confirmed": confirmed}
    )
    assert 0 <= x["contact_confidence"] <= 100


def test_nlp_span_and_unknown():
    from pagefpt.modules.intelligence.nlp import extract_needs

    x = extract_needs("Nhà 3 tầng cần camera và wifi, lắp trong 2 ngày")
    assert any(i["field"] == "floors" and i["value"] == 3 for i in x)
    assert any(i["field"] == "service" and i["value"] == "camera" for i in x)
    assert extract_needs("Chưa rõ") == []


def test_sla_outside_shift_does_not_count_closed_hours():
    from pagefpt.modules.workflow.sla import compute_sla

    start = datetime(2026, 9, 30, 12, tzinfo=UTC)  # 19:00 local
    result = compute_sla(start, {"weekdays": [0, 1, 2, 3, 4], "start": "08:00", "end": "18:00"})
    assert result == datetime(2026, 10, 1, 1, 10, tzinfo=UTC)


def test_phone_carrier_is_prefix_estimate_and_never_current_network():
    from pagefpt.modules.intelligence.phone import phone_signals

    value = phone_signals("0901234567")
    assert value["format_valid"] is True
    assert value["current_carrier"]["status"] == "unknown"
    assert value["prefix_carrier"]["status"] == "inferred"
    assert "0901234567" not in str(value)
