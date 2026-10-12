# Đo lường GA4 cho PageFPT

Measurement ID: **G-D0J0XLJ891**. Mã dùng chung cho các trang client, gồm trang chủ, dịch vụ, đo mạng, nội dung CMS, ưu đãi và landing telecom. Không gắn vào Admin; preview trong Admin không tải Google tag. Chỉ cài một nguồn tag này; không thêm lại cùng mã bằng GTM.

## Đã triển khai

Google tag tải bất đồng bộ ngay trên trang client bằng **Advanced Consent Mode**. Trước `config`/`event`, bốn quyền `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` đều là `denied`. Khi chưa chọn hoặc từ chối, các sự kiện thủ công chỉ gửi tên sự kiện, URL/referrer bỏ query/fragment và `form_location` cố định nếu có; không gửi ID gói/địa bàn/thử nghiệm hoặc nguồn UTM. Đây là đo lường hạn chế không cookie, không phải thu thập đầy đủ hành vi hay bảo đảm miễn yêu cầu pháp lý. Kết nối Google vẫn có thông tin mạng như IP; chỉ cam kết không gửi IP trong tham số tùy chỉnh.

Khi backend xác nhận đồng ý, chỉ `analytics_storage` chuyển `granted`. Thu hồi trả `denied`; đo lường hạn chế tiếp tục. Quảng cáo, Google Signals, URL passthrough luôn tắt; `ads_data_redaction=true`. Không lặp page_view khi đổi lựa chọn. Thông báo sau 1 giây và footer giải thích rõ hai mức. Lựa chọn được nhớ 180 ngày; Admin/preview không tải Google. Trong cấu hình chung có thể đổi `consent_mode` thành `basic` để trở về chặn hoàn toàn trước đồng ý.

GA4 không nhận tên, điện thoại, địa chỉ, ghi chú, token phiên, mã tiếp nhận, IP hoặc tọa độ trong các tham số do website gửi. URL gửi thủ công bỏ query và fragment; referrer bỏ query/fragment. Nguồn UTM chuẩn hóa chỉ dùng khi khách bật lựa chọn tiếp thị. Không bật Google Signals, cá nhân hóa quảng cáo hoặc quyền gửi dữ liệu quảng cáo từ lựa chọn ghi nhận nguồn tiếp thị.

| Sự kiện | Khi ghi nhận | Tham số chính | Mục đích |
|---|---|---|---|
| `page_view` | Một lần khi mở trang, kể cả chưa đồng ý | URL đã bỏ query/fragment | Hiệu quả trang/thiết bị |
| `view_plan` | Thẻ gói xuất hiện ít nhất 50% trong khung nhìn; mỗi gói một lần trên trang | `plan_id` | Độ quan tâm từng gói |
| `select_plan` | Nhấn đăng ký gói | `plan_id` | Ý định mua |
| `select_billing_period` | Đổi kỳ trên thẻ | `plan_id`, `billing_months` | Ưa chuộng 1/6/12 tháng |
| `select_accessory` | Tích/bỏ phụ kiện | `plan_id`, `accessory_id`, `selected` | Nhu cầu thiết bị |
| `select_region` | Đổi tỉnh/phường ở bộ chọn | ID địa bàn công khai | Mức quan tâm theo địa bàn được chọn |
| `form_open` | Mở form tư vấn | `plan_id` nếu có | Tỷ lệ mở form |
| `form_start` | Bắt đầu tương tác ô nhập | `form_location` | Tỷ lệ bỏ form |
| `generate_lead` | Máy chủ trả phản hồi thành công có receipt và event_id | `plan_id`, `billing_months`, `accessory_count` | Chuyển đổi tư vấn thực sự |
| `click_call`, `click_zalo`, `click_messenger` | Nhấn liên kết tương ứng | URL trang đã làm sạch | Hiệu quả kênh liên hệ |
| `view_landing`, `experiment_exposure` | Từ sự kiện chiến dịch/thử nghiệm hiện có | `landing_slug`, `experiment_id`, `variant`, `experiment_version` | So sánh chiến dịch/nội dung |

