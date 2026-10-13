# Regional Vouchers Implementation Plan

> **For agentic workers:** Use executing-plans to implement directly in this session. The user has accepted the design and explicitly requested full implementation.

**Goal:** Voucher theo khu vực, chia sẻ link, áp dụng báo giá và xử lý CRM nguyên tử.
**Architecture:** FastAPI/Pydantic đánh giá giá/điều kiện; PostgreSQL RPC lưu snapshot và khoá hạn mức/tồn kho; Jinja2 và JS dùng UI hiện tại.
**Tech Stack:** Python/FastAPI/Jinja2, PostgreSQL/Supabase, HTML/CSS/JS.
**Spec:** docs/superpowers/specs/2026-10-13-regional-vouchers.md

## Global Constraints
- Không đổi stack; không triển khai production hay push trong yêu cầu tạo dựng này.
- Địa bàn xác nhận quyết định eligibility, không dùng IP.
- dd/mm/yyyy; tiền nguyên VND, round half up.
- Không mất lead khi voucher không hợp lệ; không gửi PII vào analytics.

## Review Focus
- Hai nhân viên giữ suất cuối đồng thời: chỉ một thành công.
- Khách cùng số gửi nhiều form: hạn mức contact dùng chung.
- Profile sửa sau khi giữ: chặn và yêu cầu hủy suất trước.
- Link preview/GET và quote không làm tiêu hao hạn mức.
- Bản nháp thay đổi không tác động live; suất giữ dùng snapshot cũ.

### Task 1: Engine, schema và báo giá
Files: modules/vouchers/{schemas,engine,service,routes}.py; pricing/schemas.py; catalog/routes.py; tests/unit/test_voucher_engine.py; tests/integration/test_vouchers.py.
Interfaces: apply_voucher(quote,campaign,path,plan,at) -> dict; resolve(request,code,link) -> campaign.
- [x] Write tests for scope precedence/exclusion, capped integer discounts, term/stacking, dates.
- [x] Run unit test (RED); implement models/engine; run (GREEN).
- [x] API create/draft/publish/quote test RED; add router and RPC; run GREEN.

### Task 2: Ledger, intake, sharing và CRM
Files: CLI-created migration regional_vouchers.sql; leads/{schemas,service}.py; vouchers routes/service; tests/integration/test_vouchers.py.
Interfaces: voucher_save/publish/link_save/resolve/lead_read/reserve/redeem/release/report via existing dispatch; submit_lead wrapper atomic.
- [x] Tests RED: 302 target validation, no GET consumption, atomic lead intent, assignment, address required, concurrent quota/budget/inventory/contact limits, retries, expiry, profile invalidation.
- [x] Implement RPC private tables, indexes/RLS/grants, locks, snapshots, audit and endpoints.
- [x] Run integration tests GREEN; check SQL privileges.

### Task 3: Admin, client và tài liệu
Files: templates/admin/vouchers.html; static/js/admin/vouchers.js; static/css/vouchers.css; shared menu/base; CRM voucher panel; static/js/client/vouchers.js; quote clients context.
Interfaces: PageFPTVoucher.quoteContext()/leadContext(), server cookie fallback; explicit clear.
- [x] Browser tests RED: admin CRUD/live snapshot, link, client benefit/quote/lead, CRM action, 320–1440px overflow + keyboard.
- [x] Build structured editor with geography API, cards and funnel reports, mobile voucher banner; CRM controls.
- [x] Run browser GREEN, full pytest/JS, ruff/mypy/architecture, OpenAPI exports and wheel.
- [x] Final independent review and fixes with regression tests; document setup and evidence.

## Execution ledger
- Design authorized; keep existing checkout to preserve local integration context. No external publish in this task.
- UI UX search suggested unrelated serif typography; retain established PageFPT font/colors and apply spacing, focus, readable forms instead.

- Completed locally: 446 Python tests, 26 JS contracts, voucher workflow and 9 layouts, card regression (12 views), landing studio (15 cases), home mobile and admin sort. Ruff/mypy/architecture and wheel checks passed.
- Independent review found no remaining blocker after fixes; detailed evidence: docs/qa/2026-10-13/vouchers.md.
- Corrected quota/catalog expiry races, quote edit guards, immutable attribution, accessory discount bounds, context cookie precedence, CRM reload and visible totals, managed list checkbox loss, and cramped landing preset selector.
- Production migration, Git push and deploy remain outside this local implementation; operator guide: docs/admin/VOUCHER-KHU-VUC.md.
