# Chặn mã sai ngay bước xác minh — 15/10/2026

## Tái hiện và nguyên nhân

Người dùng xác nhận nhập mã bất kỳ chỉ chuyển sang bước mật khẩu mới, chưa lưu đổi mật khẩu thành công. Frontend trước sửa chỉ kiểm tra định dạng 6 số rồi gọi goToForgotStep(3); kiểm tra HMAC thật bị trì hoãn đến final reset. TDD tái hiện chuyển bước trước response server, backend thiếu route verify (404). Luồng lưu mật khẩu trước đó vẫn có kiểm tra HMAC, expiry và MFA.

## Thay đổi

- Thêm POST `/api/v1/auth/recovery/verify` nhận email/challenge_id/otp. Server kiểm tra mã HMAC, email/challenge/chat, hạn mã, Auth chưa bị ban/xóa và membership active; chỉ trả `{verified:true}` khi đúng.
- SQL dùng FOR UPDATE trên cùng private.telegram_recovery với final consume. Verify và reset chia sẻ tối đa 5 lần sai; lần thứ 5 block và xóa code/proof. Verify thành công không consume, không trả proof, không gia hạn hoặc reset attempts.
- Final `/reset` vẫn kiểm tra lại và consume một lần; đúng verify trước đó không cho phép reset bằng mã sai/hết hạn/thu hồi hoặc bỏ MFA.
- Frontend await verified đúng kiểu boolean true, khóa nút/aria-busy khi chờ, lỗi inline role=alert được nối vào ô qua aria-describedby/aria-invalid. Mã sai giữ bước 2.
- Bỏ response cũ sau sửa mã, đổi email, đổi bước hoặc hủy. Review phát hiện race khi bấm Đổi Email trong lúc chờ; đã tái hiện RED và sửa bằng generation của navigation. Không đưa lỗi/focus vào ô đang ẩn hoặc tự mở mật khẩu cho email cũ.
- Cập nhật contract backend, bảng API và prompt nối frontend để thiết kế sau này không quay lại format-only verification.

## Kiểm chứng

- Toàn bộ Python: **537 passed**. Có 20 ca mới: đúng/sai, expiry, ban/revoke, sai email/challenge/chat, chia sẻ attempts verify/reset, 5 request sai đồng thời, verify đúng không reset attempts, final reset recheck, mã hết hạn sau verify, invalid shape, same-origin và quyền SQL.
- **29/29** nhóm JavaScript; contract chặn pending, sai, network failure, verified dạng string, sửa mã và đổi view. Test navigation dùng chính function goToForgotStep trong HTML, với delayed success/error.
- Browser DB riêng: sai 6 số trả 401 và giữ bước 2, đúng trả 200 mới vào bước 3, giữ response thật rồi bấm Đổi Email không bị điều hướng cũ; sau đó verify/MFA/reset/audit và xóa input đạt. Bốn kích thước 360/390/430/1440px không lỗi JS/tràn ngang.
- Ruff check/format 194 files, mypy/architecture 112 source, git diff --check đạt. Review độc lập không còn blocker sau sửa race.

## Triển khai

Migration `20261015014530_recovery_step_verification.sql` đã áp dụng và ghi history một lần, tổng 28 migrations. Anon/authenticated không execute private verifier; service_role được execute. Không thêm bảng hoặc SECURITY DEFINER mới, không đổi bot/recipient/khóa/SMTP.

Candidate **dpl_9hRafKotC4akrjnK5p25oE1wY6h3** READY. Login/health/status đạt; POST verify với body thiếu trường trả 422 trước handler, không tạo mã hay dùng mã thật. Status xác nhận shared recovery vẫn bật, request không có worker secret trả 401. Candidate kiểm tra xong trước promote.

Vercel promote thành công lên `https://fpt-vungtau.com`. Kiểm tra trực tiếp sau promote: trang login và health trả 200, khung lỗi và nút xác minh mới có mặt, SHA-256 JavaScript công khai khớp file local; verify thiếu trường trả 422. Status có xác thực trả 200 với ready/telegram_enabled/recovery_configured/recovery_shared đều true; thiếu xác thực trả 401. Evidence: `live-verification.json`.

Không tạo recovery request, đọc mã thật, gửi Telegram thử hoặc đổi mật khẩu tài khoản thật trên cloud. OTP/provider được mô phỏng trong kiểm thử nhưng SQL, worker và HTTP frontend là luồng thật trên DB riêng. Evidence ignored: `.local/qa/recovery-step-verify-20261015/`.

Luồng sử dụng: [password-recovery.md](../backend/password-recovery.md). Bot mặc định và cơ chế nhận mã chung vẫn theo [bản triển khai shared recovery](2026-10-15-shared-telegram-recovery.md).
