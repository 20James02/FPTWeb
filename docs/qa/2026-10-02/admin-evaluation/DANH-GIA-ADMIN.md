# Đánh giá Admin PageFPT — 02/10/2026

Cập nhật sau nâng cấp: các sửa lỗi A01–A10 đã được triển khai và kiểm chứng local. Xem [nghiệm thu mới](../admin-upgrade/NGHIEM-THU-ADMIN.md). Điểm và phát hiện bên dưới giữ nguyên làm baseline trước nâng cấp, không phải đánh giá lại phiên bản hiện tại.

## Kết luận

**6,5/10 cho Admin phục vụ vận hành kinh doanh hiện tại.** Lõi xử lý lead và giá theo địa bàn có giá trị sử dụng. Quản trị hệ thống, marketing và giám sát công việc chưa được đưa đầy đủ lên giao diện. Một số thành phần preview vẫn thông báo/hiển thị như chức năng thực, làm giảm độ tin cậy khi vận hành.

Đây là điểm đánh giá chuyên môn theo phạm vi chức năng và khả năng sử dụng, không phải tỷ lệ test pass, chứng nhận bảo mật hay đo hiệu quả kinh doanh thực tế. Chưa đánh giá bằng nhân viên vận hành thật, campaign có ngân sách thật hoặc môi trường cloud.

### Cách chấm

| Tiêu chí | Trọng số | Điểm /10 | Nhận định |
|---|---:|---:|---|
| Tiếp nhận và xử lý lead | 25% | 6,5 | API/timeline/lịch hẹn hữu ích; Kanban và cập nhật bộ lọc còn lỗi, thiếu tên gói/địa bàn |
| Gói, giá và địa bàn | 20% | 8,5 | CRUD, nháp/công bố, giá phân cấp và thời gian, import checkbox/API/CSV, giữ lịch sử |
| Báo cáo | 10% | 6,0 | Funnel và daily metrics thật; thiếu bộ lọc/đối chiếu và định nghĩa daily chưa đồng nhất |
| Marketing và công cụ quản trị vận hành | 15% | 3,0 | Nhiều API đã có, thiếu màn hình campaigns/costs/integrations/jobs/memberships |
| Kiểm soát quyền API | 15% | 8,0 | Membership, scope, MFA, PII reveal, CSRF, CAS; hosted Auth và production chưa xác minh |
| Giao diện và thao tác mobile | 15% | 6,0 | Không tràn document, pricing tốt; CRM vẫn bảng cuộn ngang và nhiều nút nhỏ |

Tổng có trọng số 6,475, làm tròn 6,5. Không lấy tổng137 API toàn dự án làm137 chức năng Admin đã hoàn thiện.

## Phạm vi kiểm tra và chứng cứ

- Đọc7 template Admin, layout, controllers và API/SQL liên quan. Có5 màn hình chính (dashboard, leads, pricing, reports, settings),1 màn hình hồ sơ và login/recovery.
- Mở6 màn hình đã đăng nhập bằng Chrome ở1440 và390px:12 cấu hình không tràn document, không uncaught JS. Xem runtime.json, browser.log và ảnh trong thư mục này.
- Chỉ dùng localhost8000, fixture Auth/lead/plan synthetic; dữ liệu geography nhập từ API thực. Không lộ PII, không gọi reveal, không thay trạng thái/lưu giá/config thực. Chỉ đăng nhập và đọc; kiểm tra nút lưu tổng vốn chỉ tạo toast. Các probe Kanban/score chỉ render dữ liệu tổng hợp trong DOM của browser riêng, không ghi DB.
- Tham chiếu kiểm thử trước đó:174 pytest,31 browser integration,11 regional pricing, source API live. Những kết quả đó không phải chạy lại toàn bộ trong lượt review này.
- Không tạo hoặc sửa source sản phẩm. Không triển khai production.

## Từng nhóm chức năng

