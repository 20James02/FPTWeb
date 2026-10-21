"""Operational promotion context, independent of optional analytics consent."""

from datetime import UTC, datetime

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.vouchers.engine import apply_voucher

COOKIE = "pagefpt_voucher"


def cookie_context(request):
    token = request.cookies.get(COOKIE)
    if token:
        try:
            return crypto(request).verify(token, "voucher_link", datetime.now(UTC))
        except DomainError:
            pass
    return {}


def link_cookie(request):
    return cookie_context(request).get("slug")


async def resolve(request, code=None, link=None, record_click=False):
    if code == "":
        return None
    stored = cookie_context(request)
    slug = link or stored.get("slug")
    if code is None and link is None:
        code = stored.get("code")
    if not code and not slug:
        return None
    if record_click:
        from pagefpt.modules.link_analytics.service import preview_bot

        result = await dispatch(
            request,
            "voucher_resolve",
            code=code,
            slug=slug,
            record_click=True,
            bot=preview_bot(request),
        )
    else:
        result = await dispatch(request, "voucher_resolve", code=code, slug=slug)
    if code and slug:
        source = await dispatch(request, "voucher_resolve", slug=slug)
        if source.get("id") == result.get("id") and source.get("link"):
            result["link"] = source["link"]
    return result if result.get("id") else None


async def decorate(request, quote, campaign, path, plan_id, at, plan=None):
    if campaign is None:
        return quote
    plan = plan or await dispatch(request, "public_resource", kind="plan", id=str(plan_id))
    apply_voucher(quote, campaign, path or [], {"id": str(plan_id), **plan["payload"]}, at)
    return quote


def public_view(data):
    if not data:
        return None
    view = {
        k: data[k]
        for k in (
            "id",
            "code",
            "name",
            "label",
            "terms",
            "start",
            "end",
            "link",
            "sold_out",
            "program_type",
            "popup_config",
            "physical_gift",
        )
        if k in data
    }
    view["benefits"] = [
        {
            **{
                k: rule[k]
                for k in ("region_name", "discount_kind", "amount", "basis", "cap_vnd", "sold_out")
                if k in rule
            },
            "gift_name": (rule.get("gift") or {}).get("name"),
        }
        for rule in data.get("rules", [])
    ]
    view["services"] = data.get("services", [])
    view["billing_months"] = data.get("billing_months", [])
    at = datetime.now(UTC)
    view["status"] = (
        "expired"
        if at >= datetime.fromisoformat(data["end"])
        else "not_started"
        if at < datetime.fromisoformat(data["start"])
        else "active"
    )
    return view


def public_quote(data):
    view = data.get("voucher")
    if view:
        view = dict(view)
        for key in ("rule", "budget_cost_vnd"):
            view.pop(key, None)
        if view.get("gift"):
            view["gift"] = {
                k: v
                for k, v in view["gift"].items()
                if k not in {"cost_vnd", "plan_ids", "service"}
            }
        data["voucher"] = view
    for option in data.get("billing_options", []):
        public_quote(option)
    return data
