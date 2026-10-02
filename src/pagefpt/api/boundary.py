from time import monotonic
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from pagefpt.core.errors import DomainError
from pagefpt.core.logging import metric


def install_boundary(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_boundary(request: Request, call_next):
        started = monotonic()
        request.state.request_id = str(uuid4())
        if request.method in {"POST", "PUT", "PATCH"}:
            limit = 1024 * 1024 if "/imports" in request.url.path else 16 * 1024
            body = bytearray()
            oversized = False
            async for chunk in request.stream():
                if len(body) + len(chunk) > limit:
                    oversized = True
                    break
                body.extend(chunk)
            if oversized:
                return JSONResponse(
                    {
                        "code": "BODY_TOO_LARGE",
                        "message": "Payload too large",
                        "fields": {},
                        "request_id": request.state.request_id,
                    },
                    413,
                    headers={"Cache-Control": "no-store"},
                )
            request._body = bytes(body)
        try:
            response = await call_next(request)
        except Exception:
            response = error_response(request, "INTERNAL_ERROR", 500)
        route = getattr(request.scope.get("route"), "path", "unmatched")
        metric(
            "api_latency_ms",
            (monotonic() - started) * 1000,
            route=route,
            status=response.status_code,
        )
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        return response

    def error_response(request, code, status, fields=None):
        return JSONResponse(
            {
                "code": code,
                "message": "Request cannot be completed",
                "fields": fields or {},
                "request_id": getattr(request.state, "request_id", ""),
            },
            status_code=status,
        )

    @app.exception_handler(DomainError)
    async def domain_error(request, exc):
        response = error_response(request, exc.code, exc.status, exc.fields)
        if exc.status == 429:
            response.headers["Retry-After"] = str(
                max(1, min(86400, int(exc.fields.get("retry_after", 60))))
            )
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error_response(
            request, "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR", exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        fields = {".".join(map(str, e["loc"])): e["type"] for e in exc.errors()}
        return error_response(request, "VALIDATION_ERROR", 422, fields)
