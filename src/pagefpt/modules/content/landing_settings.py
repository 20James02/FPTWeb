"""Controlled landing content and independently published campaign prices."""

from datetime import datetime
from typing import Literal
from uuid import UUID

import bleach
from pydantic import Field, field_validator, model_validator

from pagefpt.modules.content.display_settings import normalize_contact_phone
from pagefpt.modules.content.navigation_settings import NavigationLink
from pagefpt.modules.pricing.schemas import Command

LandingIcon = Literal[
    "speed", "wifi", "support", "install", "play", "camera", "users", "building", "award", "shield"
]

LandingSection = Literal[
    "hero",
    "plans",
    "campaign",
    "compare",
    "promo",
    "benefits",
    "stats",
    "reviews",
    "faq",
    "closing",
]
LANDING_SECTION_ORDER: tuple[LandingSection, ...] = (
    "hero",
    "plans",
    "campaign",
    "compare",
    "promo",
    "benefits",
    "stats",
    "reviews",
    "faq",
    "closing",
)


class TextContent(Command):
    @field_validator("*", mode="before")
    @classmethod
    def plain_text(cls, value):
        return (
            bleach.clean(value, tags=[], attributes={}, strip=True)
            if isinstance(value, str)
            else value
        )


class LandingFeature(TextContent):
    title: str = Field(min_length=1, max_length=80)
    text: str = Field(default="", max_length=240)
    icon: LandingIcon = "wifi"


class LandingStat(TextContent):
    value: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=100)
    icon: LandingIcon = "users"


class LandingReview(TextContent):
    name: str = Field(min_length=1, max_length=80)
    location: str = Field(default="", max_length=100)
    quote: str = Field(min_length=1, max_length=500)
    rating: int = Field(default=5, ge=1, le=5)
    avatar_image_id: UUID | None = None


class LandingFAQ(TextContent):
    question: str = Field(min_length=1, max_length=180)
    answer: str = Field(min_length=1, max_length=1200)


class CampaignPrice(Command):
    billing_months: Literal[1, 6, 12]
    monthly_vnd: int = Field(ge=0, le=1000000000)


class LandingCampaign(TextContent):
    enabled: bool = False
    title: str = Field(default="Ưu đãi đăng ký", max_length=100)
    start: datetime | None = None
    end: datetime | None = None
    gift_label: str = Field(default="", max_length=160)
    conditions: str = Field(default="", max_length=1200)
    stock_total: int | None = Field(default=None, ge=1, le=1000000)
    stock_remaining: int | None = Field(default=None, ge=0, le=1000000)
    show_countdown: bool = True
    show_activity: bool = False
    inherit_promotions: bool = False

    @model_validator(mode="after")
    def valid_campaign(self):
        if any(v is not None and v.tzinfo is None for v in (self.start, self.end)):
            raise ValueError("Thời gian cần múi giờ")
        if self.start and self.end and self.end <= self.start:
            raise ValueError("Ngày kết thúc phải sau ngày bắt đầu")
        if self.enabled and (not self.end or not self.conditions.strip()):
            raise ValueError("Chiến dịch cần ngày kết thúc và điều kiện áp dụng")
        if self.stock_remaining is not None and (
            self.stock_total is None or self.stock_remaining > self.stock_total
        ):
            raise ValueError("Số suất còn lại cần tổng số suất và không được lớn hơn tổng")
        return self


class FooterGroup(TextContent):
    title: str = Field(min_length=1, max_length=60)
    links: list[NavigationLink] = Field(default_factory=list, max_length=12)


