import pytest


@pytest.fixture
async def published_ui_plans(admin):
    plans = []
    for index in range(5):
        plan = (
            await admin.post(
                "/api/v1/admin/plans",
                json={
                    "name": f"QA UI Plan {index}",
                    "service": "internet",
                    "code": f"qa-ui-{index}",
                },
            )
        ).json()
        result = await admin.post(
            f"/api/v1/admin/plans/{plan['id']}/publish", json={"expected_version": plan["version"]}
        )
        assert result.status_code == 200
        plans.append(plan)
    return plans


@pytest.mark.asyncio
async def test_client_home_renders(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    text = response.text
    assert "Lắp Mạng FPT" in text
    assert "GÓI SKY" in text
    assert "Wi-Fi 6" in text
    assert "Nhận tư vấn" in text


@pytest.mark.asyncio
async def test_client_product_detail_renders(client):
    response = await client.get("/san-pham/internet-gia-dinh")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Internet Gia Đình" in response.text


@pytest.mark.asyncio
async def test_client_landing_page_renders(client):
    response = await client.get("/khuyen-mai")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Khuyến Mãi" in response.text


@pytest.mark.asyncio
async def test_admin_login_renders(client):
    response = await client.get("/admin/login")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Đăng Nhập" in response.text
    assert "pagefpt-google-config" not in response.text


@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/do-toc-do",
        "/khuyen-mai",
        "/chinh-sach-bao-mat",
        "/san-pham/internet-gia-dinh",
        "/san-pham/internet-doanh-nghiep",
        "/san-pham/fpt-play",
        "/san-pham/combo-fpt-play",
        "/san-pham/camera-fpt",
    ],
)
async def test_client_advanced_consent_has_transparent_notice(client, path):
    response = await client.get(path)
    assert response.status_code == 200
    assert '"dynamic": true' in response.text
    public = await client.get("/api/v1/measurement/config")
    assert public.status_code == 200 and public.json()["consent_mode"] == "advanced"
    assert response.text.count('id="pagefpt-google-config"') == 1
    assert "tín hiệu đo lường hạn chế" in response.text


@pytest.mark.asyncio
async def test_admin_dashboard_renders(admin):
    client = admin
    response = await client.get("/admin/dashboard")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Tổng Quan" in response.text or "Dashboard" in response.text


@pytest.mark.asyncio
async def test_admin_leads_renders(admin):
    client = admin
    response = await client.get("/admin/leads")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Danh Sách Đơn Tư Vấn" in response.text


@pytest.mark.asyncio
async def test_admin_lead_detail_renders(admin):
    client = admin
    response = await client.get("/admin/leads/detail?id=lead-001")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Hồ Sơ Khách Hàng" in response.text
    assert "detail-lead-status-badge" in response.text
    assert "Xem cơ sở đánh giá" in response.text
    assert '<dialog id="lead-intelligence-dialog"' in response.text


@pytest.mark.asyncio
async def test_admin_pricing_renders(admin):
    client = admin
    response = await client.get("/admin/pricing")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Gói cước" in response.text


@pytest.mark.asyncio
async def test_admin_reports_renders(admin):
    client = admin
    response = await client.get("/admin/reports")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Báo Cáo" in response.text


@pytest.mark.asyncio
async def test_static_assets_served(client):
    res_vars = await client.get("/static/css/variables.css")
    assert res_vars.status_code == 200
    assert "Be Vietnam Pro" in res_vars.text

    res_client = await client.get("/static/css/client.css")
    assert res_client.status_code == 200

    res_admin = await client.get("/static/css/admin.css")
    assert res_admin.status_code == 200

    res_api = await client.get("/static/js/client/api.js")
    assert res_api.status_code == 200

    res_regions = await client.get("/static/js/client/regions.js")
    assert res_regions.status_code == 200

    # New UI Libraries (Lenis, AOS, VanillaTilt, Confetti, ui_motion)
    res_lenis_js = await client.get("/static/js/vendor/lenis.min.js")
    assert res_lenis_js.status_code == 200
    assert len(res_lenis_js.text) > 1000

    res_lenis_css = await client.get("/static/css/vendor/lenis.css")
    assert res_lenis_css.status_code == 200

    res_aos_js = await client.get("/static/js/vendor/aos.js")
    assert res_aos_js.status_code == 200

    res_aos_css = await client.get("/static/css/vendor/aos.css")
    assert res_aos_css.status_code == 200

    res_tilt = await client.get("/static/js/vendor/vanilla-tilt.min.js")
    assert res_tilt.status_code == 200

    res_confetti = await client.get("/static/js/vendor/confetti.browser.min.js")
    assert res_confetti.status_code == 200

    res_motion = await client.get("/static/js/client/ui_motion.js")
    assert res_motion.status_code == 200
    assert "fireConfettiCelebration" in res_motion.text