| Nhóm | Đã làm được | Còn hạn chế | Điểm /10 |
|---|---|---|---:|
| Đăng nhập/khôi phục | Cookie session, CSRF, MFA/AAL2, logout, email recovery/reset qua provider boundary | Thiếu UI quản lý profile, session/MFA/nhân sự; hosted flow chưa được kiểm thử thực | 8 |
| Dashboard | Tổng lead, quá SLA, tỷ lệ qualified/installed, funnel,5 lead mới và lối tắt | Thiếu kỳ/ngày/chi nhánh/nhân viên; lỗi fetch bị nuốt; polling không refresh dashboard; UUID gói khó đọc | 6 |
| Danh sách CRM | Cursor, tải thêm, lọc status server, tìm trong trang, bảng/Kanban, che/reveal phone, link hồ sơ, yêu cầu export | Kanban bỏ trạng thái không có cột; tìm chỉ trong phần đã tải; không bulk assign; không tên gói/địa bàn; search không áp dụng Kanban | 6 |
| Hồ sơ lead | Giải mã theo quyền, tel/Zalo sau reveal, phân công tự động, chuyển trạng thái có lý do/reference, ghi chú/timeline, lịch hẹn, queue recompute | Phân công hiển thị ID; không pick nhân sự thủ công trên UI; quote chỉ badge/trạng thái, thiếu chi tiết cước/phí; nhiều prompt native, nút nhỏ | 7 |
| Chấm điểm khách |4 score, progress và queue tính lại; backend rule weights, giảm trọng số sự kiện cũ, nguồn/mức xác thực rõ trong model | Reasons object bị render thành[object Object]; điểm chưa phải xác suất đã hiệu chuẩn; thiếu UI provenance/GeoIP/ISP và thời điểm/ruleset | 5 |
| Gói, giá, địa bàn | Thêm/sửa/ngừng, publish, vùng áp dụng checkbox; giá xã→tỉnh→group→default; kỳ/VAT/phí/tháng tặng/hiệu lực; bulk; CSV preview/apply; version replacement; API province/ward và fallback | Chưa có clone/matrix hàng loạt, preview tổng giá cho nhiều địa bàn/kỳ; CSV vẫn dạng nâng cao dùng ID; promotions/campaign chưa có màn riêng | 8,5 |
| Báo cáo | Funnel API, tỷ lệ contacted/qualified/installed, metrics theo ngày, nút rebuild | Không kỳ/channel/campaign/nhân viên, chưa bảng chi phí/CPL; rebuild thủ công thiếu contacted; ngày hôm nay dùng UTC | 6 |
| Cấu hình hiển thị | Lưu display settings thật có CAS: runline, animation, các vùng banner bật/tắt | Nút chi tiết banner/flash scheduling là toast, chưa CMS ảnh/nội dung/lịch công bố | 7 cho phần display |
| Cài đặt vận hành/trạng thái | Có bố cục SLA, chuông, nhánh, nhân viên, trạng thái storage/DB/security | Lưu tổng không lưu; nhiều thông số/danh sách/status hardcode; Đổi mật khẩu chỉ toast | 3 cho phần hệ thống |
| Marketing và giám sát | Backend có campaigns, experiments, costs, integrations, memberships, jobs/audit, followups, export-result | Chưa có màn vận hành các API; nút export mới báo queued không theo dõi/download; chưa UI conversion delivery/retry/CPA-CPL theo campaign | 3 |

## Phát hiện cần xử lý

### A01 — P1: Lưu tổng báo thành công nhưng không lưu

`src/pagefpt/templates/admin/settings.html:18` gọi showToast trực tiếp. Probe bấm **Lưu Cài Đặt**: successToast=true, writeRequests=[] (runtime.json). Các ô SLA, chuông, nhánh ở phần tiếp nhận không nằm trong payload saveAdminDisplaySettings. Tách nút lưu từng nhóm, nối endpoint cấu hình vận hành và chỉ báo thành công khi server xác nhận. Phần **Lưu Cài Đặt Giao Diện** phía dưới thực sự có PUT, không gộp nó với nút giả.

### A02 — P1: Kanban làm biến mất lead có trạng thái hợp lệ

`src/pagefpt/static/js/admin/crm.js:235` tìm cột theo đúng status và return nếu không có. HTML chỉ có new/contacting/qualified/survey/installed. assigned/contacted/quoted/closed/unreachable/rejected/invalid/duplicate/no_infrastructure không xuất hiện. Probe render assigned:0 card được thêm. Cần mapping mọi status vào nhóm cột hoặc hiện đủ cột với tổng số và bộ lọc tương ứng. Chưa có drag/drop chuyển trạng thái.

### A03 — P1: Cập nhật làm mất bộ lọc và trang đang xem

`src/pagefpt/static/js/admin/realtime.js:14` gọi loadCrmLeads() không args; default tại crm.js là status=null,cursor=null,append=false. VM probe realtime.json xác nhận arguments=[]. Khi có change, danh sách quay về30 bản ghi đầu/tất cả dù dropdown vẫn có thể chọn status cũ, search chưa áp dụng lại. Cần giữ filter/search/loaded-window và refetch từng view đúng phạm vi. Dashboard/detail/pricing/reports không được refresh bởi hàm này.

### A04 — P1 trước production: HTML Admin chỉ bật development/test

`src/pagefpt/application.py:95–98` mount cả client/admin web routers có điều kiện environment. Khi cấu hình production, code hiện tại không mount /admin/dashboard…; API vẫn có thể tồn tại. Đây là gate có chủ đích vì còn preview fixtures, không mở production bằng cách đổi ENV thành development. Cần bỏ/khắc phục fixture, kiểm chứng HTML auth/route theo môi trường và có kiểm thử staging trước khi mở gate.

