# Execution ledger — docs/superpowers/plans/2026-09-30-backend-implementation.md

User authorized full implementation and autonomous continuation.
Ruling: workspace has a read-only placeholder .git, not a Git repository; execute in current authorized workspace, preserve files, no commits/worktree tooling possible. Cost: task snapshots/tests provide record without Git commit history.
Ruling: no Supabase/R2/ads credentials in context. Implement production ports and SQL plus real local PostgreSQL integration; external live verification remains explicit rollout requirement. Never replace production persistence with RAM. Cost: provider integration must be verified on target accounts before go-live.
Pre-flight: Task3 QuoteProposal -> Task4 intake command matches snapshot/revision guard; Task4 queue IDs -> Task6 JobEnvelope matches; Task6 fencing/evidence version -> Task7 commit CAS; Task2 Actor scopes -> all admin routers. Task8 version cursor -> Task12 reporting correction. No semantic interface conflicts found.
Tasks 1–13: pending.
Task 1: foundation API tests RED→GREEN 3/3; dependency lock installed. DB harness initialized with PostgreSQL16.2 and upstream pgmq SQL.
Ruling: portable test PostgreSQL lacks btree_gist. Use price publish serialization on singleton catalog revision plus overlap guard trigger consistently in local/production, preserving no-overlap invariant. Cost: publishing prices serializes briefly; read/intake traffic unaffected.
Tasks 2–4: identity/catalog/intake initial integration RED→GREEN; 50 same-key concurrent submissions -> one lead + one queued job; different-address lead retained, phone encrypted. Full suite 24 passed after Tasks6–8 initial handlers.
Tasks 5–8: core buckets, queue leasing/fencing, pure scores, SLA calculator, CRM state/version checks implemented; hardening and broader acceptance cases remain pending.
Ruling: ancillary versioned content/campaign/care records share private.resources with explicit kind allowlist and per-kind typed Python commands; core leads/prices/jobs/events remain normalized tables. Cost: reporting must access documented payload paths for ancillary resources; avoids dozens of near-identical CRUD tables, preserves DB scope authorization.

## 01/10/2026 — tiếp tục theo yêu cầu cấu trúc dự án lớn

Các dòng “pending” ở trên là lịch sử khởi tạo, không phải trạng thái hiện tại. Baseline khôi phục sau khi `/tmp` bị xóa: **75 tests passed (7.88s)**. Harness tự khởi tạo PostgreSQL bằng `pgserver`, tạo database riêng mỗi suite và chạy RPC dưới `service_role`.

Đã triển khai các miền trong Tasks 1–13: catalog/pricing/intake, anti-abuse, queues/fencing, scoring/NLP/GeoIP, CRM/SLA, attribution/consent/conversions, CMS/media/import, care/referral, reports/privacy/exports, cấu hình và kiểm thử. Các kết quả đã có trong code/test; rollout cloud chưa chạy.

Đã di chuyển nghiệp vụ sang `src/pagefpt/modules`, adapter sang `infrastructure`, ghép router/dependencies/boundary trong `api`. Giữ `web/templates/static`. Loại coupling catalog router khỏi các module khác. Cấu trúc mục tiêu: `2026-10-01-project-structure.md`.

Auth bổ sung với Supabase REST hiện tại, pooled HTTP, TOTP MFA, encrypted server session, opaque HttpOnly cookie, CSRF và refresh CAS/lease. RED 404 trước triển khai; ba integration tests session/invalid credentials/MFA GREEN. Tách namespace `admin_session_*` để không đụng session consent của marketing. CLI 2.119.0 tạo migration thực `20261001014824_sessions_and_crm_completion.sql`.

Đang hoàn thiện các API còn thiếu (prices/appointments/quote confirmation/intelligence/redirects), nối JS client/admin để bỏ thành công giả, bổ sung kiểm thử và runbook. Chưa tuyên bố hoàn thành hay deployed; chốt bằng suite/lint/type/import/build và báo cáo kiểm chứng mới.

## Chốt backend cục bộ 01/10/2026

Các API bổ sung đã triển khai: admin sessions/MFA/refresh CAS, price read/edit/retire và quote confirmation, appointments, observations/intelligence/visits, redirects, durable display settings, products/integrations/delivery reconciliation và incremental daily metrics. Hardening contact/queue locks, assignment capacity, privacy export epoch/delayed deletion, immutable job command và consented encrypted click IDs hoàn tất. Migration mới giữ 7 migrations trước, tạo bằng CLI và chạy tất cả trong harness thật.

JS nối form/admin/auth/CRM/settings, không thành công giả; analytics mặc định không tracking. API hierarchy dùng catalog đã publish; fixture địa phương cũ chỉ development/test khi chưa có catalog. Bố cục/CSS giao diện giữ nguyên. Preview HTML có dữ liệu thương mại mẫu nên không mount staging/production.

Fresh final suite **102 passed (15.61s)**, Ruff/mypy/architecture/browser contracts/mobile/PostgreSQL/advisors local/build wheel smoke xác nhận. Benchmark gần nhất sustained p95 **74.062ms**, burst100 **512.684ms**, không lỗi; burst100 chưa đạt 500ms. Chi tiết artifact và giới hạn tại `verification.md`, `performance-results.md`. Code backend và tài liệu hoàn thiện; live cloud/provider/backup restore/quota cần chạy ở môi trường thật theo `rollout.md`.

Ruling cuối: workspace không có Git repository, không tạo commit/PR hay khai báo CI đã chạy trên GitHub. Workflow CI đã cấu hình; các bước tương ứng kiểm chứng cục bộ. Phần plan đòi account/sandbox/production acceptance giữ là rollout chưa xác minh, không tự tick PASS.

Kiểm tra bổ sung cuối: form landing quảng cáo RED 422 → GREEN commit thật; consent và payload đã sửa, lỗi không tạo success. Full suite sau sửa template **102 passed (17.30s)**. Wheel rebuild mới và smoke xác nhận package/assets; bản hiện hành không chỉ là build trước sửa giao diện.
