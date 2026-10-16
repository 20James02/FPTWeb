"""Server-rendered social metadata; no customer session or tracking scripts."""

from pathlib import Path
from urllib.parse import urljoin, urlsplit

from fastapi.templating import Jinja2Templates

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[2] / "templates"))


async def preview_response(slug, request):
    data = await dispatch(request, "voucher_link_preview", slug=slug)
    if not data.get("target"):
        raise DomainError("VOUCHER_UNAVAILABLE", 404)
    origin = request.app.state.settings.public_origin or str(request.base_url).rstrip("/")
    if urlsplit(origin).scheme not in {"http", "https"}:
        raise DomainError("INVALID_SITE_ORIGIN", 422)
    image = data.get("preview_image_url") or "/static/images/device-internet-3d.webp"
    return templates.TemplateResponse(
        request=request,
        name="client/voucher_link_preview.html",
        context={
            "title": data.get("title") or "Tư vấn lắp mạng FPT — Gói cước theo khu vực",
            "description": data.get("description")
            or "Chọn gói Internet, truyền hình và camera theo nhu cầu. Liên hệ để được tư vấn giá và điều kiện áp dụng.",
            "image": urljoin(origin + "/", image),
            "url": origin + "/s/" + slug,
            "target": data["target"],
        },
        headers={
            "Cache-Control": "private, no-store",
            "Vary": "User-Agent",
            "Referrer-Policy": "same-origin",
        },
    )
