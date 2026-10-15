from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import Field

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.catalog.schemas import VersionCommand
from pagefpt.modules.pricing.schemas import BulkPriceInput, MatrixPriceInput, PriceInput

router = APIRouter(prefix="/api/v1/admin")


@router.get("/prices/matrix")
async def price_matrix(request: Request, id: UUID):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    return await dispatch(request, "price_matrix_read", actor=actor.user_id, id=str(id))


@router.post("/prices/matrix")
async def save_price_matrix(input: MatrixPriceInput, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    if input.publish:
        check(actor, "pricing.publish", mfa=True)
    return await dispatch(
        request, "price_matrix_save", actor=actor.user_id, **input.model_dump(mode="json")
    )


@router.get("/prices")
async def prices(
    request: Request, limit: int = Query(default=30, ge=1, le=100), before: UUID | None = None
):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    return await dispatch(
        request,
        "price_list",
        actor=actor.user_id,
        limit=limit,
        before=str(before) if before else None,
    )


@router.post("/prices/bulk", status_code=201)
async def bulk(input: BulkPriceInput, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    if input.publish:
        check(actor, "pricing.publish", mfa=True)
    return await dispatch(
        request, "price_bulk", actor=actor.user_id, **input.model_dump(mode="json")
    )


@router.post("/prices/{id}/replace", status_code=201)
async def replace(
    id: UUID, input: PriceInput, request: Request, expected_version: int = Query(ge=1)
):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    check(actor, "pricing.publish", mfa=True)
    return await dispatch(
        request,
        "price_replace",
        actor=actor.user_id,
        id=str(id),
        expected_version=expected_version,
        payload=input.model_dump(mode="json"),
    )


@router.get("/prices/{id}")
async def price(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    return await dispatch(request, "price_get", actor=actor.user_id, id=str(id))


@router.put("/prices/{id}")
async def update_price(
    id: UUID, input: PriceInput, request: Request, expected_version: int = Query(ge=1)
):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    return await dispatch(
        request,
        "price_update",
        actor=actor.user_id,
        id=str(id),
        expected_version=expected_version,
        payload=input.model_dump(mode="json"),
    )


@router.post("/prices/{id}/retire")
async def retire(id: UUID, input: VersionCommand, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.publish", mfa=True)
    return await dispatch(
        request,
        "price_retire",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


class ConfirmQuote(VersionCommand):
    quote_token: str = Field(min_length=1, max_length=8192)


@router.post("/leads/{id}/quotes/confirm")
async def confirm(id: UUID, input: ConfirmQuote, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    claims = crypto(request).verify(input.quote_token, "quote", datetime.now(UTC))
    return await dispatch(
        request,
        "quote_confirm",
        actor=actor.user_id,
        id=str(id),
        quote_id=claims["id"],
        expected_version=input.expected_version,
    )