class PlanPresentation(TextContent):
    plan_id: UUID
    subtitle: str = Field(default="", max_length=100)
    badge: str = Field(default="", max_length=40)
    accent: Literal["blue", "orange"] = "blue"
    features: list[str] = Field(default_factory=list, max_length=8)
    card_labels: dict[
        Literal["badge", "speed", "offers", "equipment", "register", "details"], str
    ] = Field(default_factory=dict)
    campaign_prices: list[CampaignPrice] = Field(default_factory=list, max_length=3)

    @field_validator("card_labels")
    @classmethod
    def labels_valid(cls, value):
        if any(len(v) > 40 or (k != "badge" and not v.strip()) for k, v in value.items()):
            raise ValueError("Nhãn cần 1–40 ký tự; nhãn nổi bật có thể trống")
        return {k: bleach.clean(v, tags=[], attributes={}, strip=True) for k, v in value.items()}

    @model_validator(mode="after")
    def unique_periods(self):
        periods = [p.billing_months for p in self.campaign_prices]
        if len(set(periods)) != len(periods):
            raise ValueError("Mỗi kỳ chỉ thiết lập một giá")
        return self

    @field_validator("features")
    @classmethod
    def feature_text(cls, value):
        if any(not item.strip() or len(item) > 160 for item in value):
            raise ValueError("Mỗi quyền lợi cần 1–160 ký tự")
        return [bleach.clean(item, tags=[], attributes={}, strip=True) for item in value]


def features():
    return [
        LandingFeature(title="Tốc độ phù hợp", text="Chọn kết nối theo nhu cầu", icon="speed"),
        LandingFeature(title="Wi-Fi trong nhà", text="Tư vấn thiết bị và vùng phủ", icon="wifi"),
        LandingFeature(
            title="Lịch lắp linh hoạt", text="Xác nhận sau khi khảo sát", icon="install"
        ),
        LandingFeature(title="Hỗ trợ tư vấn", text="Đồng hành cùng khách hàng", icon="support"),
    ]


