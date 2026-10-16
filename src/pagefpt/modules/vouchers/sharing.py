"""Server-rendered social metadata; no customer session or tracking scripts."""

import asyncio
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from fastapi import Request
from fastapi.templating import Jinja2Templates
from starlette.datastructures import MutableHeaders

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[2] / "templates"))


async def preview_response(slug, request):
    data = await dispatch(request, "voucher_link_preview", slug=slug)
    if not data.get("target"):
        raise DomainError("VOUCHER_UNAVAILABLE", 404)
    context = share_context(request, slug, data)
    return templates.TemplateResponse(
        request=request,
        name="client/voucher_link_preview.html",
        context=context,
        headers={
            "Cache-Control": "private, no-store",
            "Vary": "User-Agent",
            "Referrer-Policy": "same-origin",
        },
    )


def share_context(request, slug, data):
    origin = request.app.state.settings.public_origin or str(request.base_url).rstrip("/")
    if urlsplit(origin).scheme not in {"http", "https"}:
        raise DomainError("INVALID_SITE_ORIGIN", 422)
    return {
        "title": data.get("title") or "Tư vấn lắp mạng FPT — Gói cước theo khu vực",
        "description": data.get("description")
        or "Chọn gói Internet, truyền hình và camera theo nhu cầu. Liên hệ để được tư vấn giá và điều kiện áp dụng.",
        "image": urljoin(
            origin + "/", data.get("preview_image_url") or "/static/images/device-internet-3d.webp"
        ),
        "url": origin + "/s/" + slug,
        "target": data["target"],
    }


class VoucherShareMetadataMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        metadata = None
        if scope["type"] == "http" and scope["method"] == "GET":
            request = Request(scope)
            path = request.url.path
            section = path.split("/")[1]
            slug = request.query_params.get("pf_offer", "")
            if (
                section
                not in {"admin", "api", "static", "internal", "s", "r", "docs", "health", "receipt"}
                and len(request.query_params.getlist("pf_offer")) == 1
                and re.fullmatch(r"[a-z0-9-]{3,50}", slug)
            ):
                try:
                    async with asyncio.timeout(1.5):
                        data = await dispatch(request, "voucher_link_metadata", slug=slug)
                    if data.get("target") == path:
                        metadata = share_context(request, slug, data)
                        scope.setdefault("state", {})["voucher_share"] = metadata
                except (DomainError, TimeoutError):
                    pass  # Optional social metadata must not block the customer page/form.

        async def send_response(message):
            if metadata and message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if headers.get("content-type", "").startswith("text/html"):
                    headers["Cache-Control"] = "private, no-store"
            await send(message)

        await self.app(scope, receive, send_response)
