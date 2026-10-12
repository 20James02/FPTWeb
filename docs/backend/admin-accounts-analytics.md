# Tài khoản Admin, nhân viên và phân tích — 07/10/2026

## Sử dụng

Đăng nhập rồi mở **Tài khoản & MFA** (`/admin/account`). Mọi nhân viên đang hoạt động có thể vào trang cá nhân, kể cả khi chưa được quyền xem dữ liệu nghiệp vụ.

1. Đặt tên thiết bị, chọn **Thêm thiết bị**, quét QR bằng ứng dụng xác thực, nhập sáu số và xác minh. Có thể mở phần nhập tay nếu không quét được. QR/secret chỉ hiện trong lúc thiết lập, bị xóa khỏi DOM sau xác minh, hủy hoặc rời trang. Không lưu QR/mã khôi phục trong log hoặc trình duyệt.
2. Có thể thêm thiết bị dự phòng sau khi đăng nhập AAL2. Không xóa được thiết bị đã xác minh cuối cùng. Khi có nhiều thiết bị, chọn đúng thiết bị tại đăng nhập, đổi mật khẩu và khôi phục.
3. Đổi mật khẩu cần mật khẩu hiện tại, mật khẩu mới tối thiểu 12 ký tự và TOTP nếu đã bật MFA. Các phiên BFF cũ bị thu hồi; sau đó đăng nhập lại. Nếu Supabase từ chối mật khẩu mới, mật khẩu cũ còn hiệu lực nhưng vẫn cần đăng nhập lại.
4. Chủ hệ thống có `identity.manage` và AAL2 được tạo nhân viên bằng email, tên, mật khẩu ban đầu, chi nhánh và vai trò. Mật khẩu ban đầu không có trong response/audit; chuyển cho nhân viên qua kênh riêng. Vai trò mẫu gồm kinh doanh, chăm sóc, marketing, biên tập và quản lý chi nhánh. Nhân viên mới bắt buộc hoàn thành MFA trước khi đọc dữ liệu nghiệp vụ.
5. Tìm nhân viên theo tên/email, sửa quyền, kích hoạt, công suất và ca làm. Quyền bị thay đổi hoặc tài khoản bị vô hiệu hóa sẽ thu hồi phiên. Không thể cấp quyền vượt quyền của mình hay vô hiệu hóa chủ toàn hệ thống cuối cùng. Sửa đồng thời có kiểm tra version.

Tài khoản thật chưa được tự động đăng ký MFA hay đổi mật khẩu. Khôi phục bằng Telegram cần binding riêng phía server; việc tạo nhân viên không tự cấp binding hoặc gửi mã vào nhóm.

## Kết nối frontend

Tất cả đường dẫn bên dưới có prefix `/api/v1`. Self-service chỉ dùng cookie phiên HttpOnly hiện tại, không nhận Bearer thay cookie; thao tác ghi phải có `X-CSRF-Token` và origin hợp lệ. Response chứa QR/secret đặt `Cache-Control: no-store` theo middleware API. Không đưa password/TOTP/provider token vào analytics, storage hoặc log.

| Gọi | Dữ liệu / xử lý |
|---|---|
| `GET /auth/account` | Email, AAL, danh sách thiết bị đã lọc trường an toàn và memberships |
| `POST /auth/mfa/enroll` | `{name}` → `{id,totp:{qr_code,secret,uri}}`; lưu tạm trong RAM |
| `POST /auth/mfa/{id}/verify` | `{code}` đúng sáu số; nâng token AAL2 trong phiên mã hóa qua lease |
| `DELETE /auth/mfa/{id}` | Hủy thiết lập hoặc xóa thiết bị dự phòng; `LAST_MFA_REQUIRED` nếu là thiết bị cuối |
| `POST /auth/account/password` | `{current_password,password,otp,factor_id?}`; thành công chuyển login, không lưu mật khẩu |
| `POST /auth/session` | Login hiện có bổ sung `factor_id?`; `MFA_REQUIRED.fields.factors` cấp các lựa chọn thiết bị |
| `POST /auth/recovery/reset` | Luồng Telegram hiện có bổ sung `totp_factor_id?` |
| `GET /admin/staff/roles`, `/admin/staff/branches` | Vai trò mẫu và các chi nhánh được phép quản lý |
| `GET /admin/staff?q=...&offset=0` | Tối đa 50 rows, `next_offset`; tìm kiếm server, debounce |
| `POST /admin/staff` | `{email,password,display_name,branch_id,role}` → membership; AAL2 |
| `PUT /admin/memberships` | API hiện có thêm `expected_version?`; UI gửi version nhận từ danh sách, 409 phải tải lại |
| `GET /admin/reports/branches` | Chi nhánh báo cáo được cấp quyền |
| `GET /admin/reports/analytics` | `start`, `end` dạng YYYY-MM-DD; optional `branch_id`, `campaign` |
| `GET /admin/reports/summary` | Cùng bộ lọc; chi phí campaign/CPL/chi phí mỗi lắp đặt |

