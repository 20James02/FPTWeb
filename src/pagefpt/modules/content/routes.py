from xml.sax.saxutils import escape

from fastapi import APIRouter, Request
from fastapi.responses import Response

from pagefpt.api.dependencies import dispatch
from pagefpt.modules.content.schemas import RESERVED_SLUGS

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
    origin = request.app.state.settings.public_origin or origin
    urls = "".join(
        "<url><loc>" + escape(origin + "/" + x["payload"]["slug"]) + "</loc></url>"
        for x in {
            x["payload"]["slug"]: x
            for x in data["items"]
            if x["payload"]["slug"] not in RESERVED_SLUGS
        }.values()
    )
    return Response(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + urls
        + "</urlset>",
        media_type="application/xml",
    )


@router.get("/robots.txt", include_in_schema=False)
async def robots():
    return Response(
        "User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /internal/\nDisallow: /receipt\n",
        media_type="text/plain",
    )
