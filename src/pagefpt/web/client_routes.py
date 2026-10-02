from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.content.display_settings import get_display_settings

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
    return templates.TemplateResponse(
        request,
        "client/home.html",
        {
            "title": "Lắp Mạng FPT 2026 — Bảng Giá Cáp Quang & Modem Wi-Fi 6",
            "display_settings": await get_display_settings(request),
            "plans": await published_catalog(request),
        },
    )


@router.get("/san-pham/{slug}", response_class=HTMLResponse)
async def product_detail(request: Request, slug: str):
    categories = {
        "internet-gia-dinh": ("Internet Gia Đình", "internet"),
        "combo-fpt-play": ("Combo FPT Play", "combo"),
        "camera-fpt": ("FPT Camera", "camera"),
    }
    name, service = categories.get(slug, ("Dịch Vụ Internet", "internet"))
    catalog = await published_catalog(request)
    plans = [p for p in catalog if p.get("service") == service]
    plan = plans[0] if plans else {}
    product = {
        "name": name,
        "title": plan.get("name", name),
        "summary": plan.get("description", "Nhận tư vấn gói và chi phí theo khu vực lắp đặt."),
        "description": plan.get(
            "description", "Để lại thông tin để được kiểm tra nhu cầu và điều kiện lắp đặt."
        ),
        "speed": f"{plan['speed_mbps']} Mbps" if plan.get("speed_mbps") else "Cần tư vấn",
        "modem": ", ".join(plan.get("equipment", [])) or "Tư vấn theo gói",
        "features": plan.get("equipment", []),
        "plan_id": plan.get("id"),
        "plan_name": plan.get("name", name),
    }
    return templates.TemplateResponse(
        request,
        "client/product_detail.html",
        {
            "product": product,
            "plans": catalog,
            "display_settings": await get_display_settings(request),
        },
    )


@router.get("/khuyen-mai", response_class=HTMLResponse)
async def landing_page(request: Request):
    campaign = {
        "title": "Khuyến Mãi Lắp Mạng FPT Đặc Biệt — Tặng Đến 2 Tháng Cước",
        "badge": "ƯU ĐÃI THÁNG 09/2026",
        "headline": "Lắp Mạng FPT Wi-Fi 6 — Tặng Tới 2 Tháng Cước Miễn Phí",
        "subheadline": "Miễn phí 100% công lắp đặt và vật tư cáp quang khi đăng ký trả trước. Tư vấn và khảo sát hộp cáp trong 5 phút.",
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
        },
    )


@router.get("/chinh-sach-bao-mat", response_class=HTMLResponse)
async def privacy_policy(request: Request):
    return templates.TemplateResponse(
        request,
        "client/home.html",
        {
            "title": "Chính Sách Bảo Mật Dữ Liệu Khách Hàng — PageFPT",
            "plans": await published_catalog(request),
            "display_settings": await get_display_settings(request),
        },
    )
