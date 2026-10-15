"""Published landing price context; never trust amounts supplied by a visitor."""

from datetime import datetime

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.content.landing_settings import LandingCampaign


def campaign_state(campaign: dict, at: datetime) -> str:
    if not campaign.get("enabled"):
        return "disabled"
    start, end = campaign.get("start"), campaign.get("end")
    if start and at < datetime.fromisoformat(start):
        return "scheduled"
    if end and at >= datetime.fromisoformat(end):
        return "ended"
    if campaign.get("stock_remaining") == 0:
        return "sold_out"
    return "active"


def has_landing_prices(payload: dict) -> bool:
    return any(
        p.get("campaign_prices")
        for p in (payload.get("landing") or {}).get("plan_presentations", [])
    )


async def landing_context(request, slug: str | None, plan_id: str, at: datetime):
    if not slug:
        return None
    row = await dispatch(request, "public_page", slug=slug)
    page = row["payload"]
    if page.get("template") != "telecom":
        raise DomainError("INVALID_LANDING", 422)
    landing = page.get("landing") or {}
    if landing.get("plan_ids") and plan_id not in landing["plan_ids"]:
        raise DomainError("INVALID_LANDING_PLAN", 422)
    campaign = LandingCampaign.model_validate(landing.get("campaign") or {}).model_dump(mode="json")
    presentation: dict = next(
        (p for p in landing.get("plan_presentations", []) if p["plan_id"] == plan_id), {}
    )
    state = campaign_state(campaign, at)
    overrides = presentation.get("campaign_prices", []) if state in ("disabled", "active") else []
    return dict(
        id=row["id"],
        version=row["version"],
        slug=slug,
        state=state,
        campaign=campaign,
        overrides=overrides,
    )


def landing_inputs(context, prices, promotions, billing_months):
    if not context or not context["overrides"]:
        return prices, promotions
    amounts = {p["billing_months"]: p["monthly_vnd"] for p in context["overrides"]}
    prices = [
        dict(
            p,
            monthly_vnd=amounts[p["billing_months"]],
            monthly_coefficient="1",
            display_monthly_vnd=None,
        )
        if p["billing_months"] in amounts
        else p
        for p in prices
    ]
    keep_promotions = billing_months not in amounts or context["campaign"]["inherit_promotions"]
    return prices, promotions if keep_promotions else []


def mark_landing(quote, context, at):
    if not context:
        return quote
    quote["landing"] = {k: context[k] for k in ("id", "version", "slug", "state")}
    quote["landing"]["price_overridden"] = any(
        p["billing_months"] == quote.get("billing_months") for p in context["overrides"]
    )
    if quote.get("expires_at"):
        expiry = datetime.fromisoformat(quote["expires_at"])
        for boundary in ("start", "end"):
            value = context["campaign"].get(boundary)
            if value and context["campaign"]["enabled"]:
                when = datetime.fromisoformat(value)
                if when > at:
                    expiry = min(expiry, when)
        quote["expires_at"] = expiry.isoformat()
    return quote
