"""Export the live route inventory and request contracts for frontend integration.

No accounts/network access. Auth notes describe the Python boundary; SQL scopes
and business validation must also be checked against migrations.
"""

import ast
import asyncio
import inspect
import json
import textwrap
from pathlib import Path

from pydantic import BaseModel

from pagefpt.application import create_app
from pagefpt.core.config import Settings


def route_contexts(app):
    for route in app.routes:
        if hasattr(route, "effective_route_contexts"):
            yield from route.effective_route_contexts()
        elif hasattr(route, "endpoint") and hasattr(route, "methods"):
            yield route


def authorization(endpoint, path):
    if path.startswith("/internal/"):
        return {"caller": "worker_only", "permission": "server worker secret", "mfa": False}
    if path.startswith("/api/v1/webhooks/"):
        return {"caller": "connector_only", "permission": "server HMAC signature", "mfa": False}
    if path.startswith("/api/v1/auth/recovery"):
        return {
            "caller": "public_same_origin_recovery",
            "permission": "active membership after provider proof on reset",
            "mfa": "required when enrolled" if path.endswith("/reset") else False,
        }
    if path.startswith("/api/v1/auth/"):
        return {"caller": "login_or_cookie_session", "permission": None, "mfa": False}
    if not path.startswith("/api/"):
        return {
            "caller": "seo_public"
            if path in {"/robots.txt", "/sitemap.xml"}
            else "health_public"
            if path.startswith("/health/")
            else "preview_html_only",
            "permission": None,
            "mfa": False,
        }
    source = textwrap.dedent(inspect.getsource(endpoint))
    closure = inspect.getclosurevars(endpoint).nonlocals
    checks = []
    for node in ast.walk(ast.parse(source)):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "check"
        ):
            permission = node.args[1]
            value = (
                permission.value
                if isinstance(permission, ast.Constant)
                else closure.get(ast.unparse(permission), ast.unparse(permission))
            )
            mfa = next((kw.value for kw in node.keywords if kw.arg == "mfa"), ast.Constant(False))
            enabled = (
                mfa.value
                if isinstance(mfa, ast.Constant)
                else closure.get(ast.unparse(mfa), ast.unparse(mfa))
            )
            checks.append({"permission": value, "mfa": enabled})
    if endpoint.__name__ in {"create_plan", "create_region"}:
        checks = [{"permission": "catalog.write", "mfa": False}]
    if path == "/api/v1/admin/{kind}/{id}/publish":
        checks = [
            {
                "permission": "prices:pricing.publish; pages:content.publish; experiments:marketing.write; plans/products/regions/promotions:catalog.write",
                "mfa": True,
            }
        ]
    protected = (
        "/admin/" in path
        or path == "/api/v1/admin/me"
        or (path == "/api/v1/system/display-settings" and endpoint.__name__ == "save")
    )
    return {
        "caller": "admin" if protected else "public",
        "checks": checks,
        "resource_kind": closure.get("kind"),
        "scope_note": "DB scope/assignment/global checks may further restrict; UI checks are not authorization.",
    }


