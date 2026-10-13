from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse, Response

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.catalog.geography import location_id
from pagefpt.modules.catalog.schemas import VersionCommand
from pagefpt.modules.vouchers.schemas import (
    ActionInput,
    ContextInput,
    InventoryInput,
    LinkInput,
    ReserveInput,
    VoucherInput,
    VoucherUpdate,
)
from pagefpt.modules.vouchers.service import COOKIE, cookie_context, public_view, resolve

router = APIRouter()


async def manager(request, publish=False):
    actor = await current_actor(request)
    check(actor, "marketing.write")
    if publish:
        check(actor, "pricing.publish", mfa=True)
    return actor


@router.get("/api/v1/admin/vouchers/report")
async def report(request: Request):
    actor = await manager(request)
    return await dispatch(request, "voucher_report", actor=actor.user_id)


@router.get("/api/v1/admin/vouchers/options")
async def options(request: Request):
    await manager(request)
    source = await request.app.state.geography.load()
    return {
        "provinces": [
            {
                **p,
                "id": location_id("province", p["code"]),
                "wards": [{**w, "id": location_id("ward", w["code"])} for w in p["wards"]],
            }
            for p in source["data"]
        ],
        "source": source["mode"],
    }


@router.get("/api/v1/admin/vouchers/employees")
async def employees(request: Request):
    actor = await manager(request)
    return await dispatch(request, "voucher_employees", actor=actor.user_id)


@router.get("/api/v1/admin/vouchers/inventory")
async def inventory_list(request: Request):
    actor = await manager(request)
    return await dispatch(request, "voucher_inventory_list", actor=actor.user_id)


@router.put("/api/v1/admin/vouchers/inventory")
async def inventory_save(input: InventoryInput, request: Request):
    actor = await manager(request, True)
    return await dispatch(
        request,
        "voucher_inventory_save",
        actor=actor.user_id,
        payload=input.model_dump(mode="json"),
    )


@router.get("/api/v1/admin/vouchers")
async def list_vouchers(request: Request, before: UUID | None = None):
    actor = await manager(request)
    return await dispatch(
        request, "voucher_list", actor=actor.user_id, before=str(before) if before else None
    )


@router.post("/api/v1/admin/vouchers", status_code=201)
async def create(input: VoucherInput, request: Request):
    actor = await manager(request)
    return await dispatch(
        request, "voucher_save", actor=actor.user_id, payload=input.model_dump(mode="json")
    )


@router.put("/api/v1/admin/vouchers/{id}")
async def update(id: UUID, input: VoucherUpdate, request: Request):
    actor = await manager(request)
    return await dispatch(
        request,
        "voucher_save",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        payload=input.model_dump(mode="json", exclude={"expected_version"}),
    )


