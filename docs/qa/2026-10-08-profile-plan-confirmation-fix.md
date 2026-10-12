# Sửa xác nhận địa chỉ khi chọn gói — 08/10/2026

## Tái hiện và nguyên nhân

Production có hai PUT profile trả 422. Không in hoặc sao chép tên, điện thoại, địa chỉ vào log QA. Fixture browser tái hiện bằng chọn tên gói trong hồ sơ rồi lưu địa chỉ: API trả `VALIDATION_ERROR`, `fields.body.plan_id = uuid_parsing`.

Helper options trong `admin/profile.js` dùng `item.code ?? item.id` cho mọi danh sách. Mã hành chính của tỉnh/xã là số; mã gói là chuỗi như `qa-synthetic-plan`, còn API profile cần UUID gói. Chọn gói vì vậy gửi sai loại dữ liệu; cũng khiến lọc phụ kiện không tìm được gói tương ứng và gói đã lưu không được chọn lại khi mở form. Bài browser trước đó xác nhận địa chỉ với gói trống nên không bắt được trường hợp này.

## Sửa

- Helper nhận khóa riêng: tỉnh/xã dùng `code`, gói dùng `id`. API/backend và kiểm tra UUID giữ nguyên.
- Thông báo lỗi profile dùng tiếng Việt theo mã/field, thay thông báo mặc định tiếng Anh; không xuất nội dung nhập hoặc số điện thoại vào lỗi.
- Browser test chọn gói bằng nhãn (như thao tác khách), chọn phụ kiện tương thích, lưu qua API thật và kiểm tra UUID/giá snapshot/điện thoại bất biến; mở lại form kiểm tra gói và thiết bị giữ nguyên.
- Mô phỏng 422 để kiểm tra thông báo rõ và tên/địa chỉ/checkbox còn nguyên cho người dùng sửa rồi gửi lại.

## Bằng chứng

- Trước sửa: browser trả 422 `uuid_parsing`; sau đổi khóa: cùng thao tác lưu 200.
- Thông báo: trước sửa bài kiểm tra tiếng Việt thất bại; sau sửa qua và bản nhập được giữ.
- 10 integration tests profile/accessories qua, 7.02s; 16 bộ JS contracts qua.
- Chromium và WebKit browser qua, gồm profile chọn gói/thiết bị, lựa chọn được giữ khi mở lại, thông báo validation/draft và consent A/B hồi quy. Bản build READY `dpl_DxQPHi7Pas2EWXoHiDZFWQaHR4xN` qua 50 kiểm tra candidate rồi promote thành công. Tên miền `https://fpt-vungtau.com` qua 52 kiểm tra HTTP/SHA256; `vercel inspect` xác nhận đúng deployment READY. Không cần migration hoặc thay đổi biến môi trường cho bản sửa này.
- Test tạo dữ liệu giả ở PostgreSQL dùng một lần; không sửa hồ sơ khách thật để nghiệm thu.