Chỉ đánh dấu `generate_lead` là chuyển đổi chính; sự kiện nhấn gọi/Zalo là ý định liên hệ, không chứng minh đã gọi hay gửi tin. Không gửi `purchase` hoặc doanh thu cho một form tư vấn. Chống đếm lặp theo event_id của phản hồi máy chủ trong trang hiện tại; ID đó không gửi GA4. Đây không phải chống trùng khách hàng giữa các ngày hoặc giữa nhiều phiên. Tổng GA4 không đồng nghĩa tổng lead trong CRM.

## Thiết lập trong Google Analytics

1. **Admin → Data streams → Web**: xác nhận ID đúng, URL `https://fpt-vungtau.com`. Với Enhanced measurement, bật Scrolls nếu cần; tắt Form interactions vì website đã đo `form_start` và thành công qua máy chủ. Tắt tự động Page changes based on browser history để tránh sự kiện page_view không qua bộ lọc URL; cân nhắc tắt Outbound clicks/Site search nếu chưa kiểm tra các URL được thu thập. Không đánh dấu `form_submit` tự động là chuyển đổi.
2. **Admin → Events/Key events**: bộ cấu hình ngày 10/10/2026 chọn `generate_lead` là key event với **Once per event**, để đếm từng yêu cầu được tiếp nhận và chống lặp receipt trong trang. Đây là cấu hình đề xuất chưa lưu trên property; dedupe CRM vẫn là căn cứ số khách thực.
3. **Admin → Custom definitions**: tạo dimensions phạm vi Event cho `plan_id`, `billing_months`, `accessory_id`, `selected`, `form_location`, `landing_slug`, `variant`. Nếu làm báo cáo từng phường, ID có thể tạo nhiều giá trị; ưu tiên tổng hợp tỉnh/thành ở báo cáo CRM. Không tạo dimension cho mã phiên hoặc mã tiếp nhận.
4. Chuẩn hóa UTM: `utm_source=facebook`, `utm_medium=paid_social`, `utm_campaign=camera_vungtau`, `utm_content=video_a`. Ví dụ: `https://fpt-vungtau.com/?utm_source=facebook&utm_medium=paid_social&utm_campaign=camera_vungtau&utm_content=video_a`. Không đưa thông tin khách vào UTM.
5. Dùng Funnel exploration: `page_view → view_plan → select_plan → form_open → form_start → generate_lead`; thêm nhánh mở form tư vấn chung vì khách có thể không chọn gói. Phân đoạn mobile/desktop, landing, nguồn, kỳ. Dashboard Looker Studio nên gồm chi phí/lead, tỷ lệ form thành công, gói được chọn và tỷ lệ lead chốt từ CRM; không chỉ số lượt truy cập.
6. **Data stream → Redact data**: bật email redaction, thêm các query `phone`, `email`, `name`, `address`, `token`, `code`, `access_token`, `refresh_token`. Cấu hình này bổ trợ bộ lọc trong code, không thay cho kiểm tra dữ liệu.
7. Lọc truy cập nội bộ và developer ở trạng thái Testing trước khi chuyển Active. Chọn thời hạn lưu dữ liệu phù hợp, ví dụ 14 tháng nếu cần so sánh mùa vụ trong Explorations; tránh lưu dài chỉ vì có thể.
8. Liên kết Google Ads, Search Console; có thể nối BigQuery/Looker Studio sau khi kiểm chứng chi phí và quyền. Chưa bật các dịch vụ hoặc thay cấu hình trong tài khoản Google từ lần cập nhật này.

## Ưu tiên nâng cấp để dữ liệu đầy đủ hơn

