# Admin quality implementation

Goal: hoàn thiện các tiêu chí Admin bằng luồng API thực, giữ kiến trúc và quyền hiện có.
Architecture: Python/FastAPI + Jinja2 + JS nhẹ; PostgreSQL RPC qua Supabase, R2 cho media/export.
Spec: docs/superpowers/specs/2026-10-02-admin-quality.md

- [x] Task 1: RED tests cho Admin auth, settings CAS/SLA, DTO/filter/cursor, daily parity; migration/RPC/API triển khai và GREEN.
- [x] Task 2: RED JS regressions Kanban/polling/score/Vietnam date; sửa CRM/detail/layout/settings/report và mobile.
- [x] Task 3: thêm workspace marketing/content/operations, typed forms, queue/export/audit/staff/media có quyền; browser và API verification.
- [x] Task 4 local: kiểm thử toàn bộ, contracts/wheel; đã sửa Important được reviewer xác nhận; tài liệu kết quả và khởi động app.
- [ ] Final independent verdict: reviewer đã dừng do usage limit, chưa có kết luận đầy đủ; giới hạn ghi trong ledger/báo cáo.
- [ ] Hosted production acceptance: Auth/R2/Vercel/worker/vendor và pilot vận hành thật; chưa có môi trường/tài khoản để xác minh.

Review focus: quyền theo branch, không lộ PII/secrets, CAS stale, cursor filter binding, polling race, API unconfigured và không fake success. Định nghĩa cohort/chi phí không tạo chỉ số gây hiểu nhầm.
