from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.catalog.geography_routes import router as geography_router
from pagefpt.modules.catalog.schemas import PlanInput, RegionInput, VersionCommand
from pagefpt.modules.content.cache import public_json
from pagefpt.modules.pricing.engine import calculate_quote
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
        payload=input.model_dump(mode="json"),
    )


@router.get("/catalog")
async def catalog(request: Request):
    return public_json(request, await dispatch(request, "public_catalog", kind="plan"))


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
    proposal = calculate_quote(
        data["prices"],
        str(input.plan_id),
        str(input.region_id) if input.region_id else None,
        data.get("group_id"),
        input.billing_months,
        datetime.now(UTC),
        data["promotions"],
        data["revision"],
        region_path=data.get("region_path"),
    )
    if proposal["status"] == "confirmed":
        result = await dispatch(request, "quote_save", payload=proposal)
        proposal["quote_token"] = crypto(request).sign(
            {
                "purpose": "quote",
                "id": result["id"],
                "exp": datetime.fromisoformat(proposal["expires_at"]).timestamp(),
            }
        )
    return proposal
