# Rà soát giao diện, form, thương hiệu và liên hệ — 2026-10-06

Phạm vi: giao diện khách hàng và toàn bộ nhóm chức năng Admin; giữ FastAPI/Jinja2, JavaScript nhẹ, Supabase/R2 và cơ chế phân quyền hiện có. Áp dụng ui-ux-pro-max và fixing-accessibility: nhãn rõ, ô nhập 16px/46px, nút thao tác chính từ 44px, tương phản, focus, dialog có bàn phím và mobile.

## Thay đổi

- Admin dùng stylesheet chung `admin-forms.css`. Các trang CRM, cài đặt, báo cáo, Marketing, nội dung, vận hành và form tạo/sửa có bề mặt, khoảng cách và trường nhập nhất quán. Bảng dữ liệu cuộn trong vùng riêng. Sidebar không gạch chân; mục đang chọn có dấu nhận diện.
- Hộp thoại workspace vốn mở ở x=0/y=0 đã được căn giữa. Thêm nhãn cho lịch hẹn và ghi chú CRM; thông báo trạng thái lưu hiển thị ngay trong form. Các select bắt buộc có lựa chọn hướng dẫn; nhãn bắt buộc có dấu `*`.
- Dialog lý do và phân công, xác nhận công bố/ngừng/retry/yêu cầu dữ liệu dùng cùng giao diện. Hủy/Escape trả về kết quả hủy; không tự thực thi. Xác nhận xóa giữ lời nhắc không thể hoàn tác, màu cảnh báo; quyền/MFA của API không thay đổi.
- Logo client desktop/mobile/footer dùng đúng SVG tải từ website FPT Telecom. Không dựng logo bằng các chữ F/P/T riêng. Hiệu ứng Admin áp dụng cho nguyên artwork, giữ tỉ lệ/hình dạng; tắt hiệu ứng và reduced motion được kiểm tra bằng computed CSS.
- Số tư vấn mặc định `0868.247.625`. **Admin → Cài đặt & Trạng thái → Hiển thị website → Số điện thoại tư vấn → Lưu cài đặt giao diện**. API POST `/api/v1/system/display-settings` nhận `expected_version` và `contact_phone`, yêu cầu `content.publish` + MFA. Chuẩn hóa dấu cách/dấu chấm/+84; loại URI, ký tự lạ và số sai định dạng. Số đã chuẩn hóa lưu trong cấu hình bền vững; mọi nút gọi và Zalo client dùng cùng cấu hình. `contact_phone_display` là giá trị trả về được suy ra, không ghi vào payload.
- Các menu Internet, FPT Play và Camera có ảnh 3D nền trong suốt trong thẻ nhận tư vấn, cả desktop và mobile. Card gửi đúng dịch vụ tới form ngắn; ảnh ghi rõ là minh họa, thiết bị tùy gói. Không thay ảnh gói cước do Admin chọn.
- Menu desktop dùng click, Enter, ArrowDown và Escape. Drawer mobile có focus trap, accordion có `aria-expanded`/`aria-controls`; nội dung đóng dùng `inert`. Bốn sheet tư vấn/quiz/so sánh/biên nhận có focus, Tab và Escape nhất quán.
- Sửa tràn ngang từ nền trang đăng nhập và lưới tiện ích 1024px. Giảm chuyển động theo lựa chọn hệ thống; AOS không để nội dung ẩn với reduced motion. Hủy focus trễ khi form tư vấn đã đóng.
- Liên kết thông tin dữ liệu mở trang riêng thay vì trang chủ; form có liên kết đọc thông tin. Đây là mô tả hành vi đang triển khai, không phải kết quả chứng nhận pháp lý. Bỏ nhãn tự tuyên bố tuân thủ luật và mức mã hóa cụ thể chưa kiểm chứng. Nội dung navbar dùng tư vấn theo gói, tránh cam kết thiết bị/bản quyền/bảo hành cố định chưa có trong danh mục.

## Nguồn tài nguyên

