"""Bounded account reads. Never emit a synthetic conversion or expose provider errors."""

import asyncio
from uuid import UUID

import httpx
from fastapi import APIRouter, Request

from pagefpt.api.dependencies import dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.measurement.accounts import private_connection
from pagefpt.modules.measurement.policy import authorize

router = APIRouter()


def check(key, status, message, next_step=""):
    return {"key": key, "status": status, "message": message, "next_step": next_step}


async def probe(http, key, url, headers, validate, *, body=None):
    try:
        response = await http.request(
            "POST" if body else "GET",
            url,
            headers=headers,
            **({"json": body} if body else {}),
            timeout=6,
        )
        if response.status_code in (401, 403):
            return check(
                key,
                "fail",
                "Tài khoản chưa cấp quyền đọc hoặc token không còn hợp lệ.",
                "Kiểm tra quyền tài khoản, API đã bật và kết nối OAuth/token lại.",
            )
        if response.status_code == 429:
            return check(
                key,
                "warning",
                "Nền tảng đang giới hạn số yêu cầu.",
                "Chờ rồi kiểm tra lại, không bấm liên tục.",
            )
        if not response.is_success or not validate(response.json()):
            return check(
                key,
                "fail",
                "Chưa xác minh được đúng nguồn dữ liệu.",
                "Kiểm tra ID, phiên bản API và quyền truy cập đúng tài khoản.",
            )
        return check(key, "pass", "Đã đọc và xác minh đúng nguồn bằng API.")
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError, IndexError):
        return check(
            key,
            "fail",
            "Chưa đọc được phản hồi hợp lệ từ nền tảng.",
            "Kiểm tra lại sau; nếu tiếp tục lỗi, kiểm tra API/version và hạn token.",
        )