- Theo dõi tỷ lệ đồng ý/từ chối tại nguồn dữ liệu được phép; tách rõ các tín hiệu denied và báo cáo được mô hình hóa, không coi tổng GA là số khách thực. Thông báo lựa chọn và ghi nhớ 180 ngày đã triển khai.
- Gắn tham số vị trí CTA theo tập giá trị cố định (hero, thẻ gói, cuối trang, thanh cố định), đo lỗi form theo mã lỗi chứ không lấy nội dung nhập. Đo hoàn tất speedtest theo nhóm tốc độ nếu khách đồng ý, không gửi tọa độ hoặc IP.
- Sau khi thiết kế liên kết CRM an toàn: Measurement Protocol cho `qualify_lead`, `working_lead`, `close_convert_lead`, đối chiếu mã GA đã được khách cho phép, có outbox/retry/dedupe. Đặt API secret phía server. Chưa triển khai các sự kiện CRM này.
- Dùng A/B test của hệ thống để so sánh nội dung/CTA; theo dõi tỷ lệ chốt và chất lượng lead, không tối ưu theo lượng form giả.

## Kiểm chứng vận hành

Dùng Google Tag Assistant trên máy của chủ website, bật lựa chọn phân tích ở footer, sau đó xem **Realtime** và **Admin → DebugView**. Thử xem gói, đổi kỳ, chọn phụ kiện, gửi form thật khi cần; lỗi form không được xuất hiện `generate_lead`. Thu hồi cookie phân tích và xác nhận analytics_storage về denied; chỉ sự kiện hạn chế tiếp tục. Xem Network để kiểm tra `gtag/js?id=G-D0J0XLJ891` tải một lần mỗi trang, kể cả trước lựa chọn và request `g/collect` không chứa dữ liệu liên hệ.

QA tự động chặn transport Google để không làm bẩn property thật: kiểm chứng script load request, hàng đợi, consent, withdrawal, PII filtering, receipt thật tại fixture và dedupe. Ngày 10/10/2026 đã đọc được báo cáo GA4 qua Windsor.ai trên property **FPT James (558213081)**, stream **16093213879**, đúng measurement ID và hostname. Chưa xác nhận Realtime/DebugView hoặc lưu Custom definitions/Enhanced measurement; Windsor không có write actions cho GA4. Bộ cấu hình và trạng thái nằm ở [GA4-THUOC-TINH-DO-LUONG.md](GA4-THUOC-TINH-DO-LUONG.md).

## Tài liệu chính thức đã đối chiếu

- [Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- [Google tag configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
- [Enhanced measurement](https://support.google.com/analytics/answer/9216061)
- [generate_lead và các sự kiện CRM](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [Data redaction](https://support.google.com/analytics/answer/13544947)
- [DebugView](https://support.google.com/analytics/answer/7201382)
- [Data retention](https://support.google.com/analytics/answer/7667196)


## Giới hạn của Advanced Consent Mode

Cookieless pings không bảo đảm xuất hiện đầy đủ trong Realtime hoặc cung cấp phiên/người dùng chính xác. Mô hình hóa cần đạt điều kiện của Google; xem https://support.google.com/analytics/answer/11161109. Quyền đọc báo cáo qua Windsor chưa xác nhận được điều kiện mô hình hóa. Enhanced measurement nằm trong property, không thể chứng minh bộ lọc thủ công bao phủ mọi sự kiện tự động: cần tắt Form interactions, Outbound clicks, Site search và Page changes/history cho đến khi kiểm tra cấu hình property. Không dùng fingerprint, IP hash, user_id hoặc client_id riêng để nối khách đã từ chối.

Real transport 10/10/2026 xác nhận trên domain: chưa chọn/từ chối gcs=G100 và không tạo cookie GA, đồng ý gcs=G101, thu hồi trở về G100; Google trả HTTP 204. Form interactions tự động hiện đang bật và đo cả form lựa chọn dữ liệu: cần tắt trong GA4. Code đặt URL sạch toàn cục và action sạch cho form chưa khai báo action để hạn chế rò query từ các hit tự động. Preference/journal phiên bản 2026-10-v2; tăng quyền chờ API, thu hồi hạn chế ngay cả khi API lỗi. Xem báo cáo QA `docs/qa/2026-10-10-advanced-consent.md`.