class LandingSettings(TextContent):
    campaign: LandingCampaign = Field(default_factory=LandingCampaign)
    contact_phone: str = Field(default="", max_length=24)
    zalo_url: str = Field(default="", max_length=300)
    messenger_url: str = Field(default="", max_length=300)
    contact_label: str = Field(default="Liên hệ tư vấn", min_length=1, max_length=40)
    contact_icon: Literal["support", "phone", "message"] = "support"
    show_contact_popup: bool = True
    footer_groups: list[FooterGroup] = Field(default_factory=list, max_length=6)

    @field_validator("contact_phone")
    @classmethod
    def phone_valid(cls, value):
        return normalize_contact_phone(value) if value else value

    @field_validator("zalo_url", "messenger_url")
    @classmethod
    def contact_link(cls, value):
        if value:
            NavigationLink(label="Liên hệ", href=value)
            if not value.startswith("https://"):
                raise ValueError("Liên hệ cần URL HTTPS")
        return value

    hero_eyebrow: str = Field(default="INTERNET CÁP QUANG FPT TELECOM", max_length=100)
    hero_title: str = Field(default="Đăng Ký Lắp Đặt Internet", min_length=1, max_length=160)
    hero_highlight: str = Field(default="Tốc Độ Cao FPT", max_length=100)
    hero_subtitle: str = Field(default="Kết nối theo nhu cầu – Tư vấn gói phù hợp", max_length=240)
    hero_image_id: UUID | None = None
    hero_mobile_image_id: UUID | None = None
    promo_image_id: UUID | None = None
    closing_image_id: UUID | None = None
    logo_image_id: UUID | None = None
    form_title: str = Field(default="NHẬN TƯ VẤN GÓI INTERNET FPT", max_length=100)
    form_subtitle: str = Field(
        default="Miễn phí tư vấn – Gói phù hợp – Giá rõ ràng", max_length=160
    )
    form_cta: str = Field(default="Nhận tư vấn ngay", min_length=1, max_length=48)
    form_privacy: str = Field(default="Thông tin được dùng để liên hệ tư vấn", max_length=180)
    cta_label: str = Field(default="Đăng ký ngay", min_length=1, max_length=48)
    plans_title: str = Field(default="ĐA DẠNG GÓI CƯỚC – PHÙ HỢP MỌI NHU CẦU", max_length=180)
    plans_subtitle: str = Field(
        default="Internet, truyền hình và camera – Chọn khu vực để xem giá áp dụng", max_length=240
    )
    compare_title: str = Field(default="SO SÁNH NHANH CÁC GÓI CƯỚC", max_length=120)
    promo_title: str = Field(default="ƯU ĐÃI ĐĂNG KÝ", max_length=100)
    promo_subtitle: str = Field(
        default="Được xác nhận theo gói, khu vực và thời gian", max_length=180
    )
    benefits_title: str = Field(default="VÌ SAO NÊN CHỌN INTERNET FPT TELECOM?", max_length=160)
    stats_title: str = Field(default="ĐỒNG HÀNH CÙNG KHÁCH HÀNG", max_length=160)
    reviews_title: str = Field(default="KHÁCH HÀNG NÓI GÌ VỀ DỊCH VỤ?", max_length=160)
    faq_title: str = Field(default="CÂU HỎI THƯỜNG GẶP", max_length=160)
    closing_title: str = Field(default="ĐĂNG KÝ ĐỂ ĐƯỢC TƯ VẤN GÓI PHÙ HỢP", max_length=160)
    closing_subtitle: str = Field(
        default="Chọn gói, kiểm tra địa bàn và xác nhận lịch lắp đặt", max_length=240
    )
    footer_text: str = Field(
        default="Tư vấn Internet, truyền hình và camera theo nhu cầu và địa bàn lắp đặt.",
        max_length=800,
    )
    plan_ids: list[UUID] = Field(default_factory=list, max_length=24)
    plan_presentations: list[PlanPresentation] = Field(default_factory=list, max_length=24)
    billing_months: Literal[1, 6, 12] = 6
    desktop_columns: Literal[0, 3, 4, 5, 6] = 0
    hero_features: list[LandingFeature] = Field(default_factory=features, max_length=6)
    benefits: list[LandingFeature] = Field(default_factory=features, max_length=8)
    promo_items: list[LandingFeature] = Field(default_factory=list, max_length=4)
    stats: list[LandingStat] = Field(default_factory=list, max_length=6)
    reviews: list[LandingReview] = Field(default_factory=list, max_length=12)
    faqs: list[LandingFAQ] = Field(default_factory=list, max_length=16)
    nav_items: list[NavigationLink] = Field(
        default_factory=lambda: [
            NavigationLink(label="Trang chủ", href="/#lp-home"),
            NavigationLink(label="Gói cước", href="/#lp-plans"),
            NavigationLink(label="Ưu đãi", href="/#lp-offers"),
            NavigationLink(label="Khách hàng", href="/#lp-reviews"),
            NavigationLink(label="Hỗ trợ", href="/#lp-faq"),
        ],
        max_length=8,
    )
    footer_links: list[NavigationLink] = Field(
        default_factory=lambda: [
            NavigationLink(label="Chính sách bảo mật", href="/chinh-sach-bao-mat")
        ],
        max_length=12,
    )
    show_comparison: bool = True
    show_promo: bool = True
    show_benefits: bool = True
    show_stats: bool = True
    show_reviews: bool = True
    show_faq: bool = True
    show_closing: bool = True
    theme_preset: Literal[
        "fpt_standard", "blue_trust", "orange_vibrant", "modern_dark", "emerald_fresh"
    ] = "fpt_standard"
    theme_radius: Literal["rounded", "soft", "pill"] = "rounded"
    hero_layout: Literal["split", "centered", "minimal"] = "split"
    plans_layout: Literal["grid", "carousel", "list"] = "grid"
    section_order: list[LandingSection] = Field(
        default_factory=lambda: list(LANDING_SECTION_ORDER),
        max_length=10,
    )

    @field_validator("section_order")
    @classmethod
    def ordered_sections(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Mỗi khối chỉ được xuất hiện một lần")
        # Hiding uses explicit toggles; a partial order must not erase lead/price content.
        return value + [key for key in LANDING_SECTION_ORDER if key not in value]

    @model_validator(mode="after")
    def unique_plans(self):
        ids = [p.plan_id for p in self.plan_presentations]
        if len(set(self.plan_ids)) != len(self.plan_ids) or len(set(ids)) != len(ids):
            raise ValueError("Gói không được trùng")
        return self
