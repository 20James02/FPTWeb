# Phụ kiện và hoàn thiện các luồng Admin

Yêu cầu trực tiếp: sửa các lỗi đã tái hiện, thống kê chức năng/khả năng tùy biến; thêm phụ kiện có giá cố định, checkbox cộng giá ngay, thẻ đồng đều. Người dùng chọn Admin được cấu hình thu một lần hoặc theo tháng.

Giữ FastAPI/Jinja/Postgres/R2. Tận dụng resource `product` và quyền catalog.write; mở rộng trường giá cuối cùng VND, billing_mode one_time/monthly, ảnh ready và gói áp dụng. Giữ tương thích sản phẩm cũ không có giá. CRUD nháp/công bố/ngừng, version/MFA hiện có. Không seed giá/ưu đãi production.

Client có checkbox trên thẻ gói; trạng thái chọn theo gói, tách tiền thiết bị một lần/tháng và tổng kỳ 1/6/12 tháng. Giá gói lấy quote theo địa bàn. Khi thiếu giá gói vẫn hiện subtotal thiết bị, không tạo tổng xác nhận. UI cập nhật tức thì, sau đó quote server xác nhận; chống phản hồi cũ khi đổi thiết bị/kỳ/địa bàn. Backend chỉ nhận ID, tự tính giá và lưu snapshot tên/giá/chế độ/phiên bản cùng lead, không tin số tiền client. Quote cũ bị vô hiệu khi cập nhật/ngừng sản phẩm; lịch sử giữ snapshot.

Sửa CMS: HTML cho slug công bố, preview chỉ Admin, chặn slug trùng trang tĩnh và slug page khác, render block an toàn, canonical cùng URL và sitemap không dẫn đến slug dành riêng. Nối A/B vào hero CTA bằng variants được Admin cấu hình; mặc định không thử/không track khi chưa có consent, ghi exposure đúng variant và có báo cáo.

Màn delivery dùng API hiện có, giải thích trạng thái integration configured/verified. Không tự tạo credentials, gửi conversion hoặc dữ liệu khách ra nhà cung cấp. Làm rõ tên/nhãn và tìm kiếm ở workspace. Đồng bộ kích thước thẻ, nội dung dài cuộn bên trong và CTA cố định; kiểm thử mobile và desktop với tên/ảnh/nội dung khác nhau.

Nghiệm thu: tests PostgreSQL/Auth fixture; giá/VAT/kỳ/duplicate IDs/phụ kiện không công bố/phạm vi/snapshot/quote stale; CMS XSS/slug/canonical/preview; A/B consent/exposure/report; browser checkbox realtime/form Admin/media CRUD/cards 320–1440. Thống kê theo chức năng thật và giới hạn còn lại; không gắn điểm 10/10 từ số test. Triển khai migration trước app tương thích nếu xác minh được tài khoản; không sửa dữ liệu kinh doanh production.

## Bổ sung từ người dùng: lịch và hồ sơ nhân viên

- Mọi ngày hiển thị/nhập dùng dd/mm/yyyy; có giờ dùng dd/mm/yyyy HH:mm, múi giờ Việt Nam. API giữ ISO có múi giờ.
- Nhân viên được phân công, có lead.write/lead.pii và MFA được sửa tên, địa chỉ, gói và phụ kiện. Điện thoại không có trường sửa và API từ chối trường này.
- Xác nhận địa chỉ chọn tỉnh/thành, xã/phường từ nguồn địa giới hiện có (cache + bản dự phòng có ngày cập nhật); kiểm tra xã thuộc tỉnh phía server. Địa chỉ cụ thể được mã hóa, không ghi thô vào audit.
- Sửa có expected_version, kiểm tra phân công lại ngay lúc lưu, giữ lịch sử mã hóa trước chỉnh sửa. Thay gói/địa bàn/phụ kiện làm báo giá cần xác nhận lại; không viết đè hợp đồng và lịch thanh toán cũ.
