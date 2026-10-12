# Gói khách chốt và lịch thanh toán

## Thao tác trong Admin

Trong chi tiết khách hàng, tại **Gói đã chốt & Thanh toán**:

1. Chọn gói đã công khai, chọn kỳ **hằng tháng / 6 tháng / 12 tháng**, nhập ghi chú và lưu.
2. Chọn **Thêm lịch thanh toán**, nhập ngày đến hạn, số tiền thực tế cho **toàn bộ kỳ thanh toán**, ghi chú. Không tự lấy giá tháng làm số tiền của kỳ 6/12 tháng.
3. Khoản chờ thu cho phép sửa hoặc hủy. Chọn xác nhận đã thu khi nhận tiền; tùy chọn tạo kỳ tiếp theo mặc định tắt. Bật tùy chọn để tạo kỳ mới cùng gói, kỳ và số tiền trong cùng giao dịch.
4. Nhân viên đang được phân công khách nhận nhắc tại nút **Nhắc hạn** trên thanh Admin. Thông báo có liên kết mở khách và đánh dấu đã đọc.

Gói khách hỏi ban đầu và báo giá vẫn giữ nguyên. Việc lưu gói chốt hoặc xác nhận thu không tự chuyển trạng thái khách. Đổi gói không sửa lịch sử thanh toán. Khoản đã thu/đã hủy không sửa lại.

Ngày đến hạn tính theo lịch Việt Nam. Cron hiện có chạy mỗi 5 phút; khi mở inbox, hệ thống cũng kiểm tra các khoản đến hạn của người đang đăng nhập. Trang đang hiển thị cập nhật inbox mỗi 30 giây, có backoff khi lỗi. Đây là thông báo **trong Admin**, chưa liên kết Telegram riêng hay thông báo hệ điều hành.

Thông báo chỉ dành cho người phụ trách hiện tại còn quyền truy cập khách. Chuyển nhân viên làm mất quyền xem nhắc của người cũ và tạo nhắc cho người mới. Khoản đã thu/hủy và khách không hợp lệ/trùng/từ chối dừng nhắc. Khách đã lắp đặt vẫn được nhắc thanh toán.

Ngày cuối tháng giữ mốc gốc: kỳ tháng bắt đầu 31/01 → 28/02 (29/02 năm nhuận) → 31/03. Sửa số tiền/ghi chú không làm trôi mốc ngày.

## Hợp đồng API

Prefix `/api/v1/admin`; dùng phiên Admin hiện có và CSRF cho lệnh ghi. `lead.read` cho đọc; `lead.write` và MFA AAL2 cho ghi. SQL kiểm tra phạm vi khách/chi nhánh. Ghi chú mã hóa; trả plaintext chỉ với `lead.pii`, AAL2 và quyền đúng chi nhánh.

| Lệnh | Mục đích | Payload / kết quả |
|---|---|---|
| GET `/leads/{id}/billing` | Gói chốt | `{deal}`; null khi chưa thiết lập |
| PUT `/leads/{id}/billing` | Lưu gói chốt | `expected_version`, `plan_id`, `billing_months` (1/6/12), `notes` tùy chọn |
| GET `/leads/{id}/payments?limit=30&before={uuid}` | Lịch sử phân trang | `{items, next_before}` |
| POST `/leads/{id}/payments` | Thêm lịch | `expected_version` của deal, `payment_id` UUID cố định cho retry, `due_date` YYYY-MM-DD, `amount_vnd`, `notes` |
| PATCH `/payments/{id}` | Sửa/hủy khoản chờ thu | `expected_version` của payment; `status` pending/cancelled; ngày/số tiền/ghi chú tùy chọn |
| POST `/payments/{id}/collect` | Xác nhận thu | `expected_version` của payment, `create_next` boolean; trả `{payment, next_payment}` |
| GET `/notifications?limit=30` | Inbox cá nhân | `{items, unread_count, as_of, timezone}` |
| POST `/notifications/{id}/read` | Đánh dấu đọc | Không cần body; kiểm tra đúng người nhận và phiên bản khoản |

Phiên bản deal/payment độc lập với `lead.version`. Thêm khoản và xác nhận thu hỗ trợ retry đúng nội dung, không tạo trùng; nội dung thay đổi khi dùng lại lệnh bị từ chối. Giao diện giữ dữ liệu đang nhập khi lỗi hoặc xung đột; tải lại dữ liệu trước khi quyết định gửi tiếp. Không retry tự động một bản ghi đã bị người khác thay đổi.

Số tiền là số nguyên VND, 1–1.000.000.000; ngày trong 2020–2100. Hai khoản chưa hủy của cùng khách không có cùng ngày đến hạn. Nếu ngày kỳ tiếp theo đã có khoản khác, lệnh xác nhận thu kèm tạo kỳ mới thất bại toàn bộ, không ghi nhận thu một phần.

Các bảng `private.lead_deals`, `private.payments`, `private.payment_notices` bật RLS, không cấp quyền trực tiếp cho trình duyệt. Chỉ server gọi dispatch bằng service role. Audit/inbox không chứa số điện thoại hoặc ghi chú plaintext.

## Đơn giản hóa dữ liệu

Chi tiết khách hiển thị tóm tắt liên hệ/nhu cầu bằng tiếng Việt. Nút **Xem cơ sở đánh giá** mở popup chứa điểm, nguồn và lý do. Điểm là tín hiệu hỗ trợ xử lý, không phải xác minh danh tính hoặc xác suất mua chính xác. Nút truy cập dữ liệu cá nhân đổi tên thành **Hiển thị thông tin**; vẫn áp dụng kiểm tra quyền và MFA.

Form dùng dialog có nhãn, điều hướng bàn phím, giữ focus, giữ bản nháp khi cập nhật nền và hỗ trợ màn hình 360/768/1440 px cùng giao diện tối.
