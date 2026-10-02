from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from pagefpt.api.authorization import current_actor
from pagefpt.core.errors import DomainError
from pagefpt.modules.content.display_settings import get_display_settings

router = APIRouter(prefix="/admin")
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent.parent / "templates"))


async def render_admin(
    request: Request, template: str, page: str, permissions: tuple[str, ...], **context
):
    try:
        actor = await current_actor(request)
    except DomainError as error:
        if error.status == 401:
            return RedirectResponse("/admin/login", status_code=303)
        raise
    if not any(actor.permits(permission) for permission in permissions):
        return HTMLResponse(
            '<html lang="vi"><meta charset="utf-8"><h1>Bạn chưa có quyền xem trang này.</h1><a href="/admin">Mở khu vực được cấp quyền</a> <a href="/admin/login">Đăng nhập tài khoản khác</a></html>',
            status_code=403,
        )
    if page == "settings":
        context["display_settings"] = await get_display_settings(request)
    return templates.TemplateResponse(
        request, template, {"active_page": page, "admin_actor": actor, **context}
    )


# Ordered landing choices use the same permission checks as their HTML routes.
ADMIN_LANDING = (
    ("/admin/dashboard", ("report.read",)),
    ("/admin/leads", ("lead.read",)),
    ("/admin/marketing", ("marketing.write",)),
    ("/admin/content", ("content.write", "catalog.write")),
    ("/admin/pricing", ("catalog.write", "pricing.write")),
    (
        "/admin/operations",
        (
            "workflow.manage",
            "identity.manage",
            "governance.audit",
            "governance.export",
            "governance.write",
        ),
    ),
    ("/admin/settings", ("workflow.manage", "content.publish")),
)


@router.get("", response_class=HTMLResponse)
async def admin_root(request: Request):
    try:
        actor = await current_actor(request)
    except DomainError as error:
        if error.status == 401:
            return RedirectResponse("/admin/login", status_code=303)
        raise
    for path, permissions in ADMIN_LANDING:
        if any(actor.permits(permission) for permission in permissions):
            return RedirectResponse(path, status_code=303)
    return HTMLResponse(
        '<html lang="vi"><meta charset="utf-8"><h1>Tài khoản chưa được cấp quyền vào các khu vực quản trị.</h1><a href="/admin/login">Đăng nhập tài khoản khác</a></html>',
        status_code=403,
    )


@router.get("/login", response_class=HTMLResponse)
async def admin_login(request: Request):
    return templates.TemplateResponse(request, "admin/login.html", {})


@router.get("/dashboard", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    return await render_admin(request, "admin/dashboard.html", "dashboard", ("report.read",))


@router.get("/leads", response_class=HTMLResponse)
async def admin_leads(request: Request):
    return await render_admin(request, "admin/leads/index.html", "leads", ("lead.read",))


@router.get("/leads/detail", response_class=HTMLResponse)
async def admin_lead_detail(request: Request, id: str = ""):
    return await render_admin(
        request, "admin/leads/detail.html", "leads", ("lead.read",), lead_id=id
    )


@router.get("/pricing", response_class=HTMLResponse)
async def admin_pricing(request: Request):
    return await render_admin(
        request, "admin/pricing/index.html", "pricing", ("catalog.write", "pricing.write")
    )


@router.get("/reports", response_class=HTMLResponse)
async def admin_reports(request: Request):
    return await render_admin(request, "admin/reports/index.html", "reports", ("report.read",))


@router.get("/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    return await render_admin(
        request, "admin/settings.html", "settings", ("workflow.manage", "content.publish")
    )


@router.get("/marketing", response_class=HTMLResponse)
async def admin_marketing(request: Request):
    return await render_admin(request, "admin/workspace.html", "marketing", ("marketing.write",))


@router.get("/content", response_class=HTMLResponse)
async def admin_content(request: Request):
    return await render_admin(
        request, "admin/workspace.html", "content", ("content.write", "catalog.write")
    )


@router.get("/operations", response_class=HTMLResponse)
async def admin_operations(request: Request):
    return await render_admin(
        request,
        "admin/workspace.html",
        "operations",
        (
            "workflow.manage",
            "identity.manage",
            "governance.audit",
            "governance.export",
            "governance.write",
        ),
    )
