# Đo hiệu quả link content và voucher

## Mục tiêu đã xác nhận

Admin so sánh link dùng cho nhiều content/nền tảng. Metadata: tên link, creator từ tài khoản đăng nhập (không gán tùy ý), note content, ngày tạo dd/mm/yyyy, nền tảng/UTM, đích. Người dùng chọn form thành công = backend lưu form; bổ sung chuyển đổi chốt đơn do nhân viên và lượng chốt thành công từ từng link.

Nguồn thật: redirect HTTP cho click; commit lead cho form; chuyển trạng thái CRM closed/installed cho chốt. Thao tác trình duyệt hay click CTA không phải chuyển đổi. Chốt hiện còn hiệu lực = closed hoặc installed; hủy trả về trạng thái khác làm giảm số chốt đang thành công, giữ timestamp/actor trong CRM. Đơn lắp là installed. Creator link và người chốt độc lập.

## Phương án

Chọn registry đo lường dùng chung link voucher /s và link content /r. Giữ voucher/CRM/touch hiện có, thêm module link_analytics; không buộc content có voucher và không phụ thuộc GA4. Chỉ thêm field note vào voucher đơn lẻ không đáp ứng content thuần; dùng riêng GA4 không bảo đảm dữ liệu chốt do nhân viên.

## Định nghĩa dữ liệu

- Tổng click = GET redirect thành công. Bot/preview nhận dạng qua UA được đếm riêng; click sau lọc không chứng minh người duy nhất. HEAD không tăng click.
- Đo phiên/tương tác chỉ khi analytics được đồng ý; không fingerprint bằng IP/UA. Tab ẩn hoặc không tương tác 60s dừng cộng thời gian. Đẩy checkpoint tối đa mỗi 15s khi có thời gian mới, không gửi mạng cho tab ẩn/idle không tăng thời gian, tổng lũy kế chống retry, giới hạn bằng đồng hồ server và khóa visit để tránh cộng trùng nhiều tab. Phiên = journey trên tab, hết hạn sau 30 phút không hoạt động; không gọi là số người.
- Source token ký chỉ chứa link/version/ngày nguồn/thời hạn (không người dùng). Truyền ngữ cảnh link khi gửi form hiện tại; phiên analytics bổ sung token journey riêng khi được đồng ý. Nguồn giả/sai không làm mất form, chỉ không được gán link. Không ghi note/PII/URL tùy ý vào GA4.
- Form đếm một lần mỗi lead DB mới; idempotency retry không cộng. Lead có FK link và acquisition_day; lịch đo start_at rõ, không bịa click/time lịch sử.
- Chốt/lắp và người chốt từ CRM transaction. Mỗi lead tối đa một đơn chốt còn hiệu lực; tỷ lệ chốt/form không đếm lại khi chuyển closed→installed. Hủy chốt trừ bộ đếm; chốt lại cập nhật actor lần chốt đang hiệu lực.
- Daily aggregate theo link + revision nguồn + ngày nguồn, dùng ngày Việt Nam. Form/chốt có thể xảy ra sau nguồn; report là acquisition cohort, không so sự kiện khác kỳ để tạo tỷ lệ sai. Click chưa rõ ngày lịch sử không suy đoán.
- Xóa khách bỏ bảng ánh xạ định danh, giữ aggregate vô danh và đánh dấu số đã xóa; không giữ PII, lead UUID hay token trong tổng hợp. Thu hồi consent xóa visit/page states, dừng heartbeat; aggregate không định danh đã ghi được giữ.

## Cấu trúc

Private: marketing_links (kind/slug/metadata/version/creator), marketing_link_revisions, link_daily, link_visits, link_visit_pages, link_results (lead/source/optional visit/current stage/closer). RLS + anon/authenticated revoked. FK và indexes hỗ trợ link/day/lead/visit. Tồn tại link cũ được backfill metadata và creator khi audit đúng thời điểm tạo; không xác định được thì hiện Không xác định. Click/thời gian bắt đầu từ ngày triển khai.

