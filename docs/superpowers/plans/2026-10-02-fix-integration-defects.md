# Sửa các lỗi F-01 đến F-05

Phạm vi đã được người dùng yêu cầu: sửa năm lỗi tái hiện trong báo cáo 01/10/2026, giữ kiến trúc Python/FastAPI/Jinja2 và giao diện hiện có. Triển khai trực tiếp trong phiên này; không triển khai production hoặc dùng dữ liệu khách thật.

1. **F-01:** bảng giá render tên bằng node/textContent. Regression: tên có HTML vẫn hiển thị nhưng không thực thi handler. Sửa tương tự nhãn khu vực đang dùng innerHTML với dữ liệu danh mục.
2. **F-02:** render card từ plan đã publish, giữ slider/flip. CTA mang UUID và tên qua data attributes. Giá lấy qua quote theo khu vực, không giữ chuỗi giá mẫu trong CTA. Form xóa lựa chọn/quote cũ, chống response đến sai thứ tự và đợi quote đang tải trước khi submit. Regression: chọn card → quote → gửi lead → đọc đúng plan/snapshot; đổi khu vực và gửi lại mạng lỗi; danh mục rỗng và plan chưa publish.
3. **F-03:** caller và mặc định dùng `callback`; giữ version/timezone. Regression browser tạo lịch và đọc lại SQL.
4. **F-04:** chỉnh container/grid item đúng nguồn gây tràn; không che toàn document. Regression: ma trận 48 viewport và mobile form.
5. **F-05:** thay recovery giả bằng request email OTP và một endpoint hoàn tất: server verify OTP recovery, xác minh JWT/membership/MFA nếu bật, cập nhật mật khẩu qua provider. Token không trả cho browser. UI bước nhập mã chỉ thu thập mã; chỉ xác nhận đổi sau response thành công. Có rate limit, same-origin, xử lý provider lỗi và thu hồi phiên cũ. Email recovery template phải cung cấp OTP; ghi hướng dẫn cấu hình SMTP/template. Regression: OTP sai/hết hạn/replay, MFA thiếu/sai, provider timeout/429, tài khoản bị thu hồi và token không lộ.

Kiểm chứng cuối: full pytest, Ruff/mypy/import rules, browser API contracts, integrated/diagnostic, mobile form, build/wheel. Lưu bằng chứng mới trong `docs/qa/2026-10-02`; giữ báo cáo cũ làm baseline. Kết nối cloud chưa có credentials vẫn được ghi là chưa xác nhận.
