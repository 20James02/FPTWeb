# Trang khách, ảnh gói cước và đăng nhập Admin

**Mục tiêu:** Sửa 404 trang khách trên staging/production, quản lý ảnh riêng cho gói cước, chỉ mở MFA/khôi phục khi cần.

**Thiết kế đã xác định từ yêu cầu:** Giữ FastAPI/Jinja2. Gói nhận `image_id` và `image_alt`; server lấy ảnh R2 đã kiểm tra, ghi URL/kích thước vào bản nháp, công bố bằng cơ chế phiên bản hiện có. Không nhận URL ảnh tùy ý. Admin chọn ảnh thư viện hoặc tải lên trực tiếp R2 và xem trước; cho bỏ ảnh. Trang khách render ảnh từ snapshot đã công bố, tải lười, giữ tỷ lệ ảnh trên mobile. MFA chỉ xuất hiện sau phản hồi MFA_REQUIRED; khôi phục qua nút nhỏ, quay lại được bằng bàn phím.

- [x] Kiểm thử hồi quy 404 trong môi trường staging và production; giữ API Admin yêu cầu xác thực.
- [x] Kiểm thử ảnh ready/quarantine/sai ID, sửa nháp, công bố và bỏ ảnh; quyền và phiên bản hiện có vẫn áp dụng.
- [x] Sửa router và ngăn các banner demo chứa ưu đãi chưa xác nhận hiển thị trên môi trường triển khai.
- [x] Bổ sung backend liên kết ảnh và form Admin; render ảnh trong thẻ gói cước.
- [x] Kiểm thử thực tế Chrome desktop/mobile: đăng nhập thường, MFA, khôi phục, tải/chọn/xóa ảnh và thẻ khách.
- [x] Chạy pytest, browser contracts, lint; triển khai candidate, kiểm chứng rồi cập nhật domain đã được người dùng cho phép triển khai.

**Giới hạn:** Không bịa ảnh/giá, không gửi email khôi phục thật trong kiểm thử, không đổi secrets, không thêm bảng SQL vì metadata JSON hiện có hỗ trợ liên kết ảnh. Ảnh cần quyền content.write để chọn/tải; lưu gói cần catalog.write.

**Kiểm chứng trước deploy:** 208 pytest đạt, 11 JavaScript contracts đạt, Chrome mobile 360/390/430 và desktop 1440 đạt; MFA/back, phản hồi đăng nhập chậm, thư viện ảnh, upload file qua signed PUT và finalize WebP chạy trong fixture SQL thật/Auth-S3 mô phỏng. Reviewer độc lập phát hiện lựa chọn/bỏ ảnh bị kết quả upload đến chậm ghi đè; đã khóa chọn/bỏ trong khi upload và kiểm thử red→green. Không gửi email hoặc lead lên cloud trong đợt này.

**Deploy xác nhận:** `dpl_4HiR2udXH8L4BUFhVxMt77P7f4Sb` đã promote, domain https://fpt-web-ten.vercel.app trả 200 cho các trang khách/admin login; API admin chưa xác thực 401.