@pytest.mark.asyncio
async def test_regions_hierarchy_api(client):
    response = await client.get("/api/v1/regions/hierarchy")
    assert response.status_code == 200
    data = response.json()
    # An empty published catalog must never fabricate the old 63-province fixture.
    assert data == {}


@pytest.mark.asyncio
async def test_home_page_cascading_and_fpt_sections(client):
    response = await client.get("/")
    assert response.status_code == 200
    text = response.text
    # 2 Combobox elements present
    assert 'id="home-zone-select"' in text
    assert 'id="home-province-select"' in text
    # Empty merchandising uses the neutral consultation hero.
    assert "public-consultation-hero" in text
    # Quick utilities present
    assert "quick-utilities-card" in text
    # Ecosystem grid present
    assert "ecosystem-section" in text
    # Mega Menu present
    assert "mega-menu" in text


@pytest.mark.asyncio
async def test_plans_3d_details_slider_tags_menu_and_footer(client, published_ui_plans):
    response = await client.get("/")
    assert response.status_code == 200
    text = response.text

    # 1. 3D Slider & Flip Cards
    assert 'id="plans-3d-stage"' in text
    assert 'id="plans-slider-track"' in text
    assert "plan-card-3d-wrapper" in text
    assert "card-face-front" in text
    assert 'id="plan-details-dialog"' in text
    assert "openPublishedPlanDetails" in text
    assert "slidePlansNext" in text
    assert "slidePlansPrev" in text

    # Published catalog identity replaces invented preview packages/superlatives.
    for plan in published_ui_plans:
        assert plan["payload"]["name"] in text
        assert f'data-plan-id="{plan["id"]}"' in text
    assert "Gói đang cung cấp" in text
    assert "badge-basic" in text
    assert "data-period-gift" in text
    assert "period-gift-badge" in text

    # 3. Corporate Multi-Column Footer Check
    assert "footer-columns-grid" in text
    assert "footer-col" in text
    assert "footer-office-details" in text
    assert "footer-disclaimer-card" not in text
    assert "footer-hotline" in text
    assert "compact-footer-grid" in text
    assert 'href="/chinh-sach-bao-mat"' in text
    assert 'href="https://fpt.vn/ho-tro" class="legal-sublink"' in text
    assert "Tuân Thủ NĐ" not in text

    # 4. CSS verify for navbar white-space nowrap & 3D rules
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    assert "white-space: nowrap" in css_res.text
    assert "preserve-3d" in css_res.text
    assert "backface-visibility: hidden" in css_res.text


@pytest.mark.asyncio
async def test_multitask_3card_zoom_in_and_light_sheen(client, published_ui_plans):
    response = await client.get("/")
    assert response.status_code == 200
    text = response.text

    # 1. 3-Card Multitask Mode and Center Zoom Elements
    assert "multitask-mode" in text
    assert "is-center" in text
    assert "card-light-streak" in text

    # 2. CSS Check for Zoom In scale and Light Sweep Animation
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    assert "scale(1.08)" in css_res.text
    assert "cardLightStreakSweep" in css_res.text
    assert "is-prev" in css_res.text
    assert "is-next" in css_res.text
    assert "is-hidden" in css_res.text

    # 3. JS Check for Multitask State Controller
    js_res = await client.get("/static/js/client/plans_3d.js")
    assert js_res.status_code == 200
    assert "renderMultitaskState" in js_res.text
    assert "currentMultitaskIndex" in js_res.text


@pytest.mark.asyncio
async def test_ui_motion_and_vendor_libraries_installed(client):
    response = await client.get("/")
    assert response.status_code == 200
    text = response.text

    # Vendor scripts and CSS referenced in client_base.html
    assert 'href="/static/css/vendor/lenis.css"' in text
    assert 'href="/static/css/vendor/aos.css"' in text
    assert 'src="/static/js/vendor/lenis.min.js"' in text
    assert 'src="/static/js/vendor/aos.js"' in text
    assert 'src="/static/js/vendor/vanilla-tilt.min.js"' in text
    assert 'src="/static/js/vendor/confetti.browser.min.js"' in text
    assert 'src="/static/js/client/ui_motion.js"' in text

    # AOS attributes present on key elements
    assert 'data-aos="fade-up"' in text
    assert 'data-aos="zoom-in"' in text


