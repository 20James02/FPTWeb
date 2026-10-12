# Kiểm tra các menu Admin — 08/10/2026

Kết luận: luồng CRM, giá theo địa bàn và tài khoản có triển khai thực tế; chưa thể gọi toàn bộ Admin hoàn thiện. Những màn cấu hình hiện có không chứng minh hệ thống đã thực thi đầy đủ ở client/nhà cung cấp.

## Phạm vi và bằng chứng

- Rà soát 9 menu và 12 mục con của Marketing, Nội dung, Vận hành; đối chiếu template, JavaScript, API và SQL.
- Browser fixture dùng PostgreSQL thật trong schema dùng một lần; Auth/MFA/R2 giả lập, không thay tài khoản hay dữ liệu khách hàng production.
- Bài audit `.local/qa/admin-menu-audit.cjs`: 70 checkpoint, 0 lỗi JavaScript/API; 4 chiều rộng 1440/768/390/360. 9 trang tải được, không phát hiện tràn ngang, menu gạch chân hoặc input thiếu nhãn trong mẫu kiểm tra. Đây không phải kiểm định WCAG đầy đủ.
- Chạy riêng `catalog_publish.cjs`, `lead_reassignment.cjs`, `lead_billing.cjs`, `admin_dialogs.cjs`, `accounts_analytics.cjs`: đều qua. Account/MFA/staff/analytics có 23 checkpoint; thu hồi phiên sau đổi mật khẩu và chặn staff thiếu MFA được kiểm tra trên provider giả lập.
- Live read-only: 9 trang Admin chuyển 303 về login; các API me/report/integration/workspace yêu cầu đăng nhập (401); health ready 200. Chưa thử đổi mật khẩu/MFA tài khoản thật trên cloud.
- Metadata biến môi trường Vercel production không có `PAGEFPT_CONVERSION_URL` / `PAGEFPT_NOTIFICATION_URL`. Không đọc/in báo cáo giá trị secret; không gửi dữ liệu hoặc sự kiện thử tới nhà cung cấp.

## Từng menu

| Menu | Đã có và có kiểm chứng phù hợp | Phần còn thiếu hoặc giới hạn |
|---|---|---|
| Tổng quan kinh doanh | KPI lead/SLA, xu hướng, nguồn, trạng thái, phân quyền dữ liệu, hồ sơ gần đây | Chưa phải dashboard tài chính: không có doanh thu/lợi nhuận/ROAS từ giao dịch thực |
| Quản lý Lead CRM | Danh sách/Kanban, lọc, chi tiết, hiển thị thông tin có quyền, chấm điểm, phân công/chuyển nhân viên, chuyển trạng thái, lịch hẹn, gói đã chốt, kỳ 1/6/12 tháng, lịch tiền/ghi chú, nhắc đến hạn và ghi nhận thu tiền | Thu tiền là sổ quản lý nội bộ; chưa có cổng thanh toán/hóa đơn. Nhắc nhân viên hiện có inbox Admin; không khẳng định đã có push hệ điều hành hay Telegram riêng từng nhân viên |
| Gói cước & Bảng giá | CRUD/ngừng sử dụng, ảnh gói, nháp/công bố, giá theo tỉnh/xã/thời hạn/kỳ, bulk checkbox, nhập CSV, preview/đồng bộ địa bàn | Cần dữ liệu gói và giá thật được công bố. “Chưa có gói” ở client không tự động là lỗi; không tự công bố dữ liệu kinh doanh trong audit |
| Báo cáo hiệu quả | Khoảng ngày/chi nhánh/campaign, xu hướng, phễu, trạng thái, nguồn, gói, chi phí/CPL, bảng dữ liệu phụ trợ | Chi phí nhập tay; không tự đồng bộ chi phí quảng cáo. Còn thiếu báo cáo kết quả A/B, tài chính/công nợ tổng hợp, ROAS từ doanh thu đã xác minh |
| Tài khoản & MFA | Đổi mật khẩu, enroll/verify/remove TOTP, bảo vệ factor cuối/owner cuối, tạo nhân viên, quyền/chi nhánh/ca/sức chứa/khóa tài khoản, thu hồi phiên | Cloud thật chưa được kiểm thử thao tác thay đổi Auth trong lượt audit này; kiểm tra provider giả lập không thay thế kiểm tra thiết bị TOTP thật |
| Cài đặt & Trạng thái | SLA/ca/ngày/chuông, hotline, cấu hình giao diện có version, trạng thái kết nối phân biệt configured/verified | Trạng thái “đã cấu hình” chưa chứng minh đã gửi dữ liệu ngoài thành công. Các banner placeholder chỉ dành preview; không phải CMS production hoàn chỉnh |
| Marketing & Quảng cáo | Campaign CRUD/UTM, chi phí, experiment nháp/công bố và API phân nhóm, bản ghi bật/tắt tích hợp, gateway/delivery backend | A/B chưa nối vào client để render biến thể và gửi exposure. Conversion/notification gateway production chưa cấu hình. Chưa có màn quản lý delivery/reconcile dù API đã có |
| Nội dung & Ưu đãi | CMS khối nội dung nháp/công bố/lịch, ưu đãi có scope/thời hạn/nhóm ưu tiên, media upload/finalize | Landing page công bố có JSON nhưng URL HTML từ slug trả 404; sitemap vẫn ghi URL đó. Đây là lỗi chức năng cần sửa |
| Vận hành & Nhân sự | Queue/retry, nhật ký có quyền/MFA, membership/ca/capacity, yêu cầu export CSV và yêu cầu dữ liệu/quyền riêng tư | Một số danh sách còn hiện UUID/khóa JSON kỹ thuật, ít tìm kiếm/lọc. Luồng export/worker có test tích hợp; chưa xuất dữ liệu khách thật để nghiệm thu cloud |