`SESSION_REFRESH_BUSY` trong lúc đổi mật khẩu/thiết lập MFA: báo chờ và thử lại, không tự tuyên bố đăng nhập thành công. Chốt SQL ghi trước khi đổi mật khẩu ngăn đăng nhập đồng thời hoặc response Auth đến muộn tạo phiên từ mật khẩu cũ. Thời gian bắt đầu login lấy từ DB trong auth throttle, không nhận từ người dùng. Nếu DB không giải phóng chốt sau đổi mật khẩu thành công, chốt bảo vệ có hiệu lực tối đa 90 giây; mật khẩu mới vẫn đã đổi, không báo sai là chưa đổi.

## Định nghĩa báo cáo

Dashboard và Báo cáo dùng cùng component/bộ lọc. Kỳ mặc định 30 ngày, tối đa 93 ngày bao gồm hai đầu, ngày lịch Việt Nam `Asia/Ho_Chi_Minh`. Toàn bộ KPI/phân bố thuộc các hồ sơ **được tiếp nhận trong kỳ**, phản ánh trạng thái hiện tại; không phải đếm sự kiện chuyển trạng thái xảy ra trong kỳ.

- Đã liên hệ: trạng thái có tiến triển hoặc có lịch sử chuyển sang contacted.
- Đủ điều kiện: qualified/survey/quoted/closed/installed hiện tại; chỉ là tỷ lệ trên cohort, không khẳng định tuần tự mọi hồ sơ.
- Đã lắp đặt: installed hiện tại.
- Đang chờ/quá hạn: new/assigned/contacting thuộc cohort; quá hạn theo `sla_due_at` so với thời điểm truy vấn.
- Nguồn/campaign: last-touch UTM đã lưu; không có nguồn hiện rõ thiếu dữ liệu.
- Không có hồ sơ: KPI bằng 0, không tạo xu hướng giả; tỷ lệ mẫu số 0 là dấu “—”. Thiếu chi phí giữ trạng thái chưa nhập, không gán 0.

Biểu đồ SVG nhẹ, chú giải và loại nét, nhãn thích ứng kích thước màn hình; mỗi biểu đồ có bảng dữ liệu thay thế. Báo cáo không trả điện thoại/IP thô, giới hạn phạm vi chi nhánh tại SQL. Query dùng cohort materialized trong một RPC và các index branch/date hiện có. Báo cáo làm mới theo sự kiện polling đã có, không tạo thêm WebSocket/poll độc lập.

## Triển khai

Migration: `supabase/migrations/20261007021006_accounts_analytics.sql`. Migration giữ quyền lịch sử hiện có và chỉ bắt buộc MFA đối với nhân viên mới tạo qua giao diện này. Chặn Realtime AAL1 đối với memberships yêu cầu MFA. Không tạo policy public cho các bảng private để bỏ cảnh báo advisor.

Tham khảo chính thức: [Supabase TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [tạo user phía server](https://supabase.com/docs/reference/python/auth-admin-createuser), [chính sách mật khẩu](https://supabase.com/docs/guides/auth/password-security). Bảo vệ mật khẩu đã bị rò rỉ của Supabase chỉ có trên Pro trở lên; kiểm tra này chưa được bật trên project hiện tại.