@pytest.mark.asyncio
async def test_card_border_radius_and_floating_corner_cta_desktop(client):
    response = await client.get("/")
    assert response.status_code == 200
    text = response.text

    # 1. HTML elements for Floating Action Corner
    assert 'class="sticky-bottom-bar"' in text
    assert 'class="btn-sticky-action btn-sticky-submit"' in text
    assert 'class="btn-sticky-action btn-sticky-zalo"' in text
    assert 'class="btn-sticky-action btn-sticky-call"' in text
    assert 'class="ripple-ring"' in text
    assert 'class="phone-wiggle"' in text
    assert 'class="live-dot"' in text
    assert 'class="sticky-tooltip"' in text

    # 2. CSS verification for Card tight border-radius and desktop floating corner
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    css = css_res.text

    # Card border-radius tight wrap
    assert "border-radius: var(--radius-xl)" in css
    assert "border: 2.5px solid var(--color-primary)" in css
    assert "overflow: visible" in css

    # Desktop Floating Corner Rules & Animations
    assert "pulseRippleRing" in css
    assert "phoneWiggleAnim" in css
    assert "floatGentle" in css
    assert "liveDotPulse" in css
    assert "flex-direction: column-reverse" in css
    assert "sticky-tooltip" in css


@pytest.mark.asyncio
async def test_promotions_section_perks_policies_and_illustrations(client):
    response = await client.get("/")
    assert response.status_code == 200
    text = response.text

    # 1. 4 Perks with rounded boxes and badges
    assert "promo-item promo-item-gift" in text
    assert "promo-item promo-item-wifi" in text
    assert "promo-item promo-item-speed" in text
    assert "promo-item promo-item-play" in text

    # 2. Dedicated SVG illustration wrappers
    assert "promo-illus promo-illus-gift" in text
    assert "promo-illus promo-illus-wifi" in text
    assert "promo-illus promo-illus-speed" in text
    assert "promo-illus promo-illus-play" in text

    # 3. Policy & Commitment bar
    assert "promo-policies-container" in text
    assert "CHÍNH SÁCH CAM KẾT DỊCH VỤ TỪ FPT TELECOM" in text
    assert "promo-policy-card" in text
    assert "Bảo hành thiết bị trọn đời" in text
    assert "Hỗ trợ kỹ thuật trong 2h" in text

    # 4. Buttons (Fix white-on-white hotline button)
    assert "btn-promo-primary" in text
    assert "btn-promo-hotline" in text

    # 5. CSS check for clear rounded corners
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    css = css_res.text
    assert "border-radius: 18px" in css  # promo-item
    assert "border-radius: 14px" in css  # promo-illus
    assert "border-radius: 16px" in css  # promo-policies-container
    assert "btn-promo-hotline" in css


@pytest.mark.asyncio
async def test_admin_settings_renders_and_upgraded_ui_ux(admin):
    client = admin
    # 1. Check settings page
    response = await client.get("/admin/settings")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    text = response.text
    assert "Cài đặt &amp; Trạng thái" in text
    assert "SLA gọi lại (phút)" in text
    assert "Kết nối dịch vụ" in text

    # 2. Check admin fast actions & user-friendly terms
    leads_res = await client.get("/admin/leads")
    assert leads_res.status_code == 200
    leads_text = leads_res.text
    assert "btn-action-call" in leads_text
    assert "btn-action-zalo" in leads_text
    assert "Danh Sách Đơn Tư Vấn" in leads_text

    # 3. Check admin css rounded corners & fast action classes
    css_res = await client.get("/static/css/admin.css")
    assert css_res.status_code == 200
    admin_css = css_res.text
    assert "border-radius: 16px" in admin_css
    assert ".btn-action-call" in admin_css
    assert ".btn-action-zalo" in admin_css
    assert ".quick-note-pill" in admin_css


@pytest.mark.asyncio
async def test_admin_login_otp_and_forgot_password(client):
    response = await client.get("/admin/login")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    text = response.text

    # 1. Professional brand header with animated FPT letters
    assert "login-container" in text
    assert "fpt-letters-group" in text
    assert "fpt-badge-f" in text
    assert "fpt-badge-p" in text
    assert "fpt-badge-t" in text

    # 2. Tabs for Login, OTP Verification, and Forgot Password
    assert "tab-login-btn" in text
    assert "tab-otp-btn" in text
    assert "tab-forgot-btn" in text

    # 3. Form 1: Password login
    assert "form-password-login" in text
    assert "login-email" in text
    assert "login-password" in text
    assert "btn-submit-login" in text

    # 4. Form 2: OTP 6-digit verification
    assert "form-otp-verify" in text
    assert "otp-inputs-grid" in text
    assert "otp-digit-input" in text
    assert 'id="otp-1"' in text
    assert 'id="otp-6"' in text
    assert "countdown-timer-box" in text
    assert "btn-resend-code" in text

    # 5. Form 3: Forgot password with 3 sequential steps
    assert "form-forgot-password" in text
    assert "forgot-step-1" in text
    assert "forgot-step-2" in text
    assert "forgot-step-3" in text
    assert "forgot-account" in text
    assert "forgot-otp-code" in text
    assert "new-password" in text
    assert "confirm-new-password" in text


