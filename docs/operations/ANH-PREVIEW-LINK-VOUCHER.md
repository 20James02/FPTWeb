# Ảnh xem trước của link voucher

Cập nhật 16/10/2026. Mỗi link `/s/ma-link` có một ảnh riêng; sửa ảnh không sửa giá, ưu đãi, gói hay trang đích.

## Thao tác trong Admin

1. Mở **Voucher & Link chia sẻ**, chọn voucher → **Thiết lập**.
2. Ở **Link chia sẻ & Mã QR Marketing**, bấm **Sửa** tại link đã tạo, hoặc điền mã link mới.
3. Ở **Ảnh xem trước khi chia sẻ**, tải JPEG/PNG/WebP tối đa 10 MB hoặc dán URL HTTPS công khai. Gợi ý ảnh ngang 1200 × 630 px; đây là gợi ý bố cục, không ép cắt ảnh.
4. Kiểm tra khung xem trước, bấm **Lưu thay đổi link**. Muốn bỏ ảnh riêng, bấm **Dùng ảnh mặc định**, rồi lưu.
5. Sao chép đúng link ngắn `/s/...` để chia sẻ. Link đang tắt vẫn giữ trạng thái tắt khi lưu ảnh.

Tải ảnh dùng cơ chế R2 hiện có: upload intent có thời hạn → vùng quarantine → server kiểm tra ảnh → ảnh WebP công khai với tên hash. Cần quyền `content.write` để tải ảnh; quyền `marketing.write` để lưu link. Không nhập URL ảnh riêng tư, URL ký có thời hạn hoặc chứa khóa truy cập.

## Cơ chế

- `POST /api/v1/admin/vouchers/{id}/links` nhận trường tùy chọn `preview_image_url`: URL HTTPS công khai hoặc đường dẫn `/static/`.
- Bỏ trường khỏi request: giữ ảnh đã lưu để tương thích client cũ. Chuỗi rỗng hoặc `null`: bỏ ảnh riêng. `GET /api/v1/admin/vouchers` trả ảnh trong từng phần tử `links`.
- Trình lấy preview được nhận diện từ User-Agent nhận HTML200 với metadata Open Graph/Twitter được render phía server; không phải ảnh gắn bằng JavaScript sau tải trang. Tên/mô tả dùng nội dung voucher đã công bố trong thời gian hiệu lực; bản nháp dùng nội dung tư vấn chung.
- Khách bấm link vẫn nhận302 tới trang đích có `pf_offer`, cùng cookie ưu đãi hiện có. Link tắt/không tồn tại hoặc trang đích không khả dụng trả404.
- Các lượt crawler được ghi vào nhóm bot, tách khỏi click khách (`raw_clicks - bot_clicks`), không tạo phiên đo lường hoặc nhận voucher. Nhận diện User-Agent là ước tính, không chứng minh người thật.
- Response có `Vary: User-Agent`, `Cache-Control: private, no-store`. Chỉ trả ảnh và nội dung công khai; không trả ngân sách, ghi chú nội bộ hay nhân viên.

## Khi nền tảng vẫn hiện ảnh cũ

Khung trong Admin là mô phỏng. Kích thước/cách cắt thực tế do ứng dụng chia sẻ quyết định. Nền tảng có thể lưu cache riêng dù website đã đổi ảnh. Với Facebook có thể dùng Sharing Debugger để yêu cầu lấy lại; nếu nền tảng khác không có công cụ làm mới, chờ cache hoặc tạo một mã link mới. Kiểm tra ảnh có thể mở công khai, không cần đăng nhập và không bị hotlink protection.

Tham chiếu chuẩn metadata: https://ogp.me/ .
