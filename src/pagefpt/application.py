from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from pagefpt.core.config import Settings
from pagefpt.infrastructure.ports import Database
from pagefpt.infrastructure.supabase import SupabaseGateway


def create_app(settings: Settings | None = None, gateway: Database | None = None) -> FastAPI:
    settings = settings or Settings()
    db = gateway or SupabaseGateway(
        settings.supabase_url, settings.supabase_secret.get_secret_value()
    )

    @asynccontextmanager
    async def lifespan(app):
        yield
        await db.close()
        app.state.geoip.close()
        await app.state.auth.close()
        await app.state.provider_http.aclose()
        await app.state.geography.http.aclose()

    app = FastAPI(
        title="PageFPT Backend",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.environment in {"development", "test"} else None,
        redoc_url=None,
    )
    app.state.settings, app.state.db = settings, db
    from pagefpt.infrastructure.supabase_auth import SupabaseAuth

    app.state.auth = SupabaseAuth(settings)
    app.state.provider_http = httpx.AsyncClient(
        timeout=httpx.Timeout(3, connect=1),
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        follow_redirects=False,
    )

    from pagefpt.modules.catalog.geography import GeographySource

    app.state.geography = GeographySource(
        httpx.AsyncClient(
            follow_redirects=False,
            limits=httpx.Limits(max_connections=2, max_keepalive_connections=1),
        )
    )

    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
            expose_headers=["X-Request-ID"],
        )

    from pagefpt.modules.vouchers.sharing import VoucherShareMetadataMiddleware

    app.add_middleware(VoucherShareMetadataMiddleware)

    from pagefpt.api.boundary import install_boundary

    install_boundary(app)

    @app.get("/health/live")
    async def live():
        return {"status": "alive"}

    @app.get("/health/ready")
    async def ready():
        await db.rpc("health", {})
        return {"status": "ready"}

    from pagefpt.modules.identity.service import TokenVerifier

    app.state.verifier = TokenVerifier(settings.supabase_url, settings.jwt_audience)

    from pagefpt.modules.intelligence.geoip import GeoIP

    app.state.geoip = GeoIP(settings.geoip_path)

    from pathlib import Path

    from starlette.staticfiles import StaticFiles

    from pagefpt.web.admin_routes import router as web_admin_router
    from pagefpt.web.client_routes import router as web_client_router

    static_path = Path(__file__).resolve().parent / "static"
    if static_path.exists():
        app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

    # Public pages use published catalog snapshots; preview banners stay environment-gated.
    app.include_router(web_client_router)
    app.include_router(web_admin_router)

    from pagefpt.infrastructure.r2 import R2Storage

    app.state.storage = R2Storage(settings)
    from pagefpt.modules.integrations.notifications import NotificationAdapter

    app.state.notifications = NotificationAdapter(settings, app.state.provider_http)
    from pagefpt.modules.integrations.telegram import TelegramAdapter

    app.state.telegram = TelegramAdapter(settings, app.state.provider_http)
    from pagefpt.modules.integrations.conversions import ConversionGateway

    app.state.conversions = ConversionGateway(settings, app.state.provider_http)

    from pagefpt.api.v1.router import router as api_router

    app.include_router(api_router)
    return app
