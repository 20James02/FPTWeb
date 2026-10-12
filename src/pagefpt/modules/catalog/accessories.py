"""Published fixed final device prices; never accept monetary input from clients."""

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError


def for_plan(items, plan):
    return [
        p
        for p in items
        if p.get("price_vnd") is not None
        and (not p.get("plan_ids") or plan["id"] in p["plan_ids"])
        and p.get("service") == plan.get("service")
    ]


async def selection(request, plan_id, ids):
    if not ids:
        return []
    plan = await dispatch(request, "public_resource", kind="plan", id=str(plan_id))
    products = (await dispatch(request, "public_catalog", kind="product"))["items"]
    allowed = {p["id"]: p for p in for_plan(products, {"id": str(plan_id), **plan["payload"]})}
    if len(set(map(str, ids))) != len(ids) or any(str(id) not in allowed for id in ids):
        raise DomainError("INVALID_ACCESSORY", 422)
    return [
        {
            **{
                k: allowed[str(id)][k]
                for k in ("id", "version", "name", "price_vnd", "billing_mode")
            },
            "original_price_vnd": allowed[str(id)].get("original_price_vnd"),
            "offer_label": allowed[str(id)].get("offer_label", ""),
        }
        for id in sorted(ids, key=str)
    ]


def with_accessories(quote, items, months):
    once = sum(p["price_vnd"] for p in items if p["billing_mode"] == "one_time")
    monthly = sum(p["price_vnd"] for p in items if p["billing_mode"] == "monthly")
    quote.update(
        accessory_ids=[p["id"] for p in items],
        accessory_snapshot=items,
        accessory_once_vnd=once,
        accessory_monthly_vnd=monthly,
    )
    if quote["status"] == "confirmed":
        quote["initial_total_vnd"] += once + monthly * months
        quote["line_items"].update(accessory_once_vnd=once, accessory_term_vnd=monthly * months)
    return quote
