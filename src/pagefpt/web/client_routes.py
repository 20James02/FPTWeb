from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.content.display_settings import active_slides, get_display_settings
from pagefpt.web.service_pages import SERVICE_PAGES

router = APIRouter()
templates_dir = Path(__file__).resolve().parent.parent / "templates"
templates = Jinja2Templates(directory=str(templates_dir))


async def published_catalog(request, kind="plan"):
    try:
        return (await dispatch(request, "public_catalog", kind=kind))["items"]
    except DomainError:
        # Offline preview may explain the empty catalog, never invent packages/prices.
        if request.app.state.settings.environment not in {"development", "test"}:
            raise
        return []


@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    display = await get_display_settings(request)
    return templates.TemplateResponse(
        request,
        "client/home.html",
        {
            "title": "Lắp Mạng FPT 2026 — Bảng Giá Cáp Quang & Modem Wi-Fi 6",
            "display_settings": display,
            "accessories": await published_catalog(request, "product"),
            "promo_slides": active_slides(display),
            "plans": await published_catalog(request),
        },
    )


@router.get("/san-pham/{slug}", response_class=HTMLResponse)
async def product_detail(request: Request, slug: str):
    product = SERVICE_PAGES.get(slug)
    if product is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy dịch vụ.")
    catalog = await published_catalog(request)
    service_plans = [p for p in catalog if p.get("service") == product["service"]]
    return templates.TemplateResponse(
        request,
        "client/product_detail.html",
        {
            "product": product,
            "plans": catalog,
            "service_plans": service_plans,
            "display_settings": await get_display_settings(request),
            "accessories": await published_catalog(request, "product"),
        },
    )


@router.get("/khuyen-mai", response_class=HTMLResponse)
async def landing_page(request: Request):
    campaign = {
        "title": "Tư Vấn Gói Cước Và Ưu Đãi Theo Khu Vực",
        "badge": "TƯ VẤN THEO ĐỊA BÀN",
        "headline": "Chọn Gói Phù Hợp Với Nhu Cầu Của Bạn",
        "subheadline": "Giá cước và ưu đãi được xác nhận theo gói, địa bàn và thời gian áp dụng. Gửi yêu cầu để được tư vấn.",
        "desc": "Ưu đãi đăng ký lắp mạng FPT mới nhất.",
    }
    return templates.TemplateResponse(
        request,
        "client/landing_page.html",
        {
            "campaign": campaign,
            "regions": await published_catalog(request, "region"),
            "plans": await published_catalog(request),
            "display_settings": await get_display_settings(request),
            "accessories": await published_catalog(request, "product"),
        },
    )


@router.get("/chinh-sach-bao-mat", response_class=HTMLResponse)
async def privacy_policy(request: Request):
    return templates.TemplateResponse(
        request,
        "client/privacy_policy.html",
        {
            "title": "Chính Sách Bảo Mật Dữ Liệu Khách Hàng — PageFPT",
            "plans": await published_catalog(request),
            "display_settings": await get_display_settings(request),
            "accessories": await published_catalog(request, "product"),
        },
    )


@router.get("/do-toc-do", response_class=HTMLResponse)
async def speedtest(request: Request):
    catalog = await published_catalog(request)
    return templates.TemplateResponse(
        request,
        "client/speedtest.html",
        {
            "plans": catalog,
            "speed_plans": sorted(
                [p for p in catalog if p.get("service") in {"internet", "combo", "business"}],
                key=lambda p: (p.get("speed_mbps") or float("inf"), p.get("name", "")),
            ),
            "display_settings": await get_display_settings(request),
            "accessories": await published_catalog(request, "product"),
        },
    )