@pytest.mark.asyncio
async def test_admin_login_sequential_forgot_password_flow(client):
    response = await client.get("/admin/login")
    assert response.status_code == 200
    text = response.text

    # 1. Login form initial presence & forgot password trigger link
    assert 'id="form-password-login"' in text
    assert "Quên mật khẩu?" in text
    assert "switchLoginMode('forgot')" in text

    # 2. Step 1: Input email / phone
    assert 'id="forgot-step-1"' in text
    assert 'id="forgot-account"' in text
    assert 'id="btn-forgot-step1-submit"' in text
    assert "handleForgotStep1(event)" in text

    # 3. Step 2: Input OTP
    assert 'id="forgot-step-2"' in text
    assert 'id="forgot-otp-code"' in text
    assert 'id="btn-forgot-step2-submit"' in text
    assert "handleForgotStep2(event)" in text
    assert "startForgotOtpCountdown" in text

    # 4. Step 3: Reset password
    assert 'id="forgot-step-3"' in text
    assert 'id="new-password"' in text
    assert 'id="confirm-new-password"' in text
    assert 'id="btn-forgot-step3-submit"' in text
    assert "handleForgotStep3(event)" in text

    # 5. Enter key listeners and step switching functions
    assert "goToForgotStep" in text
    assert "currentForgotAccount" in text
    assert "handleForgotStep1" in text
    assert "handleForgotStep2" in text
    assert "handleForgotStep3" in text
    assert "switchLoginMode('login')" in text


@pytest.mark.asyncio
async def test_client_home_fpt_animation_and_runline_admin_controlled(client):
    response = await client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    text = response.text

    # Official artwork replaces the reconstructed letter badges.
    assert "fpt-animated-badge" in text
    assert 'src="/static/images/fpt-telecom-logo.svg"' in text
    assert 'alt="FPT Telecom"' in text
    assert "fpt-letter fpt-letter-f" not in text
    logo = await client.get("/static/images/fpt-telecom-logo.svg")
    assert logo.status_code == 200 and "image/svg+xml" in logo.headers["content-type"]

    # 2. Promo Runline Marquee Ticker with Dynamic Date
    assert "promo-runline-wrapper" in text
    assert 'id="promo-runline-bar"' in text
    assert "runline-badge" in text
    assert 'id="runline-today-date"' in text
    assert 'id="runline-marquee-text"' in text
    assert 'id="btn-runline-pause"' in text

    # 3. Security & Governance: End-user/visitor MUST NOT have interface customizer controls
    assert "btn-motion-config" not in text
    assert 'id="motion-customizer-modal"' not in text

    # 4. Verify CSS contains animation keyframes
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    css = css_res.text
    assert ".fpt-animated-badge" in css
    assert "fptLetterWave" in css
    assert "fptLetterBounce" in css
    assert "fptLetterGlow" in css
    assert ".promo-runline-wrapper" in css
    assert "marqueeLoop" in css

    # 5. Verify JS motion orchestrator fetches and applies Admin display settings
    js_res = await client.get("/static/js/client/ui_motion.js")
    assert js_res.status_code == 200
    js = js_res.text
    assert "initRunlineDate" in js
    assert "toggleRunlinePlayPause" in js
    assert "loadAndApplyAdminDisplaySettings" in js
    assert "applySystemDisplaySettings" in js


