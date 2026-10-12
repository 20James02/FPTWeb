# Nghiệm thu tài khoản và phân tích — 07/10/2026

## Kiểm chứng đã chạy

- Toàn bộ Python: **255 passed, 57.97 giây**. PostgreSQL fixture chạy migrations thật; 17 kiểm thử tài khoản/phân tích bổ sung. Không tạo nhân viên hoặc thay mật khẩu/MFA tài khoản thật.
- Ruff check và format: đạt, 144 file; mypy: đạt, 93 source files; `git diff --check`: đạt.
- 12 file hợp đồng JavaScript: đạt, gồm lựa chọn thiết bị MFA, auth/CSRF, retry lead, consent, địa bàn, giá và Telegram recovery.
- Browser Chrome/Playwright với fixture độc lập: **23 checkpoints đạt**, không pageerror. Account và Dashboard/Reports ở 1440/768/390/360 px; dark mode; tất cả input có nhãn, không tràn ngang, menu không gạch chân. Tạo/sửa và lưu nhân viên desktop/mobile (capacity/version cập nhật đúng, giữ quyền hiện tại kể cả khi tìm kiếm nền trả muộn), MFA sai/đúng, xóa secret sau xác minh, giữ thiết bị cuối, bắt MFA nhân viên và tự nạp lại menu quyền; lọc kỳ trống/sai; đổi mật khẩu/đăng nhập lại.
- Hồi quy browser client: menu tư vấn ba loại dịch vụ, keyboard/mobile/focus/Escape đạt. Form ngắn đúng Tên/Điện thoại/Địa chỉ ở bốn kích thước; retry giữ giá trị và receipt SQL thật đạt.
- Rà soát độc lập đã sửa lựa chọn thiết bị dự phòng, kết quả đổi mật khẩu khi DB/provider logout lỗi, Realtime MFA và tên chi nhánh. Reviewer tái lập tình huống đăng nhập đồng thời trong lúc đổi mật khẩu: sau sửa login cạnh tranh 503, đổi mật khẩu 200, browser cạnh tranh 401, login mới 200. Bổ sung test response Auth đến muộn và không giải phóng được chốt.

Evidence cục bộ, nằm ngoài deployment: `.local/qa/accounts-python-tests.txt`, `.local/qa/accounts-analytics/result.json` và ảnh ở cùng thư mục. Dữ liệu browser hoàn toàn tổng hợp; không đưa ảnh QR thật hoặc PII vào báo cáo.

## Supabase

Đã áp dụng migration `20261007021006_accounts_analytics`; đối chiếu lịch sử 15 migrations. Có 39 bảng private, tất cả bật RLS, bảng account locks không cho anon/authenticated đọc. Quyền browser thực thi event trigger `public.rls_auto_enable()` đã thu hồi. Aggregate báo cáo gọi thành công với dữ liệu thật, không trả thông tin liên hệ.

Security advisor còn cảnh báo [bảo vệ mật khẩu rò rỉ chưa bật](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); tính năng này cần Pro trở lên. INFO 39 bảng RLS không policy là chủ đích server-only, không tạo policy permissive để bỏ cảnh báo. Performance advisor còn [hai cặp index leads trùng lịch sử](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index), ba foreign key thiếu index và các index chưa sử dụng trên dữ liệu nhỏ; chưa thay schema/index ngoài phạm vi tính năng này.

Các kiểm tra cloud đăng nhập/MFA/đổi mật khẩu thật chưa chạy tự động vì cần thiết bị/mật khẩu của chủ tài khoản. Mọi luồng này đã được kiểm chứng bằng fixture Auth + SQL thật. Chủ tài khoản tự mở `/admin/account` để đăng ký thiết bị.

## Vercel

Trạng thái deployment và kiểm tra domain được ghi trong `docs/deploy/ADMIN-ACCOUNTS-ANALYTICS-2026-10-07.md` sau khi candidate và promotion được xác nhận.