@router.post("/connections/{id}/diagnostics")
async def diagnostics(id: UUID, request: Request):
    actor = await authorize(request, "measurement.configure", mfa=True)
    checks = []
    try:
        async with asyncio.timeout(10):
            row, values = await private_connection(request, id, actor)
    except DomainError as exc:
        if exc.code not in {"CREDENTIALS_EXPIRED", "TOKEN_REFRESH_FAILED", "TOKEN_REFRESH_BUSY"}:
            raise
        return {
            "state": "not_configured",
            "provider": "",
            "delivery_verified": False,
            "checks": [
                check(
                    "credentials",
                    "fail",
                    "Bộ khóa đã hết hạn hoặc chưa làm mới được.",
                    "Cập nhật token hoặc kết nối OAuth lại.",
                )
            ],
        }
    except TimeoutError:
        return {
            "state": "unavailable",
            "provider": "",
            "delivery_verified": False,
            "checks": [
                check(
                    "credentials",
                    "warning",
                    "Xác thực đang mất nhiều thời gian.",
                    "Chờ rồi kiểm tra lại.",
                )
            ],
        }
    p = row["payload"]
    settings, provider = p["settings"], p["provider"]
    checks.append(
        check(
            "enabled",
            "pass" if p["enabled"] else "warning",
            "Kết nối đã bật."
            if p["enabled"]
            else "Kết nối đang tắt; cấu hình công bố sẽ không gửi vào đây.",
            "Bật và lưu kết nối nếu muốn sử dụng." if not p["enabled"] else "",
        )
    )
    checks.append(
        check(
            "browser",
            "pass" if settings.get("browser_enabled") else "warning",
            "Đã khai báo ID và cho phép phương thức trình duyệt; chưa xác minh sự kiện nhận."
            if settings.get("browser_enabled")
            else "Phương thức trình duyệt đang tắt.",
        )
    )
    token = values.get("access_token")
    probes = []
    http = request.app.state.provider_http
    headers = {"Authorization": "Bearer " + token} if token else {}
    if not token:
        checks.append(
            check(
                "credentials",
                "warning",
                "Chưa có Access Token để kiểm tra API.",
                "Đo trình duyệt có thể dùng ID; để đọc báo cáo/API, lưu khóa và kết nối OAuth hoặc token Meta.",
            )
        )
    elif provider == "ga4":
        prop, stream = settings.get("property_id"), settings.get("stream_id")
        if not prop or not stream:
            checks.append(
                check(
                    "account",
                    "fail",
                    "Cần cả Property ID và Stream ID dạng số.",
                    "Lấy mã tài sản và luồng Web trong GA4 rồi lưu kết nối.",
                )
            )
        else:
            probes.extend(
                [
                    probe(
                        http,
                        "account",
                        f"https://analyticsadmin.googleapis.com/v1beta/properties/{prop}/dataStreams/{stream}",
                        headers,
                        lambda d: (
                            d.get("webStreamData", {}).get("measurementId")
                            == settings["measurement_id"]
                        ),
                    ),
                    probe(
                        http,
                        "reporting",
                        f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}/metadata",
                        headers,
                        lambda d: bool(d.get("dimensions") or d.get("metrics")),
                    ),
                ]
            )
    elif provider == "google_ads":
        version, customer = settings.get("ads_api_version"), settings.get("customer_id")
        if not version or not customer or not values.get("developer_token"):
            checks.append(
                check(
                    "account",
                    "fail",
                    "Thiếu phiên bản Ads API, Customer ID hoặc Developer Token.",
                    "Điền đủ các mã và bộ khóa rồi kiểm tra lại.",
                )
            )
        else:
            headers["developer-token"] = values["developer_token"]
            if settings.get("login_customer_id"):
                headers["login-customer-id"] = settings["login_customer_id"]
            probes.append(
                probe(
                    http,
                    "account",
                    f"https://googleads.googleapis.com/{version}/customers/{customer}/googleAds:search",
                    headers,
                    lambda d: (
                        str((d.get("results") or [{}])[0].get("customer", {}).get("id")) == customer
                    ),
                    body={
                        "query": "SELECT customer.id, customer.currency_code FROM customer LIMIT 1"
                    },
                )
            )
    else:
        version, pixel, account = (
            settings.get("api_version"),
            settings.get("pixel_id"),
            settings.get("ad_account_id"),
        )
        if not version:
            checks.append(
                check(
                    "account",
                    "fail",
                    "Chưa chọn phiên bản Graph API.",
                    "Nhập phiên bản còn được Meta hỗ trợ rồi lưu.",
                )
            )
        else:
            probes.append(
                probe(
                    http,
                    "account",
                    f"https://graph.facebook.com/{version}/{pixel}?fields=id",
                    headers,
                    lambda d: str(d.get("id")) == pixel,
                )
            )
            if account:
                probes.append(
                    probe(
                        http,
                        "reporting",
                        f"https://graph.facebook.com/{version}/act_{account}?fields=account_id,currency",
                        headers,
                        lambda d: (
                            str(d.get("account_id")) == account
                            and d.get("currency") == settings.get("currency", "VND")
                        ),
                    )
                )
            else:
                checks.append(
                    check(
                        "reporting", "warning", "Chưa nhập Ad Account ID để kiểm tra đọc chi phí."
                    )
                )
    checks.extend(await asyncio.gather(*probes))
    checks.append(
        check(
            "delivery",
            "warning",
            "Chưa gửi thử hoặc xác minh dữ liệu nhận trên nền tảng.",
            "Dùng GA4 Realtime/Tag Assistant hoặc Meta Test Events; không tạo đơn giả để kiểm tra.",
        )
    )
    failed = any(c["status"] == "fail" for c in checks)
    account_ok = any(c["key"] == "account" and c["status"] == "pass" for c in checks)
    result = {
        "state": "unavailable" if failed else "connected" if account_ok else "not_configured",
        "code": "DIAGNOSTICS_COMPLETE",
        "provider": provider,
        "delivery_verified": False,
        "checks": checks,
    }
    return await dispatch(
        request,
        "measurement_check_save",
        actor=actor.user_id,
        id=str(id),
        expected_version=row["version"],
        result=result,
    )