@pytest.mark.asyncio
async def test_admin_display_settings_governance_and_persistence(admin):
    client = admin
    # 1. Admin Settings Page renders display controls
    admin_res = await client.get("/admin/appearance")
    assert admin_res.status_code == 200
    admin_text = admin_res.text
    assert "Hiển thị website" in admin_text
    assert 'id="setting-fpt-anim"' in admin_text
    assert 'id="setting-fpt-anim-style"' in admin_text
    assert 'id="setting-runline-enabled"' in admin_text
    assert 'id="setting-runline-speed"' in admin_text
    assert 'id="setting-runline-text"' in admin_text
    assert 'id="setting-lenis-scroll"' in admin_text
    assert 'id="setting-tilt-parallax"' in admin_text
    assert 'id="btn-save-display-settings"' in admin_text
    assert "banner-zone-toggle" in admin_text

    # 2. GET display settings endpoint
    get_res = await client.get("/api/v1/system/display-settings")
    assert get_res.status_code == 200
    settings = get_res.json()
    assert "fpt_anim" in settings
    assert "runline_enabled" in settings
    assert "banner_zones" in settings
    assert "hero_slider" in settings["banner_zones"]

    # 3. POST display settings by Admin (e.g. toggle hero slider off and change text)
    update_payload = {
        "expected_version": settings["version"],
        "fpt_anim": True,
        "fpt_anim_style": "bounce",
        "runline_enabled": True,
        "runline_speed": "fast",
        "runline_text": "⚡ Ưu đãi độc quyền Quản trị viên FPT Telecom • 🎁 Tặng 3 tháng cước",
        "banner_zones": {"hero_slider": False, "showcase_posters": True},
    }
    post_res = await client.post("/api/v1/system/display-settings", json=update_payload)
    assert post_res.status_code == 200
    post_json = post_res.json()
    assert post_json["success"] is True
    assert post_json["settings"]["fpt_anim_style"] == "bounce"
    assert post_json["settings"]["banner_zones"]["hero_slider"] is False

    # 4. Verify client home reflects Admin-configured changes
    client_res = await client.get("/")
    assert client_res.status_code == 200
    client_text = client_res.text
    # Hero slider is disabled by Admin, so hero carousel is not rendered
    assert "hero-carousel-section" not in client_text
    # Custom runline text set by Admin is present
    assert "Ưu đãi độc quyền Quản trị viên FPT Telecom" in client_text
    # FPT badge has the updated animation style class
    assert "fpt-anim-bounce" in client_text

    # 5. Restore settings to default for other tests
    restore_payload = {
        "expected_version": post_json["settings"]["version"],
        "fpt_anim": True,
        "fpt_anim_style": "wave",
        "runline_enabled": True,
        "runline_speed": "normal",
        "runline_text": "⚡ Khuyến mãi ngày hôm nay: Miễn phí 100% Modem Wi-Fi 6 AX3000 khi đăng ký lắp mới! • 🎁 Tặng thêm 1 đến 2 tháng cước khi thanh toán trước 6T hoặc 12T. • 🚀 Gói Sky 1 Gbps giá chỉ từ 225.000đ/tháng - Bán chạy nhất cho gia đình. • 📺 Combo Internet + FPT Play 4K chỉ từ 265.000đ/tháng - Độc quyền trọn vẹn Cúp C1 UEFA. • 📞 Lắp đặt siêu tốc 12 - 24 giờ. Hotline hỗ trợ 24/7: 1900 6600",
        "banner_zones": {
            "hero_slider": True,
            "showcase_posters": True,
            "ribbon_banner": True,
            "promo_grid": True,
            "app_banner": True,
            "floating_promo": True,
        },
    }
    await client.post("/api/v1/system/display-settings", json=restore_payload)


