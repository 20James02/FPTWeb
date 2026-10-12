# Kiểm tra hàng loạt bảng giá và danh sách gói — 09/10/2026

## Phạm vi và kết quả tại máy kiểm thử

- Sửa thanh hàng loạt giữ nhầm nhóm `table-0` khi bảng ban đầu trống; gán nhóm `prices`/`plans` trước khi render và thay thanh công cụ nếu nhóm thay đổi.
- Mặc định ẩn gói đã ngừng, giá đã ngừng và giá của gói đã ngừng. Có bộ lọc lịch sử **Đã ngừng** và **Tất cả · gồm đã ngừng**; không xóa dữ liệu.
- Bỏ lựa chọn bị loại khỏi bộ lọc; đồng bộ checkbox đầu bảng (đầy đủ/một phần/trống). Gắn checkbox ngay sau render, tránh nút hàng loạt chạy khi dòng mới chưa có checkbox.
- Giữ phiên bản đã chọn sau refresh, kể cả khi dùng checkbox đầu bảng để chọn thêm dòng. Dòng lỗi giữ lựa chọn; thành công bỏ chọn. Công bố bỏ qua giá đã công bố/gói không có thay đổi và giá của gói đã ngừng.

Hai lỗi được xác nhận bằng regression trước khi sửa: thanh công cụ mang nhóm `table-0` thay vì `prices`; header chọn tất cả đổi phiên bản lựa chọn cũ từ 1 thành 2. Kiểm tra mới dùng renderer/helper thật, không sao chép thuật toán.

| Kiểm tra | Kết quả |
|---|---|
| Full pytest | 365 passed, 464.06s |
| Ruff / mypy | Passed / 101 source files |
| JavaScript contracts | 17 file passed |
| `pricing_bulk.cjs` Chromium desktop 1440px | Passed |
| `pricing_bulk.cjs` WebKit mobile 390px | Passed |
| `pricing_list_regression.cjs` Chromium + WebKit | Passed cả 2 |
| `admin_bulk.cjs` | Passed — kiểm tra hồi quy helper dùng chung trên phụ kiện |
| `admin_list_tools.cjs` | Passed — sắp xếp số/ngày hai chiều, tiêu đề ổn định |
| JavaScript syntax | `pricing.js`, `list_tools.js` passed |

Kiểm thử trình duyệt có phiên Admin MFA dùng Auth giả trong fixture riêng tại cổng8098, nhưng chạy HTTP/FastAPI và PostgreSQL thật. Dữ liệu giả: 3 gói, 2 giá; tạo/công bố/ngừng qua API thật trong fixture. Xung đột gói sau chỉnh sửa đồng thời cho kết quả1/2: dòng lỗi giữ version cũ, bỏ chọn/chọn lại rồi công bố được1/1. Hai gói đã công bố không thay đổi được bỏ qua khi bấm công bố lại. Cả bảng giá và gói được ngừng hàng loạt, biến mất khỏi mặc định và xuất hiện trong bộ lọc lịch sử. Không tạo lead/gói/giá thử nghiệm ở production.

Phạm vi thao tác là bản ghi đã tải, khớp bộ lọc. API tiếp tục trả lịch sử theo quyền tài khoản; ẩn mặc định thực hiện ở giao diện. Không thay migration, RLS, MFA hoặc quyền server.

## Triển khai

Kiểm kê upload: 238 file, 2.457.641 byte; `.env*`, `.local`, virtualenv, mã kiểm thử và migration bị loại khỏi upload. Dùng upload thường, không archive. Quy trình theo [Vercel deploy](https://vercel.com/docs/cli/deploy) và [promote](https://vercel.com/docs/cli/promote).

Candidate `dpl_CBAtbyPP8w1ZRknzTue5o3BvTtds`, `https://fpt-drm7l8xq0-pettravel.vercel.app`, trạng thái READY, đạt67 kiểm tra HTTP và asset trước promote. Đã promote vào project `pettravel/fpt-web`; tên miền `https://fpt-vungtau.com` được inspect xác nhận trỏ đúng deployment này, READY.

Sau promote đạt69 kiểm tra trên tên miền chính: public routes, redirect khi chưa đăng nhập Admin, API Admin trả401, redirect www và SHA256 static assets khớp nguồn (bao gồm `admin/pricing.js` và `admin/list_tools.js`). Không đăng nhập tài khoản thật hoặc thực hiện ghi dữ liệu nghiệp vụ production trong kiểm tra cloud. Máy chủ QA riêng đã được dừng sau kiểm thử.

CLI báo lỗi kiểm tra phiên bản mới từ npm trong nền; deploy/promote vẫn exit0, và trạng thái cùng các kiểm tra HTTP đã xác nhận độc lập. Không cần thay secrets hoặc cập nhật database cho bản sửa này. Deployment trước để quay lại khi cần: `dpl_9RCDN3RJvw7PBV6eqTfGYpSBDJ9J`.
