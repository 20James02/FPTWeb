# Kiểm tra Supabase — 14/10/2026

Project: `ryfdlhmbytabinsbxbup`. Kiểm tra read-only production bằng metadata PostgreSQL và cấu hình Auth, không đọc hoặc xuất dữ liệu khách hàng, không thay cấu hình production.

Đối chiếu với một PostgreSQL tạm được dựng từ toàn bộ migration trong repo. Kết quả không có đối tượng thiếu hoặc sai khác:

| Đối tượng | Repo / production |
|---|---|
| Migration | 24/24 |
| Bảng private/api | 47/47 |
| Cột | 309/309 |
| Hàm/RPC | 80/80 |
| Chỉ mục | 98/98 |
| Ràng buộc | 119/119 |
| Trigger | 6/6 |

5 queue tồn tại đầy đủ: lead_local, lead_external, conversions, notifications, maintenance. Migration cuối: 20261013103126_voucher_audit_integrity. Nội dung hàm (hash), cột/type/default/nullability, index/constraint/trigger definition và quyền thực tế khớp migration. Các bảng private đều bật RLS; quyền anon/authenticated/service_role được so với cấu trúc local.

Database đầy đủ cho phiên bản code hiện tại. Không đồng nghĩa mọi cấu hình Supabase đã hoàn thiện hoặc đã chịu được tải lớn.

## Khoảng trống Auth

- Site URL vẫn http://localhost:3000; danh sách Redirect URLs trống. Cần thiết lập URL production và các đường dẫn thực sự dùng. Luồng Telegram hiện trao đổi token_hash ở server nên cấu hình này không chứng minh luồng OTP đang lỗi; nó ảnh hưởng các link/redirect Auth của provider.
- disable_signup=false: Supabase vẫn cho tự đăng ký. Ứng dụng hiện chỉ có tài khoản nhân viên do Admin tạo; nên tắt public signup. Tài khoản tự đăng ký không tự được quyền Admin vì ứng dụng còn kiểm tra memberships.
- Supabase password_min_length=6; chưa yêu cầu loại ký tự. Backend tạo nhân viên/đổi mật khẩu yêu cầu 12 ký tự, reset Telegram yêu cầu 8. Cần thống nhất chính sách provider và backend trước khi tăng mức lên 12 để không làm hỏng form reset đang chấp nhận 8.
- TOTP enroll và verify đang bật. Đây là trạng thái tính năng provider, không phải khẳng định mọi nhân viên đã đăng ký MFA.
- Chống mật khẩu đã lộ chưa bật; tính năng này yêu cầu Pro trở lên, không mặc định cần nâng gói cho hiện trạng dự án.

Tham khảo chính thức: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Password security](https://supabase.com/docs/guides/auth/password-security).

Chứng cứ: `.local/qa/supabase-2026-10-14/comparison.json`, `local-metadata.json`, `remote-metadata.json`, `auth-config-safe.json`. Chỉ metadata và trường cấu hình không chứa secret được ghi. Chưa thay đổi schema/Auth trong lượt kiểm tra này.

## Supabase Advisors (Management API, HTTP 200)

- Security: không có ERROR; 1 WARN chống mật khẩu đã lộ chưa bật. 47 INFO RLS bật nhưng không có policy là phù hợp kiến trúc bảng private chỉ truy cập qua backend/service_role, kết hợp kiểm tra quyền trong RPC. Không mở policy anon/authenticated chỉ để xóa thông tin INFO này.
- Performance: không có ERROR; 2 WARN duplicate index, 5 INFO FK chưa có index phủ và 20 INFO index chưa được dùng trong thống kê hiện tại. Không xóa index chỉ vì chưa được dùng; cần xét query thực tế và thời gian thống kê trước thay đổi.
- Hai cặp index trùng: `lead_assignee_created` / `leads_assignee_created_admin_idx`; `lead_branch_created` / `leads_branch_created_admin_idx`. Đây là tối ưu hiệu năng/bảo trì cần xử lý, không phải bảng/hàm đang thiếu.

CLI advisors không hoàn tất (hết thời gian kết nối); đã chuyển sang Management API chính thức và nhận kết quả security/performance HTTP 200. Chứng cứ: `.local/qa/supabase-2026-10-14/advisors-summary.json`.


Cập nhật sau audit: migration `20261014034406_link_performance` đã triển khai, nâng history lên25 migrations và thêm6 bảng private. RLS/revoke/hàm và rollback-only registry/report đã xác minh; xem `link-performance.md` và `link-performance/verified-summary.json`. Kết quả compare24 migrations phía trên là snapshot trước feature này; các giới hạn Auth vẫn giữ nguyên.