@pytest.mark.asyncio
async def test_banner_and_poster_zones_arrangement(admin):
    client = admin
    home_res = await client.get("/")
    assert home_res.status_code == 200
    home_text = home_res.text

    # No invented promotional slides without Admin configuration.
    assert "public-consultation-hero" in home_text
    assert "hero-carousel-section" not in home_text

    # 2. Zone 2: Dual Showcase Posters (Wi-Fi 6 & FPT Play Sports C1)
    assert "showcase-banners-section" in home_text
    assert "showcase-poster-card poster-sports" in home_text
    assert "Đại Tiệc Thể Thao Đỉnh Cao" in home_text
    assert "Cúp C1 UEFA" in home_text
    assert "Ngoại Hạng Anh" in home_text
    assert "showcase-poster-card poster-wifi" in home_text
    assert "Modem Wi-Fi 6 Chuẩn AX" in home_text
    assert "Bứt Phá Mọi Giới Hạn Tốc Độ" in home_text

    # 3. Zone 3: Mid-page Ribbon Flash Deal Banner
    assert "ribbon-banner-section" in home_text
    assert "ribbon-banner-card" in home_text
    assert "FLASH SALE HÔM NAY" in home_text
    assert 'id="ribbon-countdown"' in home_text
    assert 'id="flash-hours"' in home_text
    assert 'id="flash-minutes"' in home_text
    assert 'id="flash-seconds"' in home_text
    assert "btn-ribbon-cta" in home_text
    assert "ribbon-hotline-btn" in home_text

    # 4. Zone 4: Featured Promo Cards Grid (4 Benefits & Commitment Policies)
    assert "promotions-section" in home_text
    assert "promo-item-gift" in home_text
    assert "promo-item-wifi" in home_text
    assert "promo-item-speed" in home_text
    assert "promo-item-play" in home_text
    assert "CHÍNH SÁCH CAM KẾT DỊCH VỤ TỪ FPT TELECOM" in home_text

    # 5. Zone 5: Hi FPT App Banner & National Transaction Offices
    assert "app-banner-section" in home_text
    assert "app-banner-card" in home_text
    assert "Hi FPT" in home_text
    assert "Đổi Mật Khẩu Wi-Fi 1 Chạm" in home_text
    assert "phone-mockup-frame" in home_text
    assert "btn-store-badge" in home_text

    # 6. Zone 6: Floating Corner Promo Widget
    assert "floating-promo-widget" in home_text
    assert "btn-floating-toggle" in home_text
    assert "floating-promo-card" in home_text
    assert "btn-floating-cta" in home_text

    # 7. Check Admin Settings Banner Map Table
    settings_res = await client.get("/admin/appearance")
    assert settings_res.status_code == 200
    settings_text = settings_res.text
    for zone in [
        "hero_slider",
        "showcase_posters",
        "ribbon_banner",
        "promo_grid",
        "app_banner",
        "floating_promo",
    ]:
        assert f'data-zone="{zone}"' in settings_text
    assert "showToast('Cấu hình" not in settings_text


@pytest.mark.asyncio
async def test_mobile_layout_and_sales_focus(client, published_ui_plans):
    """
    Verify mobile layout balance, product display focus, and sales conversion architecture:
    1. Static CSS serves @media (max-width: 768px) mobile responsive rules.
    2. Multitask 3D product cards are sized for mobile hero focus (min(315px, 86vw)).
    3. Plan card actions use 2-row grid: primary CTA full width (grid-column: 1 / -1), secondary utilities side-by-side.
    4. Perks and ecosystem sections use symmetrical 2x2 mobile grids.
    5. Hero carousel and showcase posters are compact on mobile to keep products visible above fold.
    6. Sticky bottom bar adheres to safe-area-inset-bottom with thumb-friendly conversion buttons.
    """
    # 1. Fetch client.css and check mobile rules
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    css_text = css_res.text

    # Media query presence
    assert "@media (max-width: 768px)" in css_text

    # Product cards mobile focus & 3D stage balance (1 card layout, uniform compact size)
    assert ".plans-3d-stage.multitask-mode .plan-card-3d-wrapper.is-center" in css_text
    assert "min(335px, 92vw)" in css_text
    assert ".plans-3d-stage.multitask-mode .plan-card-3d-wrapper.is-prev" in css_text

    # Plan card action grid (primary CTA full-width, secondary side-by-side)
    assert ".plan-card-actions .btn-select-plan" in css_text
    assert "grid-column: 1 / -1" in css_text
    assert "grid-template-columns: 1fr 1fr" in css_text

    # 2x2 grids for perks and ecosystem on mobile
    assert ".promo-grid" in css_text
    assert "grid-template-columns: repeat(2, 1fr)" in css_text
    assert ".ecosystem-grid" in css_text

    # Compact sales banners (Ribbon & Showcase)
    assert ".showcase-poster-card" in css_text
    assert ".showcase-banners-grid" in css_text
    assert "grid-template-columns: repeat(2, minmax(0, 1fr))" in css_text
    assert ".poster-mobile-deal-box" in css_text
    assert ".mobile-deal-perks" in css_text
    assert ".ribbon-banner-card" in css_text
    assert ".ribbon-action-col" in css_text

    # Quick utilities balanced grid (Item 5 spans full width)
    assert ".quick-utilities-grid .utility-item:last-child" in css_text

    # Sticky bottom bar thumb navigation
    assert ".sticky-bottom-bar" in css_text
    assert "safe-area-inset-bottom" in css_text
    assert ".btn-sticky-call" in css_text
    assert ".btn-sticky-submit" in css_text

    # 2. Check Home page mobile compatibility
    home_res = await client.get("/")
    assert home_res.status_code == 200
    home_html = home_res.text
    # Meta viewport ensures proper mobile scaling
    assert '<meta name="viewport" content="width=device-width, initial-scale=1.0' in home_html
    # Critical sales elements present
    assert "plans-3d-stage" in home_html
    assert "btn-select-plan" in home_html
    assert "sticky-bottom-bar" in home_html
    assert "ribbon-banner-card" in home_html
    assert "poster-mobile-deal-box" in home_html
    assert "btn-text-mobile" in home_html
    assert "plans-slider-dots-wrap" in home_html
    assert "flip-text-mobile" in home_html


