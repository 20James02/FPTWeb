from datetime import UTC, date, datetime, timedelta
from typing import Literal
from urllib.parse import urlencode
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Request
from fastapi.responses import RedirectResponse

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.link_analytics.metrics import rank_measured
from pagefpt.modules.link_analytics.schemas import (
    BulkInput,
    EngagementInput,
    LinkInput,
    LinkUpdate,
    RevokeInput,
    VisitInput,
)
from pagefpt.modules.link_analytics.service import (
    consent_session,
    preview_bot,
    sign_source,
    source_claims,
)

router = APIRouter()


async def manager(request):
    actor = await current_actor(request)
    check(actor, "marketing.write")
    return actor


@router.get("/api/v1/admin/link-performance/report")
async def report(
    request: Request,
    start: date | None = None,
    end: date | None = None,
    platform: str = Query(default="", max_length=40),
    creator: UUID | None = None,
    kind: Literal["", "content", "voucher"] = "",
    q: str = Query(default="", max_length=100),
    order: Literal[
        "title",
        "platform",
        "creator_name",
        "created_at",
        "clicks",
        "forms",
        "closed",
        "installed",
        "closed_rate",
        "average_engagement_ms",
        "ranking_score",
    ] = "created_at",
    direction: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000000),
    link_id: UUID | None = None,
):
    actor = await manager(request)
    end = end or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    start = start or end - timedelta(days=29)
    if start > end or (end - start).days > 92:
        raise DomainError("INVALID_DATE_RANGE", 422)
    result = await dispatch(
        request,
        "link_report",
        actor=actor.user_id,
        start=start.isoformat(),
        end=end.isoformat(),
        platform=platform,
        creator=str(creator) if creator else None,
        kind=kind,
        q=q,
        order=order,
        direction=direction,
        limit=limit,
        offset=offset,
        link_id=str(link_id) if link_id else None,
    )
    for row in result["items"]:
        row["ranking"] = rank_measured(
            row["mature_visits"], row["mature_forms"], row["mature_closed"]
        )
    return result


@router.get("/api/v1/admin/link-performance/options")
async def options(request: Request):
    actor = await manager(request)
    return await dispatch(request, "link_options", actor=actor.user_id)


@router.get("/api/v1/admin/link-performance")
async def listing(request: Request):
    actor = await manager(request)
    return await dispatch(request, "link_list", actor=actor.user_id)


@router.post("/api/v1/admin/link-performance", status_code=201)
async def create(input: LinkInput, request: Request):
    actor = await manager(request)
    return await dispatch(
        request, "link_save", actor=actor.user_id, payload=input.model_dump(mode="json")
    )


@router.put("/api/v1/admin/link-performance/{id}")
async def update(id: UUID, input: LinkUpdate, request: Request):
    actor = await manager(request)
    return await dispatch(
        request,
        "link_save",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        payload=input.model_dump(mode="json", exclude={"expected_version"}),
    )


@router.post("/api/v1/admin/link-performance/bulk")
async def bulk(input: BulkInput, request: Request):
    actor = await manager(request)
    results = []
    for item in input.items:
        try:
            row = await dispatch(
                request,
                "link_toggle",
                actor=actor.user_id,
                id=str(item.id),
                expected_version=item.expected_version,
                active=input.action == "activate",
            )
            results.append({"id": str(item.id), "saved": True, "version": row["version"]})
        except DomainError as error:
            results.append({"id": str(item.id), "saved": False, "code": error.code})
    return {"items": results}


@router.head("/r/{slug}", include_in_schema=False)
@router.get("/r/{slug}")
async def redirect(slug: str, request: Request):
    if len(slug) > 50:
        raise DomainError("NOT_FOUND", 404)
    row = await dispatch(
        request,
        "link_resolve",
        slug=slug,
        count_click=request.method == "GET",
        bot=preview_bot(request),
    )
    response = RedirectResponse(
        row["payload"]["target"]
        + "?"
        + urlencode(
            {
                "pf_link_source": sign_source(request, row),
                **{
                    k: row["payload"][k]
                    for k in ["utm_medium", "utm_campaign", "utm_content"]
                    if row["payload"].get(k)
                },
                "utm_source": row["payload"]["platform"],
            }
        ),
        status_code=302,
    )
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@router.get("/api/v1/link-tracking/context")
async def context(request: Request):
    from pagefpt.modules.vouchers.service import cookie_context

    cookie = cookie_context(request)
    if not cookie.get("slug"):
        return {"source_token": None}
    row = await dispatch(request, "link_context", kind="voucher", slug=cookie["slug"])
    if not row.get("id"):
        return {"source_token": None}
    if cookie.get("tracking_version"):
        row["version"] = cookie["tracking_version"]
    return {
        "source_token": sign_source(request, row, cookie.get("acquired_at")),
        "source_at": cookie.get("acquired_at"),
    }


@router.post("/api/v1/link-tracking/visit", status_code=201)
async def visit(input: VisitInput, request: Request):
    session = await consent_session(request, input.session_token)
    now = datetime.now(UTC)
    try:
        source = source_claims(crypto(request), input.source_token, now)
    except (ValueError, KeyError, TypeError) as exc:
        raise DomainError("INVALID_LINK_SOURCE", 422) from exc
    try:
        previous = (
            crypto(request).verify(input.visit_token, "link_visit", now)
            if input.visit_token
            else {}
        )
    except DomainError:
        previous = {}
    row = await dispatch(
        request,
        "link_visit",
        session_id=session,
        payload=source,
        id=str(UUID(previous["id"])) if previous.get("link_id") == source["link_id"] else None,
    )
    row["visit_token"] = crypto(request).sign(
        {
            "purpose": "link_visit",
            "id": row["id"],
            "link_id": source["link_id"],
            "exp": (now + timedelta(hours=8)).timestamp(),
        }
    )
    row["source_at"] = source["acquired_at"]
    return row


@router.post("/api/v1/link-tracking/engagement")
async def engagement(input: EngagementInput, request: Request):
    session = await consent_session(request, input.session_token)
    claims = crypto(request).verify(input.visit_token, "link_visit", datetime.now(UTC))
    return await dispatch(
        request,
        "link_engagement",
        id=str(UUID(claims["id"])),
        session_id=session,
        payload=input.model_dump(mode="json", exclude={"visit_token", "session_token"}),
    )


@router.post("/api/v1/link-tracking/revoke")
async def revoke(input: RevokeInput, request: Request):
    claims = crypto(request).verify(input.visit_token, "link_visit", datetime.now(UTC))
    return await dispatch(request, "link_revoke", id=str(UUID(claims["id"])))
