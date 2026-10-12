# Rà soát Admin, phụ kiện và hồ sơ — 08/10/2026

Bổ sung cho `2026-10-08-admin-menu-audit.md`; báo cáo cũ giữ nguyên như bằng chứng trước sửa. Những lỗi CMS HTML, A/B chưa render client và thiếu màn delivery đã được sửa trong lượt này. Không kết luận 10/10 từ số lượng test.

## Thống kê chức năng hiện hành

Có **10 menu chính**, trong đó thêm Sản phẩm & phụ kiện; Marketing, Nội dung, Vận hành có các mục con. Các chức năng dưới đây có triển khai trong mã nguồn, mức kiểm chứng và giới hạn ghi riêng.

| Menu | Chức năng | Hoàn thiện / giới hạn |
|---|---|---|
| Tổng quan | KPI, xu hướng, nguồn, trạng thái, SLA, hồ sơ gần đây | Dữ liệu theo quyền; chưa phải báo cáo lợi nhuận/ROAS |
| Lead CRM | Lọc/danh sách/Kanban, chấm điểm popup, phân công, trạng thái/lý do/nghiệm thu, lịch hẹn, ghi chú, hiển thị thông tin, sửa hồ sơ/xác nhận địa chỉ, gói/thiết bị, hợp đồng kỳ 1/6/12 tháng, lịch thu/nhắc hạn/inbox | Nhân viên sửa đúng hồ sơ được giao; điện thoại bất biến. Thu tiền nội bộ, chưa có cổng thanh toán/hóa đơn |
| Gói & Bảng giá | CRUD, ảnh, nháp/công bố/ngừng, giá theo tỉnh/xã/kỳ/thời gian, import CSV, preview, địa giới, checkbox/bulk | Client chỉ dùng giá/gói công bố; cần Admin điền dữ liệu kinh doanh thật |
| Sản phẩm & phụ kiện | CRUD/ảnh, giá cố định, một lần/theo tháng, nhóm dịch vụ/gói áp dụng, công bố/ngừng, bulk | Client cộng ngay, server ký báo giá và lưu snapshot; không phải kho tồn hàng/giao vận |
| Báo cáo hiệu quả | KPI/biểu đồ/phễu/nguồn/gói/campaign, chi phí/CPL, lọc thời gian/chi nhánh, bảng sort | Chi phí nhập tay; chưa đồng bộ Ads cost, doanh thu/công nợ tổng hợp |
| Tài khoản & MFA | Đổi mật khẩu, TOTP, nhân viên/quyền/chi nhánh/ca/sức chứa/khóa, thu hồi phiên, bảo vệ owner/factor cuối | Provider giả lập đã kiểm tra; chưa thao tác Auth thật để nghiệm thu cloud |
| Cài đặt & Trạng thái | Hotline, SLA/ca/chuông, trạng thái kết nối, cấu hình trang chủ/slide/3 danh mục, CTA A/B | Có version; configured không đồng nghĩa đã gửi thành công |
| Marketing & Quảng cáo | Campaign/UTM, chi phí, experiment, chọn/render CTA client sau consent, exposure/report, integration, delivery/reconcile | Kết quả A/B đếm phiên đồng ý; không tự tuyên bố biến thể thắng. Gateway quảng cáo ngoài còn cần cấu hình/kiểm chứng nhà cung cấp |
| Nội dung & Ưu đãi | CMS khối heading/text/CTA/image/pricing/FAQ, slug HTML/sitemap, preview có quyền, ưu đãi scope/thời hạn, media | Đã sửa URL HTML 404; chặn slug trùng/dành riêng. Là trình khối, chưa phải kéo thả tự do |
| Vận hành & Nhân sự | Queue/retry, nhân viên, audit, yêu cầu export/quyền dữ liệu, danh sách có lọc/nhãn dễ đọc | Bulk retry job lỗi, khóa/mở khóa nhân viên có kiểm tra server; export theo workflow có quyền |

## Customize client

Admin chỉnh được hotline, gói/ảnh/giá từng địa bàn, phụ kiện/cách tính/phạm vi, slide ưu đãi/CTA/thời hạn/thứ tự, đúng ba danh mục và gói bên trong, landing page bằng khối, ưu đãi và thí nghiệm CTA. Placeholder vẫn phục vụ preview Admin; dữ liệu chưa công bố không thành ưu đãi giả trên client.

Typography, palette, cấu trúc navbar/footer, thẻ lật/animation và bố cục responsive hiện chỉnh bằng template/CSS trong mã nguồn. Chưa có theme builder kéo thả hoặc sửa mọi nội dung trang hệ thống từ Admin. Realtime hiện polling 5 giây/backoff 30 giây; không bảo đảm cập nhật dưới một giây.

## Lỗi đã tái hiện và sửa

