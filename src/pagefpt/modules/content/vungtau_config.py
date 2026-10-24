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

    Provides authentic Vũng Tàu contact information while allowing overrides from admin settings.
    """
    host = request.headers.get("host", "").lower().split(":")[0].strip()
    active_domains = get_vungtau_domains()
    domain = host if host in active_domains else "fpt-vungtau.com"

    vt_custom = (display_settings or {}).get("vungtau") or {}

    phone = vt_custom.get("hotline") or "0947 803 111"
    raw_digits = "".join(c for c in phone if c.isdigit())
    raw_phone = vt_custom.get("hotline_tel") or (
        f"tel:{raw_digits}" if raw_digits else "tel:0947803111"
    )
    if not raw_phone.startswith("tel:"):
        raw_phone = f"tel:{raw_phone}"

    zalo_link = vt_custom.get("zalo_link") or "https://zalo.me/0947803111"
    hotline_cs = vt_custom.get("hotline_cs") or "1900 6600"
    hotline_cs_tel = vt_custom.get("hotline_cs_tel") or "tel:19006600"
    address = vt_custom.get("address") or "186 Trương Công Định, Phường 3, TP. Vũng Tàu"
    brand_name = vt_custom.get("brand_name") or "FPT Vũng Tàu"
    brand_title = (
        vt_custom.get("brand_title") or "FPT Vũng Tàu | Lắp Mạng, WiFi, Internet Chính Hãng"
    )
    meta_desc = (
        vt_custom.get("meta_desc")
        or "FPT Vũng Tàu chuyên lắp mạng, lắp WiFi FPT chính hãng tại TP Vũng Tàu, Bà Rịa, Phú Mỹ và toàn tỉnh BR-VT."
    )
    google_ads_id = vt_custom.get("google_ads_id") or ""
    google_ads_conversion = vt_custom.get("google_ads_conversion") or ""
    ga4_id = vt_custom.get("ga4_id") or ""
    facebook_pixel_id = vt_custom.get("facebook_pixel_id") or ""
    promo_notice = (
        vt_custom.get("promo_notice")
        or "Đăng ký online nhận ngay ưu đãi tặng tới 2 tháng cước và modem Wi-Fi 6 thế hệ mới."
    )
    quick_plans = vt_custom.get("quick_plans") or [
        "Gói GIGA (150 Mbps) - Siêu tiết kiệm",
        "Gói SKY (1 Gbps) - Tốc độ cao phổ biến",
        "Gói META (1 Gbps đối xứng) - Livestream, Gamer",
        "Gói F-GAME (Game thủ) - Tối ưu Ultra Fast giảm ping",
        "Combo Ngoại Hạng Anh (Internet + FPT Play)",
        "SpeedX Wi-Fi 7 (XGS-PON) - Công nghệ mới nhất",
        "Camera FPT an ninh Cloud",
        "Chưa rõ, cần tư vấn gói phù hợp",
    ]

    default_hero_slides = [
        {
            "image_url": "https://fptvungtau.com/wp-content/uploads/2026/06/lap-mang-fpt-vung-tau-1024x576.jpg",
            "href": "https://fpt-vungtau.com",
            "alt": "Lắp mạng FPT Vũng Tàu",
        },
        {
            "image_url": "https://fptvungtau.com/wp-content/uploads/2026/10/FPT-Vung-Tau-1024x382.jpg",
            "href": "https://fpt-vungtau.com",
            "alt": "FPT Telecom Vũng Tàu",
        },
        {
            "image_url": "https://fptvungtau.com/wp-content/uploads/2026/04/FPT-Giai-Tri-1024x382.jpg",
            "href": "https://fpt-vungtau.com",
            "alt": "Truyền hình FPT Play Vũng Tàu",
        },
    ]
    hero_slides = vt_custom.get("hero_slides") or default_hero_slides

    return {
        "site_id": "vungtau",
        "brand_name": brand_name,
        "brand_title": brand_title,
        "meta_desc": meta_desc,
        "hotline": phone,
        "hotline_tel": raw_phone,
        "hotline_cs": hotline_cs,
        "hotline_cs_tel": hotline_cs_tel,
        "zalo_link": zalo_link,
        "address": address,
        "province": "Bà Rịa – Vũng Tàu",
        "email": f"hotro@{domain}",
        "canonical_url": f"https://{domain}/",
        "source_tag": domain,
        "google_ads_id": google_ads_id,
        "google_ads_conversion": google_ads_conversion,
        "ga4_id": ga4_id,
        "facebook_pixel_id": facebook_pixel_id,
        "promo_notice": promo_notice,
        "quick_plans": quick_plans,
        "hero_slides": hero_slides,
    }
