# Landing Campaign Implementation Plan

> **For agentic workers:** Use executing-plans inline to implement task-by-task.

**Goal:** Đồng bộ thẻ gói, nâng cấp mobile và quản lý landing chiến dịch có giá riêng, liên hệ, footer.
**Architecture:** Extend existing typed CMS JSON, shared Jinja cards, authoritative quote engine; minimal aggregate analytics RPC.
**Tech Stack:** Python/FastAPI/Pydantic/Postgres/Jinja2/plain JS/CSS.
**Spec:** docs/superpowers/specs/2026-10-09-landing-campaign-design.md

## Global constraints
- Secrets server only; no fake price, stock, online users or reviews.
- Monthly price per period; fee/VAT/accessories remain explicit.
- Publish/MFA/version controls remain in place; no production sample data.

## Review focus
- Expired or unpublished campaign must not supply a discount.
- Client cannot inject monetary data; quotes preserve campaign version and expiry.
- Empty/long/24-plan lists, 320px screens and no image retain usable layout.
- Contact/footer links reject javascript/credentials and mixed content.
- Consent declined, hidden tab and analytics unavailable show no fake counter.

## Task 1: Server models and campaign pricing
- [x] Write RED tests for independent landing monthly price and invalid configuration.
- [x] Add CampaignPrice, campaign/contact/footer settings with validation.
- [x] Add authoritative landing quote context; reuse calculate_quote and snapshot.
- [x] GREEN tests for period/VAT/accessories/time/selection boundaries.

## Task 2: Shared cards and sale landing
- [x] Use shared homepage card with landing-only labels and period defaults.
- [x] Responsive carousel/grid, contact dialog/footer, campaign countdown/status/terms.
- [x] Check browser sizes and coherent equal card dimensions.

## Task 3: Simple Admin editor and measured activity
- [x] Fast setup steps, presets, progressive advanced settings, period price overrides/contact/footer CRUD.
- [x] Aggregate opt-in sessions only; guarded public count, hidden when unavailable.
- [x] Test CRUD/preview/publication and async races.

## Task 4: Verify/review/deploy
- [x] Run affected integration/JS/browser suites; review major change.
- [x] Update frontend contract, operator guide and professional CRO assessment.
- [x] Safe Vercel candidate inventory/build/smoke.
- [x] Promote verified candidate and verify live.
