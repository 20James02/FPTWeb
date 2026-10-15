# Kiểm tra hệ số theo kỳ và lỗi thêm gói — 15/10/2026

## Kết quả điều tra

Backend hiện lưu hệ số, phí hòa mạng và phí thiết bị riêng theo `billing_months`. Kiểm thử mới xác nhận tạo cả ba kỳ cùng gói/địa bàn, sửa rồi khôi phục hệ số kỳ 6, công bố và lấy báo giá không làm thay đổi kỳ khác. Thiết bị đi kèm vẫn dùng chung ở cấp gói.

Form thêm gói có `pattern="[a-z0-9-]+"`. Chrome áp dụng chế độ Unicode `v` cho HTML pattern và báo `Invalid character class`, khiến kiểm tra mã bị bỏ qua. Mã viết hoa, có dấu, khoảng trắng hoặc dấu gạch dưới đi tiếp tới API rồi bị từ chối. Đây là một lỗi tái hiện được; chưa đủ bằng chứng khẳng định giải thích mọi trường hợp người dùng gặp.

Sửa dấu gạch ngang thành ký tự được escape trong HTML pattern. Thêm hướng dẫn định dạng ngay bên trường mã, `title`, liên kết `aria-describedby` và tắt tự viết hoa/kiểm tra chính tả. Giữ quy tắc API hiện tại: chữ thường ASCII, số, gạch ngang. Không đổi tên gói khách nhìn thấy.

## Bằng chứng

- `tests/e2e/plan_create_validation.cjs` trước sửa thất bại ở mã `GIGA`: `patternMismatch` sai là `false`.
- Sau sửa, kiểm tra mã sai bị chặn, giữ nội dung form, sửa mã rồi tạo nháp qua HTTP/FastAPI/PostgreSQL thật và nhìn thấy trong danh sách. Chromium 390px/1280px và WebKit 390px/1280px đều đạt; không có pageerror và không tràn ngang trang.
- `pytest -q tests/integration/test_pricing_period_independence.py tests/integration/test_card_period_pricing.py tests/integration/test_regional_pricing.py`: **23 passed**.
- Trước đó kiểm tra `test_card_period_pricing.py` và `test_catalog_intake.py`: **12 passed**; có bài trùng với nhóm 23 nên không cộng tổng.
- Ruff cho kiểm thử Python mới và Node syntax cho kiểm thử browser: đạt.

Giá giả để đối chiếu, đã gồm VAT và chưa có khuyến mãi/phụ kiện:

| Kỳ | Giá gốc | Hệ số | Cước tháng | Hòa mạng | Thiết bị | Tổng ban đầu |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 200.000 | 1 | 200.000 | 300.000 | 500.000 | 1.000.000 |
| 6 | 200.000 | 0,95 | 190.000 | 100.000 | 200.000 | 1.440.000 |
| 12 | 200.000 | 0,9 | 180.000 | 0 | 100.000 | 2.260.000 |

Đây là số kiểm thử, không phải bảng giá bán hàng.

## Phạm vi

Chạy với CSDL dùng một lần và Auth bên ngoài giả lập tại loopback cổng 8107, không sử dụng tài khoản hoặc dữ liệu khách hàng thật. Không sửa migration, secrets, quyền hoặc triển khai production. Không chạy toàn bộ pytest; thay đổi sản phẩm chỉ nằm ở kiểm tra mã gói trong template.

Mô hình quản lý ba kỳ, giá bình quân nhập riêng và thiết bị theo kỳ mới ở trạng thái [đề xuất](../../docs/admin/GIA-VA-THIET-BI-THEO-KY.md), chưa được triển khai.
