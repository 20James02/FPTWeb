# Geography API Implementation Plan
> **For agentic workers:** Use executing-plans inline and one final independent reviewer.
**Goal:** Admin nhập danh sách tỉnh/thành và xã/phường qua API, client lựa chọn từ danh mục đã lưu.
**Architecture:** Adapter async kiểm tra snapshot; RPC atomic import; UI checkbox và dữ liệu DB hiện hành.
**Tech Stack:** Python 3.12, FastAPI, HTTPX, PostgreSQL, Jinja2/JS.
**Spec:** docs/superpowers/specs/2026-10-02-geography-api.md
## Constraints
Giữ stack, quyền chi nhánh/MFA, snapshot dự phòng có ngày, không tạo giá, không xóa dữ liệu cũ.
## Review Focus
Nguồn lỗi/timeout; mã trùng/cha sai; resync dữ liệu sửa tay/ngừng; xung đột chi nhánh/UUID rollback; đóng gói snapshot và mobile.
## Tasks
- [x] Viết và chạy test đỏ adapter + sync quyền/idempotence trên PostgreSQL thật.
- [x] Adapter catalog/geography.py và snapshot JSON; routes riêng, lifecycle client; migration 11 import atomic + provenance.
- [x] Admin dialog/JS đồng bộ checkbox; client chọn toàn bộ tỉnh và ward lazy; test browser mobile.
- [x] Test hồi quy, lint/type/build/contract; review độc lập; tài liệu và mở lại local demo có danh mục thực.
