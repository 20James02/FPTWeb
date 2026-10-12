# Danh sách gói và bảng giá Admin — 09/10/2026

## Nguyên nhân và sửa lỗi

`renderPricing()` sử dụng biến cục bộ `const window` cho ô thời gian hiệu lực, trong khi cùng vòng lặp gọi `window.PageFPTAdminLists.bindRow()`. Biến cục bộ che đối tượng trình duyệt và chưa được khởi tạo khi gọi, gây `Cannot access 'window' before initialization` khi có bản ghi giá.

Đổi tên ô thành `effectiveDates`. Sau đó kiểm thử phát hiện lỗi kế tiếp: vòng lặp gói cước gọi `bindRow(item)` trước khi khai báo `item`, với metadata nhầm `regions`. Loại bỏ lần gọi thừa này; giữ lần gắn metadata `plans` sau khi tạo hàng. Không đổi dữ liệu hay API.

## Bằng chứng kiểm thử

- `tests/e2e/pricing_list_regression.cjs` đã thất bại với đúng `Cannot access 'window' before initialization` trước khi sửa.
- Chỉ sửa tên `window`: kiểm thử tiếp tục thất bại với `Cannot access 'item' before initialization`.
- Sau cả hai sửa lỗi: Chromium và WebKit đạt kiểm tra giá có dữ liệu, gói có dữ liệu, metadata thao tác hàng loạt đúng loại, chuyển tab, tìm kiếm và trường hợp không có bản ghi giá.
- Với `PAGEFPT_QA_SERVER=1`, cùng kiểm thử dùng máy chủ 8098 và CSDL dùng một lần: đăng nhập MFA giả lập, tải trang thật `/admin/pricing`, tạo gói/giá qua API, mở form sửa gói/giá, công bố gói/giá bằng nút trên giao diện và kiểm tra checkbox xuất hiện. Chromium và WebKit đều đạt.
- 17 kiểm tra JavaScript trong `tests/contracts/*.mjs` đạt.
- `tests/e2e/card_periods.cjs` Chromium đạt 9 nhóm kiểm tra hiện hành, gồm kỳ hạn, phụ kiện, đăng ký, ảnh, bố cục và trình biên tập.
- `node --check` cho mã sửa và kiểm thử đạt. Kiểm tra định dạng Prettier đạt.

Kiểm thử trình duyệt chỉ tạo dữ liệu giả trên môi trường riêng, không tạo dữ liệu khách trên production. Không chạy lại toàn bộ pytest vì thay đổi chỉ nằm trong hàm dựng danh sách JavaScript.

## Triển khai

Bản ứng viên Vercel: `dpl_uWLmZS3NvnBtpMDwMiVFbtR7v47W`, `https://fpt-kihfw8mzg-pettravel.vercel.app`, trạng thái `READY`. Upload 236 file (2.409.424 byte); kiểm tra danh sách upload loại trừ `.local`, secrets, CSDL, môi trường Python và dữ liệu kiểm thử. Không dùng archive.

Ứng viên đạt 63 kiểm tra route, tài nguyên và quyền truy cập. Đã promote vào `https://fpt-vungtau.com`; tên miền đạt 65 kiểm tra, bao gồm hash SHA256 của `pricing.js` trùng mã đã sửa. Inspect tên miền xác nhận đúng deployment trên, trạng thái `READY`.

Không đổi schema, cấu hình kết nối hay credentials. Không tự commit/push. Máy chủ kiểm thử riêng đã dừng và dọn CSDL dùng một lần; không tác động server 8000.