RPC link_* qua api.dispatch wrapper; voucher link save/resolve giữ behavior, registry sync trong transaction; record click chỉ trên redirect, không context/quote GET. AFTER INSERT/UPDATE/DELETE lead hooks cập nhật kết quả nguyên tử. Registry revision chụp metadata nguồn, đổi tên/UTM không viết lại lịch sử. Voucher link vẫn được đổi channel theo behavior cũ; bộ lọc nền tảng sử dụng revision của click/form, không channel hiện tại. Thời gian và count chưa có checkpoint là unknown.

API:
- GET/POST /api/v1/admin/link-performance; PUT /{id}; GET /report và /options; POST /bulk (pause/activate với id/version, kết quả từng item).
- /r/{slug} GET/HEAD redirect nội bộ đã công bố; /s vẫn dùng voucher behavior.
- GET /api/v1/link-tracking/context trả source token từ query hoặc cookie voucher.
- POST /api/v1/link-tracking/visit, /engagement, /revoke. Session và source/journey ký, validation server, rate limits; chỉ cho analytics đồng ý.
- LeadRequest thêm link_source_token và link_visit_token; helper form dùng chung gắn tokens, giữ body/key khi retry.

## Dashboard

Menu Admin: Hiệu quả link. Date/source/creator/kind/search, 4 KPI (click lọc/form/chốt/lắp), biểu đồ ngày và funnel. Table checkbox + sort server hai chiều; creator/note/ngày, click, measured visits/coverage, form, chốt, lắp, tỷ lệ form/click, chốt/form, chốt/click, thời gian tương tác TB, xếp hạng/mẫu. Null là Không đủ dữ liệu, không biến thành 0. Form CRUD gọn, notes nhiều dòng, preview URL + copy; panel chi tiết một link có phân tích nhân viên chốt và conversion lag. Responsive cards/table scroll bên trong, focus/labels/aria-sort; CSV escape/neutralize formulas và không xuất PII.

## Thuật toán

Implement Wilson interval và lower-bound cho tỷ lệ measured journeys tạo form/chốt, đếm outcome nhị phân mỗi journey. Chỉ xếp hạng khi ≥30 mẫu trưởng thành; mature cohort = phiên đo bắt đầu cách ít nhất 7 ngày, tránh coi chưa kịp gọi/chốt là thất bại. Đây là hỗ trợ so sánh, không chứng minh causal lift. Hiển thị cỡ mẫu/coverage/cảnh báo bot, pending và conversion lag. Business CVR là đếm CRM/click request, tách với mẫu journeys đã đồng ý.

Đề xuất sau có dữ liệu: chi phí phân bổ trực tiếp từng link (CPL/CP-closed), phân tích content topic/format, thử nghiệm phân bổ ngẫu nhiên có exposure, Beta-Binomial theo nhóm để giảm nhiễu, EWMA cảnh báo bất thường theo giờ/ngày và SLA phân công. Không tự phân bổ chi phí campaign cho link hoặc gọi IP là khách duy nhất.

## Kiểm chứng

Real PostgreSQL tests: role scopes, metadata/creator/version, old links, slug race, GET/HEAD/bot, disabled/missing target, signed source forgery, no consent/revoke, retry/reordered/cumulative/time bounds, form exactly once, closed→installed→cancel/reclose, privacy erasure/aggregate, acquisition dates, sorting/pagination, no division by zero and mature ranking. JS contracts for timers/consent/hidden state and race; browser admin CRUD, charts, date picker, mobile and actual form attribution. Full Python/JS/lint/type/architecture then independent review. Production only after meaningful checks; no fake leads/notifications to real environment.

Maturity và thời gian dùng ngày bắt đầu phiên đo, không ngày click cũ khi khách đồng ý muộn. Business form/chốt vẫn theo ngày nguồn; hai cohort được gắn nhãn riêng.