Logo: [SVG chính thức trên fpt.vn](https://fpt.vn/frontend_layout_2025_vibecode/assets/images/logo-ftel.svg). SHA256: `a8d4566ef62462d0bb9afe6908eca7e9ba86803a3a81a6369f478311b32c28ed`. Lưu tại `src/pagefpt/static/images/fpt-telecom-logo.svg`.

Ba ảnh tạo bằng imagegen, là thiết bị chung để minh họa, không phải ảnh sản phẩm FPT có model cụ thể. Prompt chung: square realistic 3D product render, centered whole device, generous transparent margins, soft studio lighting, matte materials, subtle orange accents, no text/logo/watermark. Đối tượng lần lượt: Wi-Fi router trắng với hai antenna; đầu thu đen và remote giọng nói; camera trong nhà trắng với lens đen và đế tròn. Nén WebP giữ alpha, kích thước 1254×1254, lần lượt 86.816 / 77.712 / 95.796 byte. Có kích thước HTML, `loading=lazy`, `decoding=async`, alt, object-fit contain; không thêm WebGL hoặc thư viện 3D.

## Bằng chứng kiểm chứng

- Python: `pytest -q` — **238 passed, 55.05s**. Sau chỉnh nhãn/nội dung giao diện: chạy lại `test_web_ui.py` + `test_site_contact.py` — **36 passed**. Ruff/mypy đạt, 92 source files.
- 12 tệp JavaScript contract: auth, CSRF, retry/idempotency, consent, quote race, chọn địa bàn, catalog/quiz/so sánh, recovery đều đạt.
- `tests/e2e/ui_audit.cjs`: **130 trạng thái**, **30 lần mở dialog**, không tràn ngang, không ô nhập hiện thiếu nhãn, không lỗi JS, sidebar không gạch chân. Admin gồm đăng nhập/MFA/ba bước khôi phục, dashboard, CRM/detailed lead, pricing, reports, settings, ba workspace và từng tab/form. Client gồm trang chủ, ba dịch vụ, khuyến mãi, thông tin dữ liệu, navbar, form, quiz/compare/confirmation. Kích thước 360/390/768/1024/1440 theo trang; kiểm tra thêm dark mode Admin.
- `tests/e2e/admin_dialogs.cjs`: 8 trạng thái dialog lý do, phân công, xác nhận chung và xác nhận ngừng gói trên 1440/360px; kiểm tra Hủy/Escape/đồng ý và accessible name. Chỉ xác nhận helper với dữ liệu giả; không xóa dữ liệu thật.
- `tests/e2e/navigation.cjs`: ba dịch vụ, menu bằng bàn phím, drawer mobile, focus trap và bốn sheet; đạt cả reduced motion và chuyển động bình thường.
- `tests/e2e/short_lead_form.cjs`: giữ đúng ba trường, retry giữ nội dung, SQL nhận lead và trả biên nhận.
- `tests/e2e/client_release.cjs`: login/MFA, chọn/upload ảnh, lưu/công bố, thẻ client, bốn kích thước đạt.
- `tests/e2e/recovery_link.cjs`: mã Telegram 6 số, MFA, reset và audit SQL, xóa nội dung mật khẩu sau thành công đạt.

Ảnh và báo cáo chi tiết nằm trong `.local/qa/ui-audit/` (không đưa dữ liệu audit vào deployment). Kiểm tra trực quan ảnh desktop/mobile của Settings, workspace editor, pricing, navbar 3D, form, recovery và quiz đã thực hiện.

Giới hạn: Chrome headless với PostgreSQL dùng dữ liệu giả và provider Auth/R2 giả cho kiểm thử Admin. Không thay mật khẩu, gửi lead hay xóa dữ liệu khách trên cloud trong đợt này. Kiểm tra trên cloud sau deploy là đọc trang/tài nguyên và chạy UI công khai; đây không phải chứng nhận WCAG hoặc kiểm tra trên mọi thiết bị vật lý.

## Đã triển khai và kiểm tra cloud

[fpt-vungtau.com](https://fpt-vungtau.com) đang trỏ đến `dpl_BjQe7LLghWkSdvZxexDTegszh3ii`, build READY, đã promote và đọc lại từ tên miền. Candidate đạt 15 kiểm tra HTTP và 3 ảnh WebP có hash khớp. Chrome trên production đạt 6 trang × 5 chiều rộng; ảnh logo/3D, số điện thoại, luồng mở form đúng dịch vụ, form 3 trường trên màn hình thấp 500px, UI login/forgot và redirect HTTPS www không lỗi JS/5xx. Không tạo lead hoặc gửi mã recovery trên cloud.
