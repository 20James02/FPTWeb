# Quên mật khẩu mọi tài khoản qua bot mặc định — 15/10/2026

## Phạm vi và luồng

Theo yêu cầu owner, mọi tài khoản Admin/nhân viên hợp lệ gửi mã về cùng bot và chat riêng đang nhận mã của tài khoản chủ. Giữ nguyên bot token, chat nhận, nhóm nhận lead, Supabase và khóa mã hóa; không tạo bot mới.

1. Nhập email; chuẩn hóa, giới hạn tần suất theo email/IP HMAC.
2. Kiểm tra Auth email tồn tại, chưa bị xóa/ban và còn membership hoạt động trước khi tạo provider proof hoặc mã.
3. Tạo challenge và mã 6 số; đích nhận luôn là chat chung cấu hình server. Worker gửi qua queue/fence/retry hiện có.
4. Web và Telegram cùng hiển thị mã yêu cầu 8 ký tự để đối chiếu nhiều yêu cầu đồng thời. Không đưa email, mật khẩu hoặc proof vào tin bot/job/log.
5. Nhập mã, mật khẩu mới và MFA nếu đã bật. Mã gắn với email/challenge, không dùng chéo tài khoản, chỉ dùng một lần; thu hồi phiên sau khôi phục.

Email không hợp lệ không tạo proof/mã/job. API vẫn trả response chung chống dò danh sách tài khoản; accepted không đồng nghĩa đã gửi/giao thành công.

## Cấu hình

Thêm `PAGEFPT_TELEGRAM_RECOVERY_CHAT_ID` vào local/operator credentials và Vercel Production dạng sensitive, dùng chính private recipient đã xác minh trước đó. Tất cả nhân viên hiện tại và tạo mới sau này đều dùng chat này, không cần bổ sung email thủ công. Cấu hình cũ `PAGEFPT_TELEGRAM_RECOVERY_ACCOUNTS` chỉ dùng khi chưa bật chat chung. Trong shared mode, adapter từ chối recipient cũ khác chat chung.

Không cần migration mới; sử dụng lookup và các guard Auth/membership từ migration đã triển khai ngày 14/10/2026. Cấu hình ở backend, trình duyệt không được chọn nơi nhận mã.

## Kiểm chứng

- TDD: 8 ca Python thất bại trước thay đổi; contract JS thiếu mã yêu cầu; probe thiếu cờ shared được tái hiện trước khi sửa.
- Toàn bộ Python: **517 passed**; kiểm thử cuối recovery/notices/status: **74 passed**. Có nhân viên quyền kinh doanh, không có binding email, đi qua issue → queue → Telegram double → JWT reset → chống replay và dùng chéo email; MFA kiểm tra ở cả chế độ cũ và shared.
- **29/29** nhóm JS; browser PostgreSQL riêng: mã 6 số, mã yêu cầu khớp, MFA/reset và xóa input, bốn chiều rộng 360/390/430/1440 px đạt.
- Ruff check/format 193 files, mypy/architecture 112 source files, git diff --check đạt. Review độc lập không có lỗi chặn; đã sửa test validator để không bị che bởi lỗi Telegram disabled.
- Telegram getChat chỉ đọc xác nhận recipient hiện tại vẫn là private và được giữ nguyên.
- Candidate **dpl_2VDUuKUpDxYo4Sb9m7J33L9fGiM7** READY, home/login/health/status checks đạt. Probe authenticated xác nhận `recovery_shared:true`; probe không có secret bị chặn 401.
- Sau promote, domain chính trả status 200/ready/shared, login có hướng dẫn mới và recovery.js khớp SHA-256 với source.

Không gửi mã thử vào chat thật, không tạo recovery request hoặc đổi mật khẩu tài khoản thật. Bot delivery/provider reset được kiểm thử bằng HTTP doubles với SQL và worker thật trong DB riêng. Kiểm tra cloud là read-only; không xem mã hoặc provider proof của người dùng. Evidence ignored: `.local/qa/staff-telegram-recovery-20261015/`.

Luồng chi tiết: [password-recovery.md](../backend/password-recovery.md). Nguồn chính thức: [Telegram Bot API](https://core.telegram.org/bots/api), [Supabase generate_link](https://supabase.com/docs/reference/python/auth-admin-generatelink), [Vercel environment variables](https://vercel.com/docs/cli/env).