async def main():
    app = create_app(Settings(environment="test", _env_file=None))
    schema = app.openapi()
    definitions = dict(schema["components"]["schemas"])
    operations = []
    for route in route_contexts(app):
        path = route.path
        if not (
            path.startswith("/api/")
            or path.startswith("/internal/")
            or path in schema["paths"]
            or path in {"/robots.txt", "/sitemap.xml"}
        ):
            continue
        endpoint = route.endpoint
        for method in sorted(route.methods):
            operation = schema["paths"].get(path, {}).get(method.lower(), {})
            in_openapi = bool(operation)
            if not in_openapi:
                # Worker routes hide from public OpenAPI but still have typed bodies.
                for parameter in inspect.signature(endpoint).parameters.values():
                    model = parameter.annotation
                    if inspect.isclass(model) and issubclass(model, BaseModel):
                        definitions[model.__name__] = model.model_json_schema()
                        operation = {
                            "requestBody": {
                                "required": True,
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": f"#/components/schemas/{model.__name__}"}
                                    }
                                },
                            }
                        }
            operations.append(
                {
                    "method": method,
                    "path": path,
                    "operation_id": operation.get("operationId"),
                    "source": str(Path(inspect.getsourcefile(endpoint)).relative_to(Path.cwd())),
                    "source_line": inspect.getsourcelines(endpoint)[1],
                    "authorization": authorization(endpoint, path),
                    "parameters": operation.get("parameters", []),
                    "request_body": operation.get("requestBody"),
                    "declared_responses": operation.get("responses", {}),
                    "response_model_present": bool(getattr(route, "response_model", None)),
                    "in_openapi": in_openapi,
                }
            )
    operations.sort(key=lambda item: (item["path"], item["method"]))
    output = {
        "generated_from": "current FastAPI route tree + app.openapi + endpoint source",
        "date": "2026-10-02",
        "security_note": "OpenAPI lacks securitySchemes/response models for most routes; permission annotations come from Python, not a complete SQL authorization proof.",
        "operations": operations,
        "schemas": definitions,
    }
    Path("docs/frontend/frontend-contract.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n"
    )
    lines = [
        "# API và tham số kết nối frontend",
        "",
        "Sinh từ code hiện tại bằng `uv run python tools/export_frontend_contract.py`. Không truy cập tài khoản cloud. Quyền trong bảng là kiểm tra Python; SQL còn kiểm tra scope/assignee/global. Response OpenAPI của phần lớn API chưa có DTO: xem response map trong prompt, không coi schema `{}` là hợp đồng đầy đủ.",
        "",
        f"Tổng {len(operations)} method/path: {sum(item['in_openapi'] for item in operations)} có trong OpenAPI và 4 route worker/SEO ngoài OpenAPI.",
        "",
        "## Toàn bộ method, URL, quyền và body",
        "",
        "| Method | URL | Caller/quyền Python | MFA | Body model | Nguồn |",
        "|---|---|---|---|---|---|",
    ]
    for item in operations:
        auth = item["authorization"]
        checks = auth.get("checks", [])
        permission = "; ".join(str(check["permission"]) for check in checks) or str(
            auth.get("permission") or auth["caller"]
        )
        mfa = any(check["mfa"] is True for check in checks)
        content = (item["request_body"] or {}).get("content", {})
        body = content.get("application/json", {}).get("schema", {}).get("$ref", "—").split("/")[-1]
        lines.append(
            f"| {item['method']} | `{item['path']}` | {permission} | {'AAL2' if mfa else '—'} | {body} | `{item['source']}:{item['source_line']}` |"
        )
    lines.extend(
        [
            "",
            "## Path, query và header parameters",
            "",
            "Thiếu query không bắt buộc → dùng default server. Không gắn query chưa có trong bảng để giả có filter/search.",
            "",
        ]
    )
    for item in operations:
        if not item["parameters"]:
            continue
        lines.extend(
            [
                f"### {item['method']} {item['path']}",
                "",
                "| Vị trí | Tên | Bắt buộc | Schema/giới hạn |",
                "|---|---|---|---|",
            ]
        )
        for parameter in item["parameters"]:
            details = json.dumps(
                parameter["schema"], ensure_ascii=False, separators=(",", ":")
            ).replace("|", "\\|")
            lines.append(
                f"| {parameter['in']} | `{parameter['name']}` | {parameter.get('required', False)} | `{details}` |"
            )
        lines.append("")
    lines.extend(
        [
            "## Tất cả request schemas và fields",
            "",
            "`additionalProperties=false`: chỉ gửi whitelist fields, không spread DTO response vào request. Null khác bỏ field. Validator Python về thời gian/fit/redirect/CSV không thể hiện hết bằng JSON Schema; xem prompt và source.",
            "",
        ]
    )
    for name, model in sorted(output["schemas"].items()):
        lines.extend(
            [f"### {name}", "", "| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |", "|---|---|---|"]
        )
        for field, definition in model.get("properties", {}).items():
            details = {key: value for key, value in definition.items() if key != "title"}
            encoded = json.dumps(details, ensure_ascii=False, separators=(",", ":")).replace(
                "|", "\\|"
            )
            lines.append(
                f"| `{field}` | {'Có' if field in model.get('required', []) else 'Không'} | `{encoded}` |"
            )
        lines.append("")
    appendix = "\n".join(lines) + "\n"
    Path("docs/frontend/API-KET-NOI-CHI-TIET.md").write_text(appendix)
    prompt = Path("docs/frontend/PROMPT-KET-NOI-FRONTEND.md")
    start = "<!-- BEGIN GENERATED FRONTEND CONTRACT -->"
    end = "<!-- END GENERATED FRONTEND CONTRACT -->"
    if prompt.exists():
        contents = prompt.read_text()
        if contents.count(start) == contents.count(end) == 1:
            before, rest = contents.split(start, 1)
            _, after = rest.split(end, 1)
            prompt.write_text(before + start + "\n\n" + appendix + "\n" + end + after)
    print(f"Exported {len(operations)} operations, {len(output['schemas'])} schemas")
    async with app.router.lifespan_context(app):
        pass


if __name__ == "__main__":
    asyncio.run(main())
