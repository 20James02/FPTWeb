# Phụ kiện, sửa hồ sơ và ngày tháng — 08/10/2026

## Thiết lập và hiển thị phụ kiện

Vào **Sản phẩm & phụ kiện**: tạo tên/mã, nhóm dịch vụ, giá cuối cùng (VND), cách tính **một lần** hoặc **theo tháng**, ảnh đã tải lên và các gói áp dụng. Danh sách gói để trống nghĩa là áp dụng cho mọi gói cùng nhóm dịch vụ. Lưu nháp rồi công bố; ngừng sử dụng sẽ bỏ phụ kiện khỏi danh sách khách chọn. Có chọn nhiều bản ghi để công bố/ngừng sử dụng; xung đột phiên bản báo lỗi từng bản ghi.

Khách chọn thiết bị trong thẻ gói: tổng ước tính thay đổi ngay; hệ thống lấy báo giá có chữ ký từ server theo địa bàn và kỳ 1/6/12 tháng. Phụ kiện theo tháng nhân với số tháng trả trước; phụ kiện một lần chỉ cộng một lần. Giá thiết bị là giá cuối cùng, không áp VAT/giảm giá gói thêm lần nữa. Nếu chưa có giá gói tại địa bàn, giao diện yêu cầu tư vấn, không đưa ra tổng đã xác nhận.

- `GET /api/v1/accessories`: danh sách phụ kiện có giá đã công bố.
- `POST /api/v1/quotes`: `plan_id`, `region_id`, `billing_months`, `accessory_ids` (UUID[], tối đa 20, không trùng).
- `POST /api/v1/leads`: giữ contract hiện có và thêm `accessory_ids`. Không gửi giá từ client. Server lưu ảnh chụp tên/giá/cách tính/phiên bản phụ kiện vào hồ sơ. Giữ `Idempotency-Key` khi retry cùng một yêu cầu.
- Admin CRUD: `/api/v1/admin/products`, `/{id}`, `/{id}/publish`, `/{id}/retire`; sửa/công bố/ngừng có `expected_version` theo contract chung.

## Nhân viên sửa và xác nhận hồ sơ

Vào **Lead CRM → Hồ sơ khách → Sửa hồ sơ & xác nhận địa chỉ**. Nhân viên được phân công có quyền `lead.write` và `lead.pii`, đã xác minh MFA, được sửa tên, địa chỉ cụ thể, tỉnh/thành, xã/phường, gói và phụ kiện. Quyền quản trị toàn bộ lead vẫn theo cấu hình hiện hành. Server kiểm tra phân công ở cả lúc đọc và lúc lưu; số điện thoại chỉ đọc và không được nhận trong payload cập nhật.

1. Đọc `GET /api/v1/admin/leads/{id}/profile` → `lead`, `pii` (chỉ người có quyền).
2. `GET /api/v1/admin/address-options` lấy tỉnh/thành; thêm `?province_code=...` lấy xã/phường. Đây là mã hành chính số, không phải UUID vùng giá. Dữ liệu dùng nguồn địa giới hành chính hiện có, có cache và dữ liệu dự phòng; response `source` cho biết nguồn/thời gian/cảnh báo. Không gửi địa chỉ khách ra API địa giới.
3. `PUT /api/v1/admin/leads/{id}/profile`: `expected_version`, `name`, `installation_address`, `province_code`, `ward_code`, `plan_id` (UUID hoặc null), `accessory_ids`.
4. API kiểm tra xã/phường thuộc tỉnh, thiết bị tương thích với gói đang công bố. Nếu đã có vùng giá công bố theo mã tương ứng thì liên kết UUID xã/phường, sau đó tỉnh; nếu chưa có, giữ địa chỉ đã xác nhận để tư vấn và không bịa vùng giá.

`409 VERSION_CONFLICT` giữ bản nhập để người dùng tải lại hồ sơ trước khi lưu. Đổi gói/thiết bị/địa bàn làm báo giá cần xác nhận lại; không tự thay hợp đồng và lịch thanh toán đã chốt. Lịch sử trước sửa được mã hóa; nhật ký thao tác chỉ ghi tên trường thay đổi, không ghi số điện thoại/địa chỉ thô.

## Ngày tháng và danh sách

Mọi trường ngày hiển thị/nhập **dd/mm/yyyy**; thời điểm có giờ dùng **dd/mm/yyyy HH:mm**. Nút lịch hỗ trợ chọn ngày. JavaScript `PageFPTDates` chuyển giá trị sang ISO trước khi gọi API; API và cơ sở dữ liệu giữ ISO với múi giờ hiện hành. Không đổi timezone bằng cách đảo chuỗi ngày.

Các bảng Admin có nút ở tiêu đề cột để sắp xếp tăng/giảm. Checkbox và “Chọn tất cả đang hiển thị” áp dụng cho phần danh sách đã tải/lọc; không ngầm chọn toàn bộ dữ liệu chưa tải. Bảng báo cáo chỉ hỗ trợ chọn/sắp xếp; thao tác thay đổi chỉ xuất hiện trên danh sách có API và quyền tương ứng. Thao tác hàng loạt có xác nhận, tối đa hai request đồng thời, báo kết quả riêng và giữ lựa chọn bị lỗi.
