from uuid import UUID

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.catalog.images import media_image, plan_payload
from pagefpt.modules.catalog.schemas import PlanInput, ProductInput, RegionInput, VersionCommand
from pagefpt.modules.content.landing_settings import LandingSettings
from pagefpt.modules.content.schemas import PageInput
from pagefpt.modules.governance.schemas import CostInput
from pagefpt.modules.integrations.schemas import IntegrationInput
from pagefpt.modules.marketing.schemas import CampaignInput, ExperimentInput, PromotionInput
from pagefpt.modules.pricing.landing import has_landing_prices

router = APIRouter(prefix="/api/v1/admin")


async def cms_payload(input, request, actor):
    data = input.model_dump(mode="json")
    if has_landing_prices(data):
        check(await current_actor(request), "pricing.write")
    if data.get("template") == "telecom":
        landing = data.get("landing") or LandingSettings().model_dump(mode="json")
        for key in ("hero", "hero_mobile", "promo", "closing", "logo"):
            if landing.get(key + "_image_id"):
                landing[key + "_image_url"] = (
                    await media_image(UUID(landing[key + "_image_id"]), request, actor)
                )["image_url"]
        for review in landing["reviews"]:
            if review.get("avatar_image_id"):
                review["avatar_image_url"] = (
                    await media_image(UUID(review["avatar_image_id"]), request, actor)
                )["image_url"]
        data["landing"] = landing
    for block in data["blocks"]:
        if block["type"] == "image" and block.get("media_id"):
            try:
                media_id = UUID(block["media_id"])
            except ValueError as exc:
                from pagefpt.core.errors import DomainError

                raise DomainError("INVALID_PLAN_IMAGE", 422) from exc
            block["url"] = (await media_image(media_id, request, actor))["image_url"]
    return data


def register_resource(path, kind, model, permission, create=True, mfa=False):
    async def save(input, request: Request):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        data = (
            await plan_payload(input, request, actor.user_id)
            if kind == "product"
            else await cms_payload(input, request, actor.user_id)
            if kind == "page"
            else input.model_dump(mode="json")
        )
        return await dispatch(
            request,
            "resource_save",
            actor=actor.user_id,
            kind=kind,
            branch_id=data.get("branch_id"),
            payload=data,
        )

    async def update(id: UUID, input, request: Request, expected_version: int = Query(ge=1)):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        data = (
            await plan_payload(input, request, actor.user_id)
            if kind in {"plan", "product"}
            else await cms_payload(input, request, actor.user_id)
            if kind == "page"
            else input.model_dump(mode="json")
        )
        return await dispatch(
            request,
            "resource_update",
            actor=actor.user_id,
            kind=kind,
            id=str(id),
            expected_version=expected_version,
            payload=data,
        )

    async def catalog_listing(
        request: Request, limit: int = Query(default=30, ge=1, le=100), before: UUID | None = None
    ):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        return await dispatch(
            request,
            "resource_list",
            actor=actor.user_id,
            kind=kind,
            limit=limit,
            before=str(before) if before else None,
        )

    async def listing(request: Request, limit: int = Query(default=30, ge=1, le=100)):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        return await dispatch(request, "resource_list", actor=actor.user_id, kind=kind, limit=limit)

    async def get(id: UUID, request: Request):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        return await dispatch(request, "resource_get", actor=actor.user_id, kind=kind, id=str(id))

    async def retire(id: UUID, input: VersionCommand, request: Request):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        return await dispatch(
            request,
            "resource_retire",
            actor=actor.user_id,
            kind=kind,
            id=str(id),
            expected_version=input.expected_version,
        )

    save.__annotations__["input"] = model
    update.__annotations__["input"] = model
    if create:
        router.add_api_route(
            "/" + path, save, methods=["POST"], status_code=201, name="create_" + kind
        )
    router.add_api_route(
        "/" + path,
        catalog_listing if kind in {"plan", "region", "product"} else listing,
        methods=["GET"],
        name="list_" + kind,
    )
    router.add_api_route("/" + path + "/{id}", get, methods=["GET"], name="get_" + kind)
    router.add_api_route("/" + path + "/{id}", update, methods=["PUT"], name="update_" + kind)
    router.add_api_route(
        "/" + path + "/{id}/retire", retire, methods=["POST"], name="retire_" + kind
    )


register_resource("plans", "plan", PlanInput, "catalog.write", False)
register_resource("regions", "region", RegionInput, "catalog.write", False)
register_resource("pages", "page", PageInput, "content.write")
register_resource("promotions", "promotion", PromotionInput, "catalog.write")
register_resource("campaigns", "campaign", CampaignInput, "marketing.write")
register_resource("experiments", "experiment", ExperimentInput, "marketing.write")

register_resource("products", "product", ProductInput, "catalog.write")
register_resource("integrations", "integration", IntegrationInput, "marketing.write", mfa=True)

register_resource("costs", "cost", CostInput, "marketing.write", create=False)