- Landing page công bố có JSON nhưng URL HTML 404; slug trùng/dành riêng và image block chưa nối media.
- Experiment có API nhưng client không render/exposure; bổ sung lựa chọn consent riêng, thu hồi consent khôi phục CTA gốc.
- Thiếu delivery/reconcile trong giao diện vận hành; thêm bằng chứng đối soát cho kết quả gửi chưa rõ.
- Checkbox/sort chưa thống nhất; sửa header bị bọc lặp, toolbar nằm trong tbody và số lượng lựa chọn sau thành công một phần.
- Ngày nhập/hiển thị không đồng nhất và form reset trở lại ISO; dùng adapter ngày chung, giữ ISO ở API.
- Danh mục gói trống giữ khoảng trắng do transition min-height; tắt transition của trạng thái rỗng.
- Retry lead đã lưu bị chặn khi phụ kiện vừa ngừng; trả receipt theo idempotency trước kiểm tra catalog mới.
- Đổi nhóm gói đồng thời có thể giữ thiết bị không tương thích; kiểm tra gói/phạm vi trong transaction khóa catalog.

## Bằng chứng và giới hạn nghiệm thu

- Pytest **330 passed**, 88.79s: PostgreSQL thật dùng một lần, xác nhận quyền/phân công, điện thoại bất biến, ward-parent, xung đột phiên bản, ảnh chụp phụ kiện/giá/VAT, quote stale, idempotency, CMS, consent, worker/billing và RLS.
- Ruff, mypy **98 source files**, kiểm tra kiến trúc **98 files** qua; hợp đồng API được tái xuất.
- **16 bộ JS contracts** qua. Browser Chromium + WebKit: chọn thiết bị một lần/theo tháng, đổi kỳ/địa bàn, báo giá/form lead; ít nhất ba thẻ khác nội dung giữ wrapper/inner 650 px ở 320/390/768/1440, không tràn ngang. Chromium: profile/consent, bulk CAS thành công một phần, reset/ngày nhuận/ISO, sort tiền/ngày hai chiều và hồi quy billing qua.
- Bổ sung kiểm tra footer sau khi có consent: trước sửa live cao 673 px ở 320 và 652 px ở 390; sau sửa QA 615/594 px, nút chính sách/dữ liệu cùng một hàng có vùng chạm 44 px. Trạng thái danh mục rỗng thu gọn ngay, không đợi transition min-height.
- Auth/MFA và R2 dùng provider giả lập trong QA; không gọi gửi Telegram/Ads, không tạo lead thử hoặc thay gói/ưu đãi thật trên production. Browser WebKit loopback không thay thế đo trên iPhone vật lý.
- Hai migration đã áp dụng lên Supabase; file local dùng đúng version remote `20261008052906` / `20261008052911`. Kiểm tra cloud: bảng lịch sử bật RLS, anon/authenticated không SELECT, service_role có INSERT; các wrapper RPC không cho anon/authenticated EXECUTE.
- Supabase advisor không có lỗi ERROR. INFO RLS không có policy ở schema private là cơ chế deny direct access; quyền server xác minh riêng. WARN có sẵn: chưa bật kiểm tra mật khẩu rò rỉ của Supabase Auth ([tài liệu](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Không đổi gói dịch vụ/tài khoản để bật trong lượt này.
- Bản cuối **READY `dpl_8snwAGtLUEXjizX8VpjJEmpqG2nU`**, `https://fpt-bcsn2m05h-pettravel.vercel.app`: candidate qua **50** kiểm tra HTTP/asset SHA256 rồi promote thành công. `vercel inspect https://fpt-vungtau.com` xác nhận đúng ID và READY.
- Tên miền `https://fpt-vungtau.com` qua **52** kiểm tra HTTP/SHA256: readiness, API phụ kiện, API Admin 401, trang Admin 303, JS/CSS mới đúng nguồn và www redirect 308 giữ path/query. Chromium live qua **7** checkpoint: sáu viewport 320–1440, footer gọn, ba danh mục, thẻ giải pháp 75%, không cắt chữ/tràn ngang, speedtest không tự đo. Không thao tác Auth/lead/gói thật trên production.
- WebKit QA loopback qua **9** checkpoint trang chủ sau CSS footer cuối; phép thử trên tên miền chỉ báo Chromium, không gọi đây là kiểm thử iPhone vật lý.

## Thao tác nhanh

Nhân viên: **Lead CRM → hồ sơ được phân công → Sửa thông tin & Xác nhận địa chỉ**; chọn tỉnh/thành rồi xã/phường, nhập địa chỉ cụ thể, chọn gói/thiết bị, lưu. Owner cấp `lead.write` và `lead.pii`; MFA và kiểm tra phân công vẫn bắt buộc. Số điện thoại chỉ đọc. Thay đổi phạm vi báo giá yêu cầu xác nhận lại, không tự thay sổ thanh toán đã chốt.

Admin: **Sản phẩm & phụ kiện** tạo giá một lần/theo tháng và công bố, sau đó client mới có checkbox tương ứng. Xem `docs/frontend/ACCESSORIES-PROFILE-DATES.md` cho trường/API/luồng lỗi. Chưa có sản phẩm hoặc landing page công bố trong metadata production lúc triển khai; không tạo dữ liệu mẫu trên website thật.


## Hồi quy được khách báo sau triển khai

Lưu địa chỉ khi chọn gói trả 422 vì dropdown dùng mã gói thay UUID. Đã sửa riêng khóa option cho gói, thông báo tiếng Việt, và bổ sung browser chọn gói/phụ kiện/lưu/mở lại. Xem `2026-10-08-profile-plan-confirmation-fix.md` để đối chiếu bằng chứng và deployment mới. Báo cáo kiểm thử trước đó không bao phủ chọn gói trong form hồ sơ.
