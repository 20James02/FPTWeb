from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.catalog.accessories import selection, with_accessories
from pagefpt.modules.catalog.geography_routes import router as geography_router
from pagefpt.modules.catalog.images import plan_payload
from pagefpt.modules.catalog.schemas import PlanInput, RegionInput, VersionCommand
from pagefpt.modules.content.cache import public_json
from pagefpt.modules.pricing.engine import calculate_quote
from pagefpt.modules.pricing.landing import (
    has_landing_prices,
    landing_context,
    landing_inputs,
    mark_landing,
)
from pagefpt.modules.pricing.schemas import PriceInput, QuoteRequest

router = APIRouter(prefix="/api/v1")
router.include_router(geography_router)


async def save_resource(request, kind, input):
    actor = await current_actor(request)
    branch = str(input.branch_id) if hasattr(input, "branch_id") else None
    check(actor, "catalog.write", branch)
    return await dispatch(
        request,
        "resource_save",
        actor=actor.user_id,
        kind=kind,
        branch_id=branch,
        payload=await plan_payload(input, request, actor.user_id)
        if kind == "plan"
        else input.model_dump(mode="json"),
    )


@router.get("/catalog")
async def catalog(request: Request):
    return public_json(request, await dispatch(request, "public_catalog", kind="plan"))


@router.get("/accessories")
async def accessories(request: Request):
    data = await dispatch(request, "public_catalog", kind="product")
    return public_json(
        request, {"items": [p for p in data["items"] if p.get("price_vnd") is not None]}
    )


@router.get("/regions/hierarchy")
async def regions_hierarchy(request: Request):
    published = await dispatch(request, "public_catalog", kind="region")
    zones = {
        "mien_bac": "Miền Bắc",
        "mien_trung": "Miền Trung",
        "mien_nam": "Miền Nam",
        "khac": "Khu vực khác",
    }
    hierarchy: dict[str, dict] = {}
    for region in published["items"]:
        if region.get("level", "province") != "province":
            continue
        zone_id = region.get("zone_id", "khac")
        if zone_id not in zones:
            zone_id = "khac"
        zone = hierarchy.setdefault(
            zone_id, {"id": zone_id, "name": zones[zone_id], "provinces": []}
        )
        zone["provinces"].append(
            {
                "code": region["id"],
                "name": region["name"],
                "price_group": region.get("price_group_id") or "",
                "region_code": region["code"],
                "aliases": region.get("aliases", []),
            }
        )
    return hierarchy


@router.get("/regions/{id}/wards")
async def wards(
    id: UUID, request: Request, limit: int = Query(100, ge=1, le=100), before: UUID | None = None
):
    return public_json(
        request,
        await dispatch(
            request,
            "location_list",
            public=True,
            level="ward",
            parent_id=str(id),
            limit=limit,
            before=str(before) if before else None,
        ),
    )


@router.get("/admin/locations")
async def locations(
    request: Request,
    level: Literal["province", "ward"] = "province",
    parent_id: UUID | None = None,
    limit: int = Query(100, ge=1, le=100),
    before: UUID | None = None,
):
    actor = await current_actor(request)
    check(actor, "catalog.write")
    return await dispatch(
        request,
        "location_list",
        actor=actor.user_id,
        level=level,
        parent_id=str(parent_id) if parent_id else None,
        limit=limit,
        before=str(before) if before else None,
    )


@router.get("/regions")
async def regions(request: Request):
    return await dispatch(request, "public_catalog", kind="region")


@router.post("/admin/plans", status_code=201)
async def create_plan(input: PlanInput, request: Request):
    return await save_resource(request, "plan", input)


@router.post("/admin/regions", status_code=201)
async def create_region(input: RegionInput, request: Request):
    return await save_resource(request, "region", input)


