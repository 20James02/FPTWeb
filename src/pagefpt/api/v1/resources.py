from uuid import UUID

from fastapi import APIRouter, Query, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.modules.catalog.schemas import PlanInput, ProductInput, RegionInput, VersionCommand
from pagefpt.modules.content.schemas import PageInput
from pagefpt.modules.governance.schemas import CostInput
from pagefpt.modules.integrations.schemas import IntegrationInput
from pagefpt.modules.marketing.schemas import CampaignInput, ExperimentInput, PromotionInput

router = APIRouter(prefix="/api/v1/admin")


def register_resource(path, kind, model, permission, create=True, mfa=False):
    async def save(input, request: Request):
        actor = await current_actor(request)
        check(actor, permission, mfa=mfa)
        data = input.model_dump(mode="json")
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
        return await dispatch(
            request,
            "resource_update",
            actor=actor.user_id,
            kind=kind,
            id=str(id),
            expected_version=expected_version,
            payload=input.model_dump(mode="json"),
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
        catalog_listing if kind in {"plan", "region"} else listing,
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
