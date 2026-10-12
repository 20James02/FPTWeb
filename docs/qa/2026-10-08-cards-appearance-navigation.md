# Thẻ gói và thiết lập giao diện — 08/10/2026

## Đã triển khai trong mã nguồn

- Admin tách Slide & giao diện và Menu điều hướng khỏi trang hệ thống. Slide thêm/sửa/xóa/sắp xếp, tải ảnh trực tiếp qua intent/PUT/finalize và xem trước bản đang nhập. Danh mục thu gọn để giảm chiều dài trang mobile. Lưu giữ CAS/kiểm tra quyền; không ghi đè cấu hình đã thay đổi từ nơi khác.
- Menu thêm/sửa/xóa/bật tắt/sắp xếp, tối đa 12 mục, 12 liên kết con mỗi mục. Chỉ URL tương đối an toàn hoặc HTTPS, không HTML tùy ý. Giữ menu dịch vụ và hình minh họa mặc định khi dùng preset.
- Phụ kiện có giá gốc, giá thực thu, nhãn ưu đãi, tính một lần/tháng và upload/preview. Nhãn thẻ gói chỉnh được. Thẻ cố định 650px, ảnh full viền195px; nội dung đầy đủ trong dialog.
- Giá tháng = giá gốc × hệ số, làm tròn VND rồi nhân kỳ. API trả preview ba kỳ trong một lượt đọc DB, chỉ lưu/ký kỳ đang chọn. CSV không làm mất hệ số. Đăng ký giữ gói, kỳ và phụ kiện.
- Snapshot giá mới từ máy chủ cập nhật cả thẻ và popup; revision cũ, preview hết hạn và gói không khả dụng không còn hiển thị giá cũ.

## Kiểm chứng

- pytest toàn bộ: **339 passed**, 97.21s.
- Ruff, mypy (99 source files), architecture (99 files) đạt. 17 bộ contracts JavaScript đạt; snapshot và cache-unavailable có bằng chứng RED→GREEN.
- Browser Chromium + WebKit: CRUD phụ kiện/ảnh/ưu đãi, đóng/mở lại khi upload còn chạy, slide upload/preview/lưu, menu và submenu mobile/CAS, đổi kỳ và checkbox lập tức, popup mô tả/focus, ảnh30%, chiều cao đồng nhất, đăng ký12tháng. Độ rộng320/390/430/768/1440.
- Hồi quy home_mobile trên cả Chromium và WebKit đạt320/360/390/430/768/1440, không tràn ngang, slider/danh mục/quy trình/footer.
- Dữ liệu nghiệm thu là dữ liệu giả trong PostgreSQL dùng một lần, ảnh R2 được mô phỏng; không gửi form khách hàng giả vào production.
- Migration remote `20261008075211_plan_card_period_pricing`: thành công;36 bản ghi giá cũ vẫn có hệ số1,0 hệ số không hợp lệ. Không tự đặt giá/ưu đãi kinh doanh.
- Supabase advisors không có ERROR; còn WARN có sẵn: Auth leaked-password protection và2 duplicate-index, không thuộc thay đổi giao diện.

## Triển khai

Candidate READY `dpl_kEZU2DtnAkUwuBCmyjTJLDdLatAV` (fpt-dszlbvso4-pettravel.vercel.app) qua56 checks; promote thành công. Tên miền https://fpt-vungtau.com qua58 checks HTTP/SHA256, inspect xác nhận cùng deployment READY. Upload thường đã kiểm tra224 tệp có nội dung, tổng2,164,746bytes, không có .env/.local/.venv/.git, credentials, tests/docs/migrations trong upload. Một lần thử --archive=tgz đóng gói476.2MB/13,107files đã bị hủy/xóa, không promote lên tên miền; không dùng lại tùy chọn này. Dry inventory cho thấy .local được giữ như thư mục rỗng; đóng gói tar đã đi vào thư mục này. Đã sửa .vercelignore dùng tên thư mục không có dấu / cuối: dry mới227 entries, không còn entry thư mục riêng tư hoặc credentials. Không có bằng chứng dữ liệu được truy cập từ bên ngoài; bản dư tệp được xóa bằng Vercel remove trước khi promote.

Tài liệu chính thức đã đối chiếu: [Vercel deploy](https://vercel.com/docs/cli/deploy), [Vercel promote](https://vercel.com/docs/cli/promote), [Supabase database functions](https://supabase.com/docs/guides/database/functions).