@pytest.mark.asyncio
async def test_desktop_css_layout_and_styles(client, published_ui_plans):
    """
    Verify Desktop CSS architecture, syntax validity, and component layout:
    1. Zero unclosed curly braces in client.css (proper parsing on all desktop browsers).
    2. Desktop dual showcase posters 2-column grid and styling.
    3. Desktop quick utilities 5-column grid.
    4. Desktop product cards 3D multitask zoom-in, light sheen sweep, and perspective transforms.
    5. Mobile-specific elements hidden on desktop viewports.
    6. Sticky CTA bar floats in corner on desktop.
    """
    css_res = await client.get("/static/css/client.css")
    assert css_res.status_code == 200
    css_text = css_res.text

    # 1. Syntax integrity: balanced braces
    import re

    no_comments = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), css_text, flags=re.DOTALL)
    stack = []
    for line_no, line in enumerate(no_comments.split("\n"), 1):
        for col, ch in enumerate(line, 1):
            if ch == "{":
                stack.append((line_no, col, line.strip()))
            elif ch == "}":
                assert stack, f"Extra closing brace at {line_no}:{col}"
                stack.pop()
    assert len(stack) == 0, f"Unclosed braces in client.css: {stack}"

    # 2. Desktop dual showcase posters rules active at root / desktop
    assert ".showcase-banners-grid" in css_text
    assert "grid-template-columns: repeat(2, 1fr);" in css_text
    assert ".poster-sports" in css_text
    assert ".poster-wifi" in css_text

    # 3. Desktop quick utilities
    assert "grid-template-columns: repeat(5, 1fr);" in css_text

    # 4. Desktop 3D cards multitask rules
    assert ".plans-3d-stage.multitask-mode .plan-card-3d-wrapper.is-center" in css_text
    assert "transform: scale(1.08) translateZ(40px);" in css_text
    assert ".plans-3d-stage.multitask-mode .plan-card-3d-wrapper.is-prev" in css_text
    assert ".plans-3d-stage.multitask-mode .plan-card-3d-wrapper.is-next" in css_text

    # 5. Mobile hide rules for desktop
    assert ".flip-text-mobile" in css_text
    assert ".compare-text-mobile" in css_text
    assert ".badge-text-mobile" in css_text
    assert ".title-mobile" in css_text

    # 6. Sticky CTA bar converted to floating corner widget on desktop
    assert "@media (min-width: 768px)" in css_text
    assert ".btn-sticky-call" in css_text
    assert "width: 58px;" in css_text

    # 7. Desktop elements in rendered HTML
    home_res = await client.get("/")
    assert home_res.status_code == 200
    home_html = home_res.text
    assert "flip-text-desktop" in home_html
    assert "compare-text-desktop" in home_html


@pytest.mark.asyncio
async def test_unconfigured_admin_login_never_uses_preview_credentials(client):
    page = await client.get("/admin/login")
    assert page.status_code == 200
    assert "Admin@123456" not in page.text
    assert "dev-account-pill" not in page.text
    response = await client.post(
        "/api/v1/auth/session",
        json={"email": "admin@fpt.vn", "password": "Admin@123456"},
        headers={"Origin": "http://test"},
    )
    assert response.status_code == 503
    assert "pagefpt_admin_session" not in response.cookies


