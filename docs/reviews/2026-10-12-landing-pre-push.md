# Kiểm tra trước khi push — 12/10/2026

Phạm vi: thay đổi landing do người dùng chỉnh sửa và các phần backend, Admin,
client, migration, tài liệu và kiểm thử đang chờ commit trong dự án PageFPT.
Giữ kiến trúc Python/FastAPI + Jinja2 + JavaScript hiện có.

## Các lỗi đã sửa trong đợt kiểm tra

- Phản hồi lưu chậm bị áp dụng vào landing khác khi đổi trang; dữ liệu nhập thêm
  trong lúc lưu bị đánh dấu đã lưu. Cố định đích lưu, kiểm tra phiên editor và
  giữ trạng thái chưa lưu cho thay đổi đến sau.
- Nút sắp xếp sidebar gọi hàm không tồn tại; Undo danh sách tính năng trả về chuỗi
  thay vì mảng. Sửa đường cập nhật và chỉ ghi một snapshot cho dữ liệu đã chuẩn hóa.
- Xóa số suất ưu đãi ghi cả `0` và `null`, khiến Undo trả về số suất sai. Số trống
  nay giữ `null`; Undo khôi phục số cũ.
- Upload/xóa ảnh ghi ID và URL thành hai thao tác Undo. Nay cập nhật nguyên tử,
  tránh hình xem trước khác ID ảnh sẽ lưu. Chặn dựng lại editor khi ảnh đang tải.
- Link xem trước trỏ vào trang chưa công bố; khôi phục deep-link tới đúng trang
  Admin, kể cả trang không nằm trong 100 bản ghi đầu.
- Nhập số điện thoại `+84` bị cắt; giữ giá trị nhập và hỗ trợ chuẩn số Việt Nam
  ở form gửi tư vấn dùng chung.
- “Đổi gói” truy cập phần tử không tồn tại trên landing; chọn đúng khối gói của
  trang chủ, landing hoặc trang đo mạng.
- Preset tự tạo thời hạn, số suất và mức giảm chưa được Admin xác nhận; preset
  nay chỉ thay nội dung trình bày, giữ nguyên dữ liệu ưu đãi và giá.
- Bỏ lời hứa lắp đặt/tư vấn tự chèn; nội dung hero dùng dữ liệu Admin.
- Chặn thứ tự khối trùng/không hợp lệ; bổ sung khối thiếu khi nhận danh sách ngắn.
- Thu hẹp selector theme tối và sửa tương phản input/bảng; tránh tác động lên
  popup có nền sáng.
- Kết nối tùy chọn hero split/centered/minimal và gói grid/carousel/list với
  giao diện thiết lập, render và preview.
- Sửa tràn ngang Admin ở 320px, chuyển tab thiết lập/preview trên màn hình nhỏ,
  và bố trí tên khối/điều khiển thành hai hàng để tránh ép mất chữ.
- Giữ bộ lọc danh sách sau refresh; đồng bộ aria-selected của tab.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ Python/SQL/API | 417 passed, 151,50 giây |
| JavaScript contracts | 26/26 passed |
| Landing studio regression | 15 ca passed, gồm delayed save, Undo/Redo, upload, layout, contrast, responsive |
| Telecom landing | Passed: draft/publish, báo giá địa bàn, kỳ 1/6/12, phụ kiện, lead, upload, popup, kích thước thẻ |
| Landing campaign | Passed: giá riêng từng kỳ, nhãn, thời hạn/số suất, liên hệ/footer, báo giá server, carousel, keyboard |
| Admin workbench | Passed: MFA fixture, lead vào SQL, deep-link, refresh/charts, 12 viewport |
| Reference cards | Passed: upload, giá/phụ kiện, popup, đăng ký, 12 viewport |
| IP pricing | Passed: 9 bố cục, giá tỉnh/xã, ưu tiên vị trí lưu, loại phản hồi đến muộn |
| Ruff check/format | Passed; 175 Python files formatted |
| mypy và architecture | Passed; 102 source files |
| Wheel | Build và smoke import/templates/static/ASGI health passed |
| Hợp đồng frontend/OpenAPI | Xuất lại: 153 paths, 192 operations, 85 schemas |
| Secret pattern scan | Không thấy các mẫu khóa/token được kiểm tra trong 350 file văn bản; không có file trên 40 MB |

Thêm bộ regression studio vào GitHub Actions. Trong kiểm thử campaign, chọn
“Từ chối” cookie trước khi thử nút liên hệ cố định; không bỏ qua banner bằng
force click. Logs, screenshots và dữ liệu tổng hợp ở `.local/qa/pre-push-2026-10-12/`,
không đưa vào Git. Đã xem ảnh chụp Admin và landing mobile.

Reviewer độc lập kiểm tra mã các sửa đổi và kết luận không còn lỗi chặn push
trong phạm vi này; kết quả runtime do các suite ở trên xác nhận.

## Giới hạn phát hành

Kiểm thử sử dụng PostgreSQL disposable, Auth/media fixture và viewport Chromium.
Không khẳng định đã thử Safari trên iPhone thật, R2 thật hoặc GA4/Ads từ xa.
Push Git không xác nhận database production đã áp dụng migration hay Vercel đã
triển khai thành công. Migration `20261010060000_audit_scaling.sql` nằm trong
thay đổi cần kiểm tra trạng thái trên Supabase trước khi phát hành nâng cấp này.
Đợt này không chạy migration hoặc deploy production.