## Lỗi tái hiện và thứ tự xử lý

1. **Landing page không có HTML**: tạo page → publish 200 → `/api/v1/pages/<slug>` 200 → `/<slug>` 404; sitemap có URL 404. `modules/content/routes.py` xuất JSON/sitemap, `web/client_routes.py` chưa có renderer CMS theo slug. Cần public renderer, preview, slug reservation/canonical và kiểm thử đường dẫn thực.
2. **A/B chưa chạy trên trang khách**: experiment API hoạt động; client chỉ khai báo event `experiment_exposure`, chưa có caller lấy variant/render/exposure. Cần nối experiment vào vùng có thể thử, bảo đảm consent và có báo cáo kết quả.
3. **Tích hợp quảng cáo chưa hoạt động trọn luồng production**: worker dùng ConversionGateway; sandbox adapters không đồng nghĩa đã nối live. Cần cấu hình gateway, xác nhận tài khoản/sự kiện/deduplication, rồi thử với nhà cung cấp được chọn. Không gửi dữ liệu khách chỉ để kiểm tra menu.
4. **Trải nghiệm nhân viên chưa thống nhất**: thay UUID/JSON bằng tên và nhãn tiếng Việt, thêm filter/empty/error state cho workspace; bổ sung màn delivery khi vận hành integration.
5. **Cập nhật hiện tại bằng polling**: JS kiểm tra mỗi 5 giây, backoff tối đa 30 giây, dừng khi tab ẩn hoặc dialog cần giữ draft. Không gọi đây là bảo đảm Realtime dưới 1 giây dù SQL có nền tảng private topic.

## Thay đổi bổ sung theo ảnh mobile trong cùng lượt

Đã triển khai editor slide ưu đãi và đúng 3 danh mục tại `/admin/settings#home-merchandising`, có liên kết từ Nội dung và Bảng giá. Slide dùng ảnh ready đã kiểm tra, CTA giữ gói đã công bố, có bật/tắt/thời hạn/thứ tự; SSR trang chủ thực sự sử dụng cấu hình này. Đây là luồng riêng cho trang chủ, **không sửa thay renderer Landing page CMS đang thiếu**.

Phần kiểm tra mobile/speedtest được ghi ở `2026-10-08-mobile-home-speedtest.md`. Không đánh giá Admin đạt 10/10 từ số lượng test qua.
