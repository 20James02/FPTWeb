from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal


def as_datetime(value):
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def calculate_quote(
    prices: list[dict],
    plan_id: str,
    region_id: str | None,
    group_id: str | None,
    months: int,
    at: datetime,
    promotions: list[dict],
    revision: int,
    region_path: list[str] | None = None,
) -> dict:
    path = region_path or ([region_id] if region_id else [])
    candidates = []
    for p in prices:
        start, end = as_datetime(p["start"]), as_datetime(p["end"]) if p.get("end") else None
        if (
            p["plan_id"] != plan_id
            or p["billing_months"] != months
            or start > at
            or (end and at >= end)
        ):
            continue
        rank = (
            path.index(p["scope_id"])
            if p["scope_kind"] == "region" and p["scope_id"] in path
            else len(path)
            if p["scope_kind"] == "group" and group_id and p["scope_id"] == group_id
            else len(path) + 1
            if p["scope_kind"] == "default"
            else None
        )
        if rank is not None:
            candidates.append((rank, str(p["id"]), p))
    if not candidates or not region_id:
        return {
            "status": "needs_confirmation",
            "revision": revision,
            "plan_id": plan_id,
            "region_id": region_id,
        }
    p = min(candidates, key=lambda x: (x[0], x[1]))[2]
    base = p["monthly_vnd"] * months + p["setup_vnd"] + p["equipment_vnd"]
    before_vat = base
    if not p["vat_included"]:
        base += int(
            (Decimal(base) * Decimal(p["vat_bps"]) / Decimal(10000)).quantize(
                Decimal(1), rounding=ROUND_HALF_UP
            )
        )
    expiry = (
        min(at + timedelta(minutes=15), as_datetime(p["end"]))
        if p.get("end")
        else at + timedelta(minutes=15)
    )
    discount, groups, applied = 0, set(), []
    for promo in sorted(promotions, key=lambda p: (-p["priority"], str(p["id"]))):
        start, end = as_datetime(promo["start"]), as_datetime(promo["end"])
        if not start <= at < end:
            continue
        # A future promotion activation changes the quote too; boundaries handled below.
        if promo.get("plan_ids") and plan_id not in promo["plan_ids"]:
            continue
        if promo.get("region_ids") and not set(path).intersection(promo["region_ids"]):
            continue
        group = promo.get("group", "exclusive")
        if group in groups:
            continue
        groups.add(group)
        discount += max(0, promo["discount_vnd"])
        applied.append(promo["id"])
        expiry = min(expiry, end)
    # Even unselected future price/promotion changes invalidate a signed quote at the boundary.
    for item in [*prices, *promotions]:
        boundary = as_datetime(item["start"])
        if boundary > at:
            expiry = min(expiry, boundary)
    return {
        "status": "confirmed",
        "price_id": str(p["id"]),
        "monthly_vnd": p["monthly_vnd"],
        "vat_included": p["vat_included"],
        "vat_bps": p["vat_bps"],
        "plan_id": plan_id,
        "region_id": region_id,
        "billing_months": months,
        "service_months": months + p["gift_months"],
        "revision": revision,
        "initial_total_vnd": max(0, base - discount),
        "line_items": {
            "term_vnd": p["monthly_vnd"] * months,
            "setup_vnd": p["setup_vnd"],
            "equipment_vnd": p["equipment_vnd"],
            "vat_added_vnd": base - before_vat,
            "base_vnd": base,
            "discount_vnd": min(base, discount),
        },
        "promotion_ids": applied,
        "calculated_at": at.isoformat(),
        "expires_at": expiry.isoformat(),
    }
