"""Cost facts are replaceable snapshots, not additive uploads."""

import json
from datetime import UTC, date, datetime

from fastapi import Request

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.link_analytics.metrics import wilson
from pagefpt.modules.measurement.policy import authorize
from pagefpt.modules.measurement.releases import DEFAULT_POLICY
from pagefpt.modules.measurement.schemas import CostApply, CostImport


def digest(request, data):
    return crypto(request).match(
        json.dumps(data, sort_keys=True, separators=(",", ":")), "measurement-cost"
    )


async def preview(input: CostImport, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    data = input.model_dump(mode="json")
    check = await dispatch(request, "measurement_cost_preview", actor=actor.user_id, **data)
    token = crypto(request).sign(
        {
            "purpose": "measurement-cost",
            "actor": actor.user_id,
            "digest": digest(request, data),
            "versions": check["versions"],
            "exp": datetime.now(UTC).timestamp() + 300,
        }
    )
    return {
        "rows": data["rows"],
        "total_cost_vnd": sum(r.cost_vnd for r in input.rows),
        "preview_token": token,
    }


async def apply(input: CostApply, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    data = input.model_dump(mode="json", exclude={"preview_token"})
    claims = crypto(request).verify(input.preview_token, "measurement-cost", datetime.now(UTC))
    if claims.get("actor") != actor.user_id or claims.get("digest") != digest(request, data):
        raise DomainError("COST_PREVIEW_CHANGED", 409)
    return await dispatch(
        request,
        "measurement_cost_apply",
        actor=actor.user_id,
        digest=claims["digest"],
        versions=claims["versions"],
        **data,
    )


async def report(request: Request, start: date, end: date):
    actor = await authorize(request)
    if not 0 <= (end - start).days <= 92:
        raise DomainError("INVALID_REPORT_RANGE", 422)
    bundle = await dispatch(
        request, "measurement_bundle", environment=request.app.state.settings.environment
    )
    policy = dict(DEFAULT_POLICY)
    for release in bundle["releases"]:
        if release["payload"]["scope"] == "global":
            policy.update(release["payload"].get("policy", {}))
    result = await dispatch(
        request,
        "measurement_report",
        actor=actor.user_id,
        start=start.isoformat(),
        end=end.isoformat(),
        maturity_days=policy["maturity_days"],
        environment=request.app.state.settings.environment,
    )
    for row in result["items"]:
        interval = wilson(row["mature_closed"], row["mature_forms"])
        ready = row["mature_forms"] >= policy["minimum_samples"] and interval is not None
        row["ranking"] = {
            "state": "ready" if ready else "insufficient",
            "samples": row["mature_forms"],
            "minimum_samples": policy["minimum_samples"],
            "maturity_days": policy["maturity_days"],
            "closed_interval": interval,
            "score": round(interval[0] * 100, 2) if ready else None,
        }
        row["closed_rate"] = row["closed"] / row["forms"] if row["forms"] else None
    result["policy_versions"] = [r["id"] for r in bundle["releases"]]
    return result
