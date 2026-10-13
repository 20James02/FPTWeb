"""Pure voucher evaluation. Availability is provisional until the database holds a slot."""

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from pagefpt.modules.pricing.engine import as_datetime


def apply_voucher(quote: dict, campaign: dict, path: list[str], plan: dict, at: datetime) -> dict:
    view = {
        "id": campaign["id"],
        "version": campaign["published_version"],
        "code": campaign["code"],
        "name": campaign["name"],
        "label": campaign.get("label", ""),
        "terms": campaign.get("terms", ""),
        "end": campaign["end"],
        "status": "eligible",
    }
    quote["voucher"] = view
    reason = None
    if at < as_datetime(campaign["start"]):
        reason = "not_started"
    elif at >= as_datetime(campaign["end"]):
        reason = "expired"
    elif quote.get("status") != "confirmed" or not path:
        reason = "address_required"
    elif set(path).intersection(campaign.get("exclusions", [])):
        reason = "area_excluded"
    elif campaign.get("plan_ids") and plan["id"] not in campaign["plan_ids"]:
        reason = "plan_mismatch"
    elif campaign.get("services") and plan.get("service") not in campaign["services"]:
        reason = "plan_mismatch"
    elif quote["billing_months"] not in campaign["billing_months"]:
        reason = "term_mismatch"
    elif not campaign["stackable"] and (
        quote.get("promotion_ids") or (quote.get("landing") or {}).get("price_overridden")
    ):
        reason = "promotion_conflict"
    if reason:
        view["status"] = reason
        return quote
    candidates = [
        r for r in campaign["rules"] if r.get("region_id") is None or r["region_id"] in path
    ]
    if not candidates:
        view["status"] = "area_mismatch"
        return quote
    rule = min(
        candidates, key=lambda r: path.index(r["region_id"]) if r.get("region_id") else len(path)
    )
    view.update(rule_key=rule["key"], basis=rule["basis"], rule=rule)
    if rule.get("sold_out") or campaign.get("sold_out"):
        view["status"] = "sold_out"
        return quote
    gift = rule.get("gift")
    if rule.get("gift_product_id"):
        if not gift:
            view["status"] = "gift_unavailable"
            return quote
        if gift.get("service") != plan.get("service") or (
            gift.get("plan_ids") and plan["id"] not in gift["plan_ids"]
        ):
            view["status"] = "gift_incompatible"
            return quote
        if gift["id"] in quote.get("accessory_ids", []):
            view["status"] = "gift_selected"
            return quote
    total, months = quote["initial_total_vnd"], quote["billing_months"]
    service_remaining = max(
        0,
        total - quote.get("accessory_once_vnd", 0) - quote.get("accessory_monthly_vnd", 0) * months,
    )
    basis = rule["basis"]
    eligible = (
        quote["monthly_vnd"]
        if basis == "monthly"
        else quote["line_items"].get("setup_vnd", 0)
        if basis == "setup"
        else quote["line_items"].get("equipment_vnd", 0)
        if basis == "equipment"
        else service_remaining
    )
    discount = rule["amount"]
    if rule["discount_kind"] == "percent":
        discount = int(
            (Decimal(eligible) * Decimal(discount) / 10000).quantize(
                Decimal(1), rounding=ROUND_HALF_UP
            )
        )
    discount = min(eligible, discount)
    if rule.get("cap_vnd") is not None:
        discount = min(discount, rule["cap_vnd"])
    if basis == "monthly":
        # Discounts are final VND reductions; original tax breakdown stays on the quote.
        discount = min(discount, service_remaining // months)
        discount *= months
    discount = min(service_remaining, discount)
    gift = rule.get("gift")
    budget_cost = discount + (gift["cost_vnd"] if gift else 0)
    if (
        campaign.get("remaining_budget_vnd") is not None
        and budget_cost > campaign["remaining_budget_vnd"]
    ):
        view["status"] = "sold_out"
        view["limit_reason"] = "budget"
        return quote
    if basis == "monthly":
        quote["voucher_base_monthly_vnd"] = quote["monthly_vnd"]
        quote["monthly_vnd"] -= discount // months
    view.update(
        discount_vnd=discount,
        budget_cost_vnd=budget_cost,
        gift=gift,
    )
    quote["initial_total_vnd"] -= discount
    quote["line_items"]["voucher_discount_vnd"] = discount
    quote["expires_at"] = min(
        as_datetime(quote["expires_at"]), as_datetime(campaign["end"])
    ).isoformat()
    return quote
