"""Published CMS HTML and authenticated draft preview."""

import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import dispatch
from pagefpt.api.v1.resources import cms_payload
from pagefpt.core.errors import DomainError
from pagefpt.modules.content.cache import public_json
from pagefpt.modules.content.display_settings import get_display_settings
from pagefpt.modules.content.landing_settings import LandingSettings
from pagefpt.modules.content.schemas import PageInput
from pagefpt.modules.pricing.landing import campaign_state
from pagefpt.web.client_routes import published_catalog, templates

router = APIRouter()


@router.get("/api/v1/landing/{slug}/activity")
async def activity(slug: str, request: Request):
    if not re.fullmatch(r"[a-z0-9-]{1,100}", slug):
        raise HTTPException(404)
    response = public_json(request, await dispatch(request, "landing_activity", slug=slug))
    response.headers["Cache-Control"] = "public,max-age=30,s-maxage=60,must-revalidate"
    return response


async def render(request, data, preview=False):
    page = data["payload"]
    telecom = page.get("template") == "telecom"
    landing = LandingSettings().model_dump(mode="json") | (page.get("landing") or {})
    plans = await published_catalog(request)
    selected = {p["id"]: p for p in plans}
    landing_plans = (
        [selected[id] for id in landing["plan_ids"] if id in selected]
        if landing["plan_ids"]
        else plans[:24]
    )
    presentations = {p["plan_id"]: p for p in landing["plan_presentations"]}
    for plan in landing_plans:
        plan["presentation"] = presentations.get(plan["id"], {})
        override = plan["presentation"]
        plan["card_labels"] = (plan.get("card_labels") or {}) | override.get("card_labels", {})
        if override.get("badge"):
            plan["card_labels"]["badge"] = override["badge"]
        if override.get("features"):
            plan["equipment"] = override["features"]
        if not plan.get("image_url"):
            device = (
                "camera"
                if plan["service"] == "camera"
                else "play"
                if plan["service"] in {"combo", "play"}
                else "internet"
            )
            plan["image_url"] = f"/static/images/device-{device}-3d.webp"
    now = datetime.now(UTC)
    columns = landing["desktop_columns"] or min(6, max(3, len(landing_plans)))
    origin = request.app.state.settings.public_origin or str(request.base_url).rstrip("/")
    return templates.TemplateResponse(
        request,
        "client/telecom_landing.html" if telecom else "client/cms_page.html",
        {
            "page": page,
            "preview": preview,
            "canonical": origin + "/" + page["slug"],
            "plans": plans,
            "landing": landing,
            "landing_plans": landing_plans,
            "landing_columns": columns,
            "landing_card_mode": True,
            "campaign_state": campaign_state(landing["campaign"], now),
            "server_now": now.isoformat(),
            "accessories": await published_catalog(request, "product"),
            "display_settings": await get_display_settings(request),
        },
    )


@router.post("/api/v1/admin/landing-preview", include_in_schema=False)
async def unsaved_preview(input: PageInput, request: Request):
    actor = await current_actor(request)
    check(actor, "content.write")
    if input.template != "telecom":
        raise HTTPException(422, "Chọn mẫu telecom để xem trước")
    data = await cms_payload(input, request, actor.user_id)
    response = await render(request, {"payload": data}, preview=True)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@router.get("/admin/pages/{id}/preview", include_in_schema=False)
async def preview(id: UUID, request: Request):
    try:
        actor = await current_actor(request)
    except DomainError as e:
        if e.status == 401:
            return RedirectResponse("/admin/login", status_code=303)
        raise
    check(actor, "content.write")
    data = await dispatch(request, "resource_get", actor=actor.user_id, kind="page", id=str(id))
    response = await render(request, data, preview=True)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@router.get("/{slug}", include_in_schema=False)
async def published(slug: str, request: Request):
    if not re.fullmatch(r"[a-z0-9-]{1,100}", slug):
        raise HTTPException(404)
    try:
        data = await dispatch(request, "public_page", slug=slug)
    except DomainError as exc:
        if exc.code == "DATABASE_UNAVAILABLE" and not request.app.state.settings.supabase_url:
            raise HTTPException(404) from exc
        raise
    return await render(request, data)
