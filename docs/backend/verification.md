# Kết quả kiểm chứng — 01/10/2026

Cập nhật 02/10/2026: năm lỗi tích hợp F-01..F-05 đã được sửa và kiểm chứng cục bộ. Xem [báo cáo sửa lỗi](../qa/2026-10-02/BAO-CAO-SUA-LOI.md) và [cấu hình recovery](../backend/password-recovery.md). Nội dung review/kiểm chứng ngày 01/10 dưới đây là snapshot trước các sửa lỗi này.

Backend triển khai theo module Python/FastAPI, giữ giao diện trong `templates/static/web`. Hoàn tất phần code và kiểm chứng cục bộ theo phạm vi backend; tài khoản cloud/provider và nội dung thương mại production chưa được cấu hình/xác nhận. Đây không phải báo cáo đã deploy.

## Kết quả mới nhất

| Kiểm tra | Kết quả thực chạy |
|---|---|
| `pytest -q --tb=short` | **102 passed, 17.30s**, PostgreSQL portable 16.2; RPC chạy dưới service_role |
| `ruff check src tests tools` | Pass |
| `ruff format --check src tests tools` | 120 files formatted |
| `mypy src` | Pass, 85 source files |
| `tools/check_architecture.py` | Pass; không import namespace cũ, core không phụ thuộc tầng nghiệp vụ/API |
| Node browser API contract | Pass: retry mất response giữ body/key, conflict không success, receipt sai bị từ chối, auth failure/MFA/CSRF; không tracking trước consent |
| Chrome/Playwright mobile 390×844 | Pass: chọn UUID khu vực đã publish, receipt commit PostgreSQL cho form chính và landing quảng cáo, không tràn ngang, 503 giữ key và không hiện xác nhận, không phone trong console |
| Supabase CLI 2.119.0 advisors | Không issue warn/error trên database PostgreSQL portable; chưa phải advisors của project Supabase thật |
| Build wheel + isolated import | Pass: wheel import độc lập, có templates/static, ASGI health và static endpoint hoạt động |
| Locust HTTP localhost 10s, 5 users | 50 synthetic POST, 0 lỗi; output cuối và percentiles xấp xỉ trong `load-http-local.txt` |

Mobile có artifact `mobile-browser-check.json` và `mobile-lead-check.png`. R2/HTTP provider contracts dùng stub mô phỏng lỗi và kết quả, không thay thế kiểm tra bucket/tài khoản thật. Khi lặp e2e nhiều lần trên cùng fixture, anti-abuse có thể trả 403 challenge cho cùng số test; lần xác nhận cuối khởi tạo fixture/database mới. Security tests kiểm tra role/grants/scopes/membership/JWT/CAS và transaction thực; auth provider responses được mô phỏng có chữ ký JWT thật.

## Nội dung có kiểm thử

Atomic intake/idempotency đồng thời, phone encrypted và mask, giá theo scope/term/hiệu lực/promotion/revision, admin JWT/MFA/cookie CSRF/refresh lease/logout, scope chi nhánh và privacy cross-branch, queue retry/fence/lost wake/dead job/provider unknown, CAS CRM/lịch hẹn/quote, scoring có evidence và phone metadata unknown, consent/event dedup/private click IDs, publish/import/CMS/redirects/media validation, preferences/quiet hours/cap/referrals, reports correction/export epoch/erase cleanup.

Các lỗi cuối đã có regression: OpenAPI cảnh báo operation ID trùng do router hiển thị đăng ký hai lần; hierarchy từng trả fixture địa phương khi đã publish catalog. Kiểm thử mobile với catalog thật tái hiện form không gửi vì saved zone/code cũ không có trong options; sửa chọn zone/option hợp lệ và kiểm tra readiness theo điều kiện. Landing quảng cáo dùng region code và thời gian dạng chuỗi cũ gây 422; đã sửa payload/schema, tắt analytics mặc định và thêm trạng thái lỗi/thử lại.

## Hiệu năng và giới hạn bằng chứng

ASGI + PostgreSQL local, 60s/5 lead-rps, tổng 450 request gồm burst50 và burst100: **0 lỗi**, sustained p95 **74.062 ms**, p99 **86.260 ms**; burst50 p95 **264.619 ms**; burst100 p95 **512.684 ms**, p99 **525.122 ms**. Burst100 hơi vượt mốc 500 ms trên harness này; không coi đã đạt mọi mục tiêu tải. File `performance-final-local.json` là lần chạy gần nhất. Các lần trước 120s và 15 phút được giữ riêng; chúng kiểm tra phiên bản code trước các thay đổi cuối, không tự gán cho bản mới.

100.000 lead tổng hợp, RPC list thực 10 samples **18.829–36.452 ms**; EXPLAIN trong `query-plan-local.json`. Planner chọn index created-time và filter branch trong phân bố fixture này; không báo rằng branch index luôn được dùng. Cần đo lại trên cardinality/phân bố cloud thực tế.

Không có RTT Supabase/PostgREST thực, cold start Vercel, giới hạn quota, worker load song song đầy đủ, burst liên tục 60 giây, private Realtime delay, hoặc mobile mạng VN. Kết quả cục bộ không chứng minh các SLO đó. Admin UI đang dùng polling durable cursor 5 giây; code broadcast private cần cấu hình dịch vụ và RLS thật.

## Rollout còn cần môi trường thật

Apply migration trên project staging đúng PostgreSQL version; Vault/pg_net/cron recover; kiểm tra RLS/security advisors/Realtime; R2 CORS/lifecycle/presign/cleanup; Supabase Auth/MFA/JWKS live; connector native quảng cáo/thông báo/OAuth/signatures; backup restore/deletion replay; warm/cold/mobile RTT và quota. Xem `rollout.md` và `deploy/`.

Không seed giá thương mại. HTML preview còn fixtures hotline/giá/khách/claims; không mount production. Policy tự xóa lead sau 12 tháng chưa được chấp thuận nên không tự xóa active lead. Các TTL rawIP/events/click/export đã thực thi riêng theo runbook. Độ tin cậy/GeoIP/đầu số không chứng minh danh tính hoặc nhà mạng hiện tại.
