# Thiết lập trang chủ

Tại **Admin → Giao diện trang chủ** (`/admin/appearance`), người có quyền `content.publish` và phiên MFA có thể cấu hình slide và thanh danh mục. Liên kết đến phần này cũng có trong Bảng giá và Nội dung & Ưu đãi.

- Có đúng **3 danh mục**. Tên đầy đủ tối đa 40 ký tự, tên hiển thị tối đa 12 ký tự và phải khác nhau. Chọn mọi gói, nhóm dịch vụ hoặc các gói cụ thể bằng checkbox. Khi kết hợp nhóm dịch vụ và gói cụ thể, danh mục bao gồm các gói khớp một trong hai điều kiện. Client chỉ hiển thị những gói đã được công bố.
- Có tối đa **12 slide**. Chọn ảnh đã tải lên và xử lý xong trong thư viện; đặt tên và ghi chú nội bộ, mô tả ảnh, link khi bấm, video MP4/WebM tùy chọn, gói tư vấn tùy chọn, thời gian áp dụng, bật/tắt và thứ tự. Client chỉ hiển thị slide bật và còn thời hạn. Không có slide hợp lệ thì hiển thị lời mời tư vấn trung tính.
- Nhấn **Lưu ưu đãi & danh mục**. Nếu một Admin khác vừa thay đổi cấu hình, tải lại trước khi lưu để tránh ghi đè.
- Bấm toàn bộ slide mở `href` đã cấu hình. Nếu để trống `href`, gói tư vấn đã công bố mở form đúng gói; không chọn gói thì mở bảng giá. Giá và ưu đãi theo địa bàn vẫn được quản lý ở Bảng giá; cấu hình slide không tự công bố gói hoặc tạo giá.

## API

`GET /api/v1/system/display-settings` trả cấu hình công khai và `version`. `POST` cùng URL gửi `expected_version` và những trường cần đổi; dùng phiên đăng nhập/MFA/CSRF hiện có. Phản hồi thành công gồm `success` và `settings`. Không gửi URL ảnh vào API: server xác nhận `image_id` và tạo URL ảnh.

`plan_categories` là mảng 3 đối tượng có `name`, `short_name`, `all_plans`, `services` và `plan_ids`. `services` dùng các giá trị `internet`, `business`, `combo`, `play`, `camera`; `plan_ids` là UUID gói.

`promo_slides` là mảng tối đa 12 đối tượng có `title` (1–80 ký tự), `description` (0–160), `image_id`, `image_alt` (0–120), `cta_label` (1–24, tương thích dữ liệu cũ, không hiển thị), `href` (0–300, đường dẫn nội bộ hoặc HTTPS), `video_url` (0–300, URL HTTPS MP4/WebM trực tiếp), `plan_id`, `enabled`, `start`, `end`. Các trường ID và thời gian có thể null. Thời gian ISO 8601 cần múi giờ; kết thúc phải sau bắt đầu. API trả thêm `image_url`, `image_width`, `image_height` do server xác định.

Client có điều khiển trước/sau, vuốt và tự chuyển tùy chọn; tự chuyển dừng khi focus/hover hoặc tab ẩn và tuân theo thiết lập giảm chuyển động. Thẻ giải pháp mobile có độ rộng 75% viewport, vuốt và lật để xem chi tiết. Footer mobile dùng hai nhóm liên kết và phần địa chỉ gập/mở.

Ảnh slide trang chủ phủ toàn bộ chiều ngang viewport, không bị giới hạn trong container hoặc cột nội dung. Chiều cao co theo tỷ lệ ảnh gốc trên mobile/desktop, không kéo méo hoặc cắt ảnh; không có tiêu đề, mô tả hoặc nút phủ ảnh hay nằm dưới ảnh. Tên/ghi chú chỉ dùng trong Admin và tên truy cập cho trình đọc màn hình. Video không tự tải: khách bấm Phát video ở hàng điều khiển, có thể dừng; video ẩn hoặc tab ẩn sẽ dừng phát. Ảnh thiết bị mặc định khi chưa tải banner vẫn giữ kích thước gọn. Nên tải banner ngang để vùng ưu đãi không quá cao.

Lời mời đo mạng nằm ngay dưới hero/slide; không nằm trong navbar desktop/mobile. Cấu hình navbar cũ có Đo tốc độ vẫn được đọc tương thích nhưng không hiển thị ở navbar.
