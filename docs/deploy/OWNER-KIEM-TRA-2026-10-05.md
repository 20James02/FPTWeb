# Kiểm tra owner — 05/10/2026

Project Supabase: `FPTWeb` (`ryfdlhmbytabinsbxbup`).

## Đã thực hiện

- Tạo Auth user cho email người dùng cung cấp: `27jd07@gmail.com`.
- UUID: `f3c42a7d-b47d-4045-bdd4-e8c0cd0cd3e2`.
- Chạy `OWNER-BOOTSTRAP.sql`: một membership active, scope toàn hệ thống `00000000-0000-0000-0000-000000000000`, permissions `["*"]`.
- SQL đọc lại xác nhận một membership owner và một audit `owner_bootstrap`.
- Backend `IdentityService` qua RPC thật đọc đúng membership và quyền toàn hệ thống. Giá trị `aal1` được cung cấp cho phép thử quyền nội bộ; đây không phải kiểm thử đăng nhập hoặc xác minh JWT của owner.
- ASGI với Supabase thật: `/health/ready` trả 200; `/api/v1/admin/me` khi chưa đăng nhập trả 401. Kiểm tra và đóng tài nguyên bằng lifespan thành công.

## Chưa hoàn tất

- Email chưa được xác nhận; chưa có MFA factor verified.
- Người dùng chưa thiết lập mật khẩu riêng qua luồng đã xác minh. Không gửi email, không tạo link/token đăng nhập và không tự đánh dấu email confirmed trong đợt này.
- Chưa kiểm thử đăng nhập owner, JWT, phiên `aal2`, SMTP hoặc recovery thật.
- Vercel production và R2 chưa được triển khai trong đợt này.

## Bước tiếp theo

1. Cập nhật 06/10/2026: UI đã nhận mã email hoặc địa chỉ link Reset Password sao chép từ email, chưa mở; có thể giữ template link mặc định. Nếu muốn đổi template sang `{{ .Token }}`, kiểm tra quyền tùy chỉnh/SMTP của project Free. Site URL phải khớp origin triển khai; ứng dụng chưa có callback tự xử lý khi bấm link.
2. Người dùng mở trang Admin đăng nhập → Quên mật khẩu, tự yêu cầu mã email và thiết lập mật khẩu riêng. Kiểm tra kết quả thực tế và trạng thái email; không giả định email đã được xác nhận chỉ vì request được nhận.
3. Đăng ký rồi verify TOTP theo phần **Đăng ký TOTP** trong `HUONG-DAN-VERCEL-SUPABASE-R2.md`. Admin hiện chưa có màn enrollment. Không gửi mật khẩu, mã email, QR secret hoặc TOTP qua chat.
4. Đăng nhập Admin bằng tài khoản thật và TOTP; kiểm tra `/api/v1/admin/me` có đúng owner và `aal2`, rồi thử thao tác quản trị được phép.

## Security Advisor

Kiểm tra mới ngày 05/10/2026 còn ba nhóm WARN, chưa thay đổi cấu hình để xử lý trong đợt cấp owner:

- `public.rls_auto_enable()` có quyền execute cho anon/authenticated: hai nhóm WARN. Đây là hàm event trigger nền tảng đã được kiểm tra trong đợt kết nối; schema `public` không được expose qua API của dự án. Không tự sửa hàm nền tảng chỉ để xóa cảnh báo. [Anon advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [Authenticated advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Leaked Password Protection đang tắt. Kiểm tra khả năng hỗ trợ của plan và bật trong Auth trước khi nhận người dùng thật. [Hướng dẫn](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

INFO `rls_enabled_no_policy` trên bảng private phù hợp mô hình backend service; không thêm policy rộng để làm sạch Advisor.

Không lưu secrets trong báo cáo. Kết quả ở trên chỉ xác nhận phạm vi được kiểm tra, không chứng minh toàn bộ hệ thống đã sẵn sàng production.