@router.post("/api/v1/admin/vouchers/{id}/publish")
async def publish(id: UUID, input: VersionCommand, request: Request):
    actor = await manager(request, True)
    return await dispatch(
        request,
        "voucher_publish",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


@router.post("/api/v1/admin/vouchers/{id}/pause")
async def pause(id: UUID, input: VersionCommand, request: Request):
    actor = await manager(request, True)
    return await dispatch(
        request,
        "voucher_pause",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
    )


@router.delete("/api/v1/admin/vouchers/{id}")
async def delete(id: UUID, request: Request, expected_version: int = Query(ge=1)):
    actor = await manager(request, True)
    return await dispatch(
        request,
        "voucher_delete",
        actor=actor.user_id,
        id=str(id),
        expected_version=expected_version,
    )


@router.post("/api/v1/admin/vouchers/{id}/links", status_code=201)
async def share(id: UUID, input: LinkInput, request: Request):
    actor = await manager(request)
    return await dispatch(
        request,
        "voucher_link_save",
        actor=actor.user_id,
        id=str(id),
        payload=input.model_dump(mode="json"),
    )


@router.get("/api/v1/admin/vouchers/links/{slug}/qr")
async def link_qr(slug: str, request: Request):
    actor = await manager(request)
    record = await dispatch(request, "voucher_link_read", actor=actor.user_id, slug=slug)
    from urllib.parse import urlparse

    import qrcode
    import qrcode.image.svg
    from starlette.concurrency import run_in_threadpool

    configured = request.app.state.settings.public_origin
    base = configured or str(request.base_url).rstrip("/")
    if urlparse(base).scheme not in {"http", "https"}:
        raise DomainError("INVALID_SITE_ORIGIN", 422)

    def make():
        return qrcode.make(
            base + "/s/" + record["slug"], image_factory=qrcode.image.svg.SvgPathFillImage
        ).to_string()

    return Response(
        await run_in_threadpool(make),
        media_type="image/svg+xml",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/s/{slug}")
async def short_link(slug: str, request: Request):
    if len(slug) > 50:
        raise DomainError("NOT_FOUND", 404)
    campaign = await resolve(request, link=slug)
    if not campaign:
        raise DomainError(
            "VOUCHER_UNAVAILABLE", 404, "Link ưu đãi đã tạm dừng hoặc không còn hiệu lực."
        )
    response = RedirectResponse(campaign["link"]["target"], status_code=302)
    expiry = min(datetime.now(UTC) + timedelta(days=30), datetime.fromisoformat(campaign["end"]))
    response.set_cookie(
        COOKIE,
        crypto(request).sign({"purpose": "voucher_link", "slug": slug, "exp": expiry.timestamp()}),
        max_age=max(1, int((expiry - datetime.now(UTC)).total_seconds())),
        httponly=True,
        secure=request.app.state.settings.environment not in {"development", "test"},
        samesite="lax",
    )
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@router.get("/api/v1/vouchers/context")
async def context(request: Request, code: str | None = Query(default=None, max_length=40)):
    data = await resolve(request, code=code)
    return {"voucher": public_view(data), "has_context": bool(cookie_context(request))}


@router.delete("/api/v1/vouchers/context")
async def clear(request: Request):
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, httponly=True, samesite="lax")
    return response


@router.post("/api/v1/vouchers/context")
async def save_context(input: ContextInput, request: Request):
    from fastapi.responses import JSONResponse

    campaign = await resolve(request, code=input.code)
    response = JSONResponse({"voucher": public_view(campaign)})
    if campaign:
        expiry = min(
            datetime.now(UTC) + timedelta(days=30), datetime.fromisoformat(campaign["end"])
        )
        if expiry > datetime.now(UTC):
            response.set_cookie(
                COOKIE,
                crypto(request).sign(
                    {
                        "purpose": "voucher_link",
                        "code": input.code,
                        "slug": (campaign.get("link") or {}).get("slug"),
                        "exp": expiry.timestamp(),
                    }
                ),
                max_age=max(1, int((expiry - datetime.now(UTC)).total_seconds())),
                httponly=True,
                samesite="lax",
                secure=request.app.state.settings.environment not in {"development", "test"},
            )
        else:
            response.delete_cookie(COOKIE)
    else:
        response.delete_cookie(COOKIE)
    response.headers["Cache-Control"] = "private, no-store"
    return response


async def lead_context(request, id):
    actor = await current_actor(request)
    check(actor, "lead.write")
    return actor, await dispatch(request, "voucher_lead_read", actor=actor.user_id, id=str(id))


@router.get("/api/v1/admin/leads/{id}/voucher")
async def lead_voucher(id: UUID, request: Request):
    _, record = await lead_context(request, id)
    return record


@router.post("/api/v1/admin/leads/{id}/voucher/reserve")
async def reserve(id: UUID, input: ReserveInput, request: Request):
    actor, record = await lead_context(request, id)
    lead = record["lead"]
    held = record.get("redemption")
    if (
        held
        and held["state"] in {"held", "redeemed"}
        and held["snapshot"]["voucher"]["code"] == input.code
        and held["snapshot"]["billing_months"] == input.billing_months
    ):
        return {**held, "replayed": True}
    address = lead["payload"].get("address_confirmation")
    if not address or not lead["payload"].get("plan_id"):
        raise DomainError(
            "VOUCHER_ADDRESS_REQUIRED",
            422,
            "Hãy xác nhận địa chỉ và gói cước trước khi giữ ưu đãi.",
        )
    from pagefpt.modules.catalog.routes import build_quote
    from pagefpt.modules.pricing.schemas import QuoteRequest

    path = [
        location_id("ward", address["ward_code"]),
        location_id("province", address["province_code"]),
    ]
    proposal = await build_quote(
        QuoteRequest(
            plan_id=lead["payload"]["plan_id"],
            region_id=lead["payload"].get("region_id"),
            billing_months=input.billing_months,
            accessory_ids=lead["payload"].get("accessory_ids", []),
            voucher_code=input.code,
        ),
        request,
        confirmed_path=path,
    )
    if proposal.get("voucher", {}).get("status") == "sold_out":
        raise DomainError(
            "VOUCHER_BUDGET_EXCEEDED"
            if proposal["voucher"].get("limit_reason") == "budget"
            else "VOUCHER_QUOTA_EXCEEDED",
            409,
        )
    if (
        proposal.get("status") != "confirmed"
        or proposal.get("voucher", {}).get("status") != "eligible"
    ):
        raise DomainError(
            "VOUCHER_NOT_ELIGIBLE",
            422,
            "Gói, kỳ thanh toán hoặc địa bàn chưa đủ điều kiện áp dụng voucher.",
        )
    return await dispatch(
        request,
        "voucher_reserve",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        payload=proposal,
        address_confirmation=address,
    )


@router.post("/api/v1/admin/leads/{id}/voucher/{action}")
async def action(id: UUID, action: str, input: ActionInput, request: Request):
    if action not in {"redeem", "release"}:
        raise DomainError("NOT_FOUND", 404)
    actor = await current_actor(request)
    check(actor, "lead.write")
    return await dispatch(
        request,
        "voucher_" + action,
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        reason=input.reason.strip(),
    )