@router.post("/admin/{kind}/{id}/publish")
async def publish(kind: str, id: UUID, input: VersionCommand, request: Request):
    from pagefpt.core.errors import DomainError

    kinds = {
        "plans": "plan",
        "products": "product",
        "regions": "region",
        "pages": "page",
        "promotions": "promotion",
        "experiments": "experiment",
    }
    if kind == "prices":
        actor = await current_actor(request)
        check(actor, "pricing.publish", mfa=True)
        return await dispatch(
            request,
            "price_publish",
            actor=actor.user_id,
            id=str(id),
            expected_version=input.expected_version,
        )
    if kind not in kinds:
        raise DomainError("NOT_FOUND", 404)
    permission = (
        "content.publish"
        if kind == "pages"
        else "marketing.write"
        if kind == "experiments"
        else "catalog.write"
    )
    actor = await current_actor(request)
    check(actor, permission, mfa=True)
    if kind == "pages":
        page = await dispatch(request, "resource_get", actor=actor.user_id, kind="page", id=str(id))
        if has_landing_prices(page["payload"]):
            check(actor, "pricing.publish", mfa=True)
    return await dispatch(
        request,
        "resource_publish",
        actor=actor.user_id,
        kind=kinds[kind],
        id=str(id),
        expected_version=input.expected_version,
    )


@router.post("/admin/prices", status_code=201)
async def create_price(input: PriceInput, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    return await dispatch(
        request, "price_create", actor=actor.user_id, payload=input.model_dump(mode="json")
    )


@router.post("/quotes")
async def quote(input: QuoteRequest, request: Request):
    from pagefpt.modules.vouchers.service import public_quote

    return public_quote(await build_quote(input, request))


async def build_quote(input, request, confirmed_path=None):
    devices = await selection(request, input.plan_id, input.accessory_ids)
    data = await dispatch(
        request,
        "pricing_data",
        billing_months=input.billing_months,
        plan_id=str(input.plan_id),
        region_id=str(input.region_id) if input.region_id else None,
    )
    if not data.get("available", True):
        return {
            "status": "not_available",
            "plan_id": str(input.plan_id),
            "region_id": str(input.region_id) if input.region_id else None,
            "revision": data["revision"],
        }
    at = datetime.now(UTC)
    from pagefpt.modules.vouchers.service import decorate, resolve

    campaign = await resolve(request, input.voucher_code) if input.voucher_code != "" else None
    voucher_plan = (
        await dispatch(request, "public_resource", kind="plan", id=str(input.plan_id))
        if campaign
        else None
    )
    voucher_path = (
        confirmed_path
        or data.get("region_path")
        or ([str(input.region_id)] if input.region_id else [])
    )
    context = await landing_context(request, input.landing_slug, str(input.plan_id), at)
    prices, promotions = landing_inputs(
        context, data["prices"], data["promotions"], input.billing_months
    )
    proposal = calculate_quote(
        prices,
        str(input.plan_id),
        str(input.region_id) if input.region_id else None,
        data.get("group_id"),
        input.billing_months,
        at,
        promotions,
        data["revision"],
        region_path=data.get("region_path"),
    )
    # One database read supplies regional prices for all UI periods. Previews have no token.
    billing_options = []
    for months in (1, 6, 12):
        period_prices, period_promotions = landing_inputs(
            context, data["prices"], data["promotions"], months
        )
        preview = calculate_quote(
            period_prices,
            str(input.plan_id),
            str(input.region_id) if input.region_id else None,
            data.get("group_id"),
            months,
            at,
            period_promotions,
            data["revision"],
            region_path=data.get("region_path"),
        )
        preview["billing_months"] = months
        mark_landing(preview, context, at)
        await decorate(request, preview, campaign, voucher_path, input.plan_id, at, voucher_plan)
        billing_options.append(preview)
    with_accessories(proposal, devices, input.billing_months)
    mark_landing(proposal, context, at)
    await decorate(request, proposal, campaign, voucher_path, input.plan_id, at, voucher_plan)
    if input.voucher_code and campaign is None:
        proposal["voucher"] = {"status": "unavailable", "code": input.voucher_code}
    if proposal["status"] == "confirmed":
        result = await dispatch(request, "quote_save", payload=proposal)
        proposal["quote_token"] = crypto(request).sign(
            {
                "purpose": "quote",
                "id": result["id"],
                "exp": datetime.fromisoformat(proposal["expires_at"]).timestamp(),
            }
        )
    proposal["billing_options"] = billing_options
    return proposal
