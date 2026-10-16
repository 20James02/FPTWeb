from xml.sax.saxutils import escape

from fastapi import APIRouter, Request
from fastapi.responses import Response

from pagefpt.api.dependencies import dispatch
from pagefpt.modules.content.schemas import RESERVED_SLUGS
from pagefpt.web.service_pages import SERVICE_PAGES

router = APIRouter()


@router.get("/api/v1/pages/{slug}")
async def page(slug: str, request: Request):
    data = await dispatch(request, "public_page", slug=slug)
    return {"id": data["id"], "version": data["version"], **data["payload"]}


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap(request: Request):
    data = await dispatch(request, "sitemap")
    origin = str(request.base_url).rstrip("/")
    # Deployment public origin should be supplied explicitly in production.
    origin = (request.app.state.settings.public_origin or origin).rstrip("/")
    static_slugs = [
        "",
        "khuyen-mai",
        "do-toc-do",
        "chinh-sach-bao-mat",
        *(f"san-pham/{slug}" for slug in SERVICE_PAGES),
    ]
    db_slugs = [
        x["payload"]["slug"] for x in data["items"] if x["payload"]["slug"] not in RESERVED_SLUGS
    ]
    seen = set()
    all_slugs = []
    for s in static_slugs + db_slugs:
        if s not in seen:
            seen.add(s)
            all_slugs.append(s)
    urls = "".join(
        "<url><loc>" + escape(f"{origin}/{s}".rstrip("/")) + "</loc></url>"
        if s
        else "<url><loc>" + escape(f"{origin}/") + "</loc></url>"
        for s in all_slugs
    )
    return Response(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + urls
        + "</urlset>",
        media_type="application/xml",
    )


@router.get("/robots.txt", include_in_schema=False)
async def robots(request: Request):
    origin = str(request.base_url).rstrip("/")
    origin = (request.app.state.settings.public_origin or origin).rstrip("/")
    return Response(
        f"User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /internal/\nDisallow: /receipt\nSitemap: {origin}/sitemap.xml\n",
        media_type="text/plain",
    )
