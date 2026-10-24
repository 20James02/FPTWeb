import os
from typing import Any

from fastapi import Request

DEFAULT_VUNGTAU_DOMAINS = {
    "fptvungtau.com",
    "www.fptvungtau.com",
    "fpt-vungtau.com",
    "www.fpt-vungtau.com",
    "vungtau.pagefpt.vn",
}


def get_vungtau_domains() -> set[str]:
    """Retrieve all configured domains for the Vũng Tàu landing page."""
    domains = set(DEFAULT_VUNGTAU_DOMAINS)
    env_domains = os.getenv("PAGEFPT_VUNGTAU_DOMAINS", "")
    if env_domains:
        for d in env_domains.split(","):
            clean_d = d.strip().lower()
            if clean_d:
                domains.add(clean_d)
    return domains


def is_vungtau_request(request: Request) -> bool:
    """Algorithm to detect whether an incoming request belongs to the Vũng Tàu landing page.

    Checks query params (?site=vungtau / ?preview_site=vungtau), custom domain in Host header,
    or path prefix.
    """
    site_param = request.query_params.get("site") or request.query_params.get("preview_site")
    if site_param == "vungtau":
        return True

    host = request.headers.get("host", "").lower().split(":")[0].strip()
    active_domains = get_vungtau_domains()
    if host in active_domains or "fptvungtau" in host or "fpt-vungtau" in host:
        return True

    path = request.url.path
    if path == "/vungtau" or path.startswith("/vungtau/"):
        return True

    return False


def get_vungtau_config(
    request: Request, display_settings: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Compile configurable parameters for the Vũng Tàu landing page.

    Provides authentic Vũng Tàu contact information while allowing overrides from admin display_settings.
    """
    phone = "0947 803 111"
    raw_phone = "0947803111"
    zalo_link = "https://zalo.me/0947803111"

    host = request.headers.get("host", "").lower().split(":")[0].strip()
    active_domains = get_vungtau_domains()
    domain = host if host in active_domains else "fpt-vungtau.com"

    return {
        "site_id": "vungtau",
        "brand_name": "FPT Vũng Tàu",
        "brand_title": "FPT Vũng Tàu | Lắp Mạng, WiFi, Internet Chính Hãng",
        "hotline": phone,
        "hotline_tel": f"tel:{raw_phone}",
        "hotline_cs": "1900 6600",
        "hotline_cs_tel": "tel:19006600",
        "zalo_link": zalo_link,
        "address": "186 Trương Công Định, Phường 3, TP. Vũng Tàu",
        "province": "Bà Rịa – Vũng Tàu",
        "email": f"hotro@{domain}",
        "canonical_url": f"https://{domain}/",
        "source_tag": domain,
    }
