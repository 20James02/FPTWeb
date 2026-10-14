# Kiểm chứng khôi phục mật khẩu và Telegram — 14/10/2026

## Nguyên nhân và thay đổi

- Worker origin trong Supabase còn là `https://fpt-web-ten.vercel.app`. Host này trả 307 sang `fpt-vungtau.com`; Authorization bị loại khi đi qua hostname khác. Lịch worker nhận 72 HTTP 401 trong cửa sổ kiểm tra trước sửa.
- Cùng khóa đang có: probe pg_net chỉ đọc `/internal/jobs/status` qua host cũ trả 401, gọi trực tiếp domain chính trả 200/ready. Không cần thay khóa Vault/Vercel.
- Đã đổi runtime worker origin sang `https://fpt-vungtau.com`, cron mỗi phút, pg_net timeout 25 giây. Sau sửa, ba request định kỳ mới nhất trả 200, không timeout/lỗi; cả ba không claim job nào.
- Bổ sung xác minh email tồn tại trong Auth, chưa bị xóa/ban, có membership hoạt động trước reservation/generate_link. Provider subject phải khớp; thu hồi tài khoản trong lúc generate, trước gửi hoặc trước dùng mã đều bị chặn.
- Lookup trong private, role service_role bắt buộc, quyền public/browser bị thu hồi; không cấp SELECT auth.users cho service_role. Email không hợp lệ vẫn nhận response chung, không phát sinh provider request/code/job.
- Mã 6 số, hạn 5 phút, cooldown 60 giây, 5 lần sai, MFA, AES-GCM/HMAC, session revocation và retry/fence giữ nguyên.

## Kiểm thử

- TDD quan sát 6 lỗi trước sửa cho tài khoản không hợp lệ/provider subject khác, 4 lỗi thiếu status route, 4 lỗi khi tạm bỏ DB guards thu hồi tài khoản.
- Toàn bộ Python: **503 passed**. Sau chỉnh test theo review, chạy lại recovery + notices + status: **60 passed**.
- JavaScript: **29/29** nhóm contract. Ruff check/format **193 files**, mypy và architecture **112 source files** đạt; git diff --check đạt.
- Browser fixture SQL riêng: mã Telegram ngẫu nhiên 6 số, MFA, reset/audit/session thật trong DB kiểm thử, xóa các input sau thành công; 360/390/430/1440 px không overflow/pageerror.
- Reviewer độc lập không phát hiện lỗi runtime/bảo mật chặn phát hành. Đã sửa test provider-subject-mismatch để thực sự đi qua `/verify`, xác nhận không PUT password khi JWT subject sai.

## Cloud

- Migration `20261014104000_recovery_account_worker_delivery.sql` áp dụng một lần; history có **27 migrations**. service_role được execute lookup; anon/authenticated không được execute; service_role vẫn không SELECT Auth trực tiếp.
- Lookup chỉ đọc xác nhận tài khoản đã cấu hình private chat vẫn đủ điều kiện. getMe/getChat/getChatMember của bot thành công; chat thông báo là nhóm, bot là administrator; chat mã khôi phục là private.
- Deployment **dpl_5UtidTFRdkmUnUX3fP4XRRSy19iH** build READY, candidate checks home/login/health/status-unauthorized đạt, status đúng khóa trả 200, sau đó promote.
- Domain chính status đúng khóa: 200/ready/Telegram enabled/recovery configured. Domain cũ tái hiện 307 → 401; pg_net tái hiện cùng kết quả.
- Supabase Security Advisors: không có ERROR; 53 INFO RLS không policy thuộc các bảng private chặn browser; còn 1 WARN cấu hình nền tảng chưa bật leaked-password protection. Không tự thay gói dịch vụ hoặc chính sách Auth ngoài phạm vi sửa này.

## Giới hạn và vận hành

Không tạo recovery request hoặc đổi mật khẩu tài khoản thật, không gửi tin nhắn thử, không tạo lead thật để kiểm thử. Gửi mã/thông báo được kiểm thử bằng HTTP doubles và SQL/worker thật trên DB riêng. HTTP 200 của lịch chạy chứng minh worker được gọi; không chứng minh người dùng đã nhận/đọc một tin nhắn mới.

Status endpoint chỉ xác minh khóa, DB health và cờ cấu hình, không tự kiểm chứng Telegram delivery. Với sự cố giao tin, đọc state/code của private.jobs/private.deliveries và private.wake_failures; không log/decrypt mã vào báo cáo. Nếu provider phản hồi không rõ đã gửi hay chưa, giữ unknown, không tự phát lại.

Evidence chi tiết trong `.local/qa/recovery-telegram-20261014/` (ignored); credentials không đưa vào Git/deployment. Tài liệu luồng: [password-recovery.md](../../backend/password-recovery.md).

Đối chiếu tài liệu chính thức: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [Auth generate_link](https://supabase.com/docs/reference/python/auth-admin-generatelink), [Telegram Bot API](https://core.telegram.org/bots/api), [Vercel env CLI](https://vercel.com/docs/cli/env).