@pytest.mark.asyncio
async def test_admin_crm_and_dynamic_pages_structure(admin):
    client = admin
    """
    Verify complete frontend-backend dynamic hydration scaffolding across admin interfaces:
    - CRM Leads table & cursor pagination containers
    - CRM Lead Detail dynamic containers (status badge, phone reveal, appointments, timeline)
    - Pricing management modal, table, CSV import
    - Reports funnel and daily metrics table
    - Dashboard live KPI & recent leads containers
    """
    # 1. CRM Leads List
    leads_res = await client.get("/admin/leads")
    assert leads_res.status_code == 200
    leads_html = leads_res.text
    assert 'id="crm-table-tbody"' in leads_html
    assert 'id="crm-pagination-box"' in leads_html
    assert 'id="btn-load-more"' in leads_html
    assert 'id="filter-status"' in leads_html
    assert 'id="crm-kanban-view"' in leads_html
    assert "triggerLeadExport" in leads_html

    # 2. CRM Lead Detail
    detail_res = await client.get("/admin/leads/detail")
    assert detail_res.status_code == 200
    detail_html = detail_res.text
    assert 'id="detail-customer-title"' in detail_html
    assert 'id="detail-phone-val"' in detail_html
    assert 'id="detail-lead-status-badge"' in detail_html
    assert 'id="btn-reveal-pii"' in detail_html
    assert 'id="appointments-list-container"' in detail_html
    assert 'id="activity-timeline-list"' in detail_html
    assert 'id="lead-status-select"' in detail_html
    assert 'id="btn-assign"' in detail_html

    # 3. Pricing Management
    pricing_res = await client.get("/admin/pricing")
    assert pricing_res.status_code == 200
    pricing_html = pricing_res.text
    assert 'id="prices-tbody"' in pricing_html
    assert 'id="create-price-backdrop"' in pricing_html
    assert 'id="csv-modal-backdrop"' in pricing_html
    assert 'id="btn-csv-preview"' in pricing_html
    assert 'id="btn-csv-apply"' in pricing_html

    # 4. Reports & Funnel Analytics
    reports_res = await client.get("/admin/reports")
    assert reports_res.status_code == 200
    reports_html = reports_res.text
    assert 'id="analytics-kpis"' in reports_html
    assert 'id="analytics-trend"' in reports_html
    assert 'id="analytics-funnel"' in reports_html
    assert 'id="analytics-filter"' in reports_html
    assert "/static/js/admin/analytics.js" in reports_html

    # 5. Dashboard
    dash_res = await client.get("/admin/dashboard")
    assert dash_res.status_code == 200
    dash_html = dash_res.text
    assert 'id="analytics-kpis"' in dash_html
    assert 'id="analytics-funnel"' in dash_html
    assert 'id="recent-leads-list"' in dash_html


@pytest.mark.asyncio
async def test_no_fake_fixtures_in_rendered_ui(admin):
    client = admin
    """
    Ensure all hardcoded mock fixtures, dummy customer names, dummy phones,
    and fake receipt numbers are completely eliminated from all rendered web pages.
    """
    pages_to_verify = [
        "/",
        "/khuyen-mai",
        "/san-pham/internet-gia-dinh",
        "/admin/login",
        "/admin/dashboard",
        "/admin/leads",
        "/admin/leads/detail",
        "/admin/pricing",
        "/admin/reports",
        "/admin/settings",
    ]

    forbidden_fake_fixtures = [
        "Nguyễn Hoàng",
        "Trần Thị Mai",
        "0987.654.321",
        "0987654321",
        "FPT-998812",
        "lead-001",
    ]

    for path in pages_to_verify:
        res = await client.get(path)
        assert res.status_code == 200, f"Page {path} failed to render with {res.status_code}"
        text = res.text
        for fixture in forbidden_fake_fixtures:
            assert fixture not in text, f"Found fake fixture '{fixture}' in rendered page '{path}'"


@pytest.mark.asyncio
async def test_favicon_endpoints_and_markup(client, admin):
    fav = await client.get("/favicon.ico")
    assert fav.status_code == 200
    assert "image/x-icon" in fav.headers["content-type"]
    assert len(fav.content) > 0

    touch = await client.get("/apple-touch-icon.png")
    assert touch.status_code == 200
    assert "image/png" in touch.headers["content-type"]

    manifest = await client.get("/site.webmanifest")
    assert manifest.status_code == 200
    assert "application/manifest+json" in manifest.headers["content-type"]
    assert "PageFPT" in manifest.json()["name"]

    svg = await client.get("/static/images/favicon.svg")
    assert svg.status_code == 200
    fav32 = await client.get("/static/images/favicon-32x32.png")
    assert fav32.status_code == 200
    fav16 = await client.get("/static/images/favicon-16x16.png")
    assert fav16.status_code == 200

    client_pages = ["/", "/san-pham/internet-gia-dinh", "/do-toc-do", "/chinh-sach-bao-mat", "/khuyen-mai"]
    for path in client_pages:
        res = await client.get(path)
        assert res.status_code == 200
        assert 'href="/favicon.ico"' in res.text
        assert 'href="/static/images/favicon-32x32.png"' in res.text
        assert 'href="/static/images/apple-touch-icon.png"' in res.text

    login_res = await client.get("/admin/login")
    assert login_res.status_code == 200
    assert 'href="/favicon.ico"' in login_res.text
    assert "fpt-brand-logo.png" in login_res.text

    admin_dash = await admin.get("/admin/dashboard")
    assert admin_dash.status_code == 200
    assert 'href="/favicon.ico"' in admin_dash.text