### A05 — P2: Thông tin hệ thống và bộ đếm chưa đáng tin

settings.html hardcode12ms, “An toàn100%”, R2 “Sẵn sàng”, nhân viên trực ca và “mật khẩu đổi15 ngày trước”. Trong môi trường fixture R2 chưa cấu hình. admin_base.html hardcode sidebar count=3; cùng lúc API trả35 lead new, sidebar vẫn3. Vai trò người dùng cũng hardcode trong layout. Thay bằng health/capabilities/identity/count DTO có checked_at; chưa đo thì hiển thị chưa có dữ liệu.

### A06 — P2: CRM hiển thị mã thay cho thông tin dùng được

crm.js:184–199 render8 ký tự plan_id/region_id và raw status tiếng Anh. detail.html:383 trở đi render cả UUID, assignee ID; quote confirmed bị gọi “Đã chốt giá” dù chỉ là xác nhận giá hệ thống, chưa đồng nghĩa khách chốt gói. Trả thêm tên/mã gói, tỉnh/xã, người phụ trách và quote snapshot qua DTO có scope; map trạng thái tiếng Việt thống nhất, label quote chính xác. Không gọiN API mỗi dòng.

### A07 — P2: Lý do chấm điểm object bị chuyển thành chuỗi

Backend `modules/intelligence/scoring.py:39–49` trả reasons:[{signal,weight,kind,...}]. `templates/admin/leads/detail.html:467` nội suy `${reason}`, tạo “✓ [object Object]”. Render theo các field, mapping signal tiếng Việt và nguồn/trọng số, hiển thị computed_at/ruleset_version. Đổi score0..100 sang “điểm/100”; không gọi contact_confidence là độ chính xác số/định danh đã xác minh. GeoIP/đầu số không xác định chính xác danh tính, vị trí hay nhà mạng hiện tại.

### A08 — P2: Báo cáo daily chưa đồng nhất

Manual metrics_rebuild tại migration8:426–432 ghi payload v1 không có contacted; worker metric v2 có contacted. UI reports.html:172–173 đang chờ contacted nên sau rebuild có thể hiển thị--. Nút “Hôm Nay” tại reports.html:191 dùng toISOString UTC, từ00:00 tới06:59 giờ Việt Nam chọn ngày trước. Dùng một định nghĩa daily chung, ngày Asia/Ho_Chi_Minh và chú giải rõ cohort theo ngày tiếp nhận so với kết quả theo ngày xử lý.

### A09 — P2 UX: Mobile chưa tối ưu thao tác bán hàng

12 cấu hình không tràn document, nhưng bảng CRM vẫn cần kéo ngang để xem nút cuối. Mobile view switch/Gọi nhanh/Zalo khoảng31px, sao chép trong hồ sơ20px, phân công38px. Pricing form tốt hơn, các field44px. Cần card mobile có tên gói/địa bàn/status/SLA và nút hồ sơ/gọi, vùng bấm tối thiểu44px theo guideline đang dùng; không xem “không overflow” là toàn bộ UX đã đạt.

### A10 — P2: Thiếu giao diện giám sát queue/export và quản trị người dùng

jobs/audit/memberships/export-result đã có endpoint nhưng sidebar/template không có màn tương ứng. Khi recompute/export báo queued, người dùng chưa biết completed/failed/next_retry; không có UI tải file khi completed. Cần theo dõi trạng thái qua API scoped, dùng replay/mutation theo quyền/MFA, không đưa worker secret ra browser. Phần nhân viên preview cần nối membership/shift/capacity thật.

## Thứ tự nâng cấp đề xuất

1. **Sửa độ tin cậy vận hành:** A01–A03, trạng thái hardcode và reasons/labels; giữ dữ liệu scope/CAS hiện hành.
2. **Đủ dùng hằng ngày:** tên gói/địa bàn/nhân sự trong DTO; filter server theo ngày/nguồn/người phụ trách/địa bàn, saved views, ưu tiên quá SLA, phân công chọn nhân sự và bulk có kiểm tra quyền; daily definitions; mobile cards.
3. **Tối ưu acquisition và quản trị:** màn campaigns/UTM generator/landing-content/promotion, costs và CPL theo nguồn/lead đủ chuẩn; conversion delivery; jobs/export/audit/memberships; staging/production verification với Auth/R2/worker thật.

Các hạng mục mới là đề xuất; lượt này đánh giá và lưu chứng cứ, chưa tự sửa hay phát triển chúng. Dữ liệu kết quả kinh doanh thực mới cho phép đo tỷ lệ chốt/CPL và hiệu quả của score.
