# Kế hoạch website tư vấn dịch vụ Internet: Client và Admin

Ngày lập: 30/09/2026. Phạm vi: kế hoạch triển khai, chưa xây dựng hoặc phát hành website.

## 1. Mục tiêu và giả định

Mục tiêu chính là tăng số khách có nhu cầu thực, liên hệ được và có khả năng lắp đặt; sau đó tăng hợp đồng hoàn tất. Theo dõi riêng lead thô, lead đủ điều kiện và khách đã lắp đặt để tránh tối ưu quảng cáo cho số lượng biểu mẫu kém chất lượng.

Giả định phiên bản đầu phục vụ tư vấn, đăng ký nhu cầu và quản lý bán hàng. Chưa cần tài khoản khách hàng, thanh toán, ký hợp đồng hoặc kết nối hệ thống nội bộ FPT. Admin có thể quản lý nhiều khu vực nhưng khi ra mắt chỉ bật các khu vực đội kinh doanh thực sự phục vụ.

Tham khảo cấu trúc sản phẩm và giá từ [FPT](https://fpt.vn/vi), không sao chép toàn bộ nội dung/hình ảnh. Tên thương hiệu, logo, vai trò đơn vị vận hành và tuyên bố chính thức phải phù hợp quyền sử dụng thực tế.

## 2. Hành trình khách hàng

Quảng cáo/tìm kiếm → landing page đúng nhu cầu → chọn khu vực → xem gói và điều kiện → yêu cầu tư vấn → lưu lead thành công → xác nhận tiếp nhận → nhân viên liên hệ → kiểm tra hạ tầng → báo giá → hoàn tất lắp đặt → hỗ trợ/giới thiệu bạn bè.

Nút chính: “Nhận tư vấn gói phù hợp”. Nút phụ: gọi hoặc Zalo. Chọn gói là tùy chọn, không buộc khách chưa hiểu sản phẩm phải quyết định trước.

Chỉ hiển thị gửi thành công sau khi backend lưu lead. Khi mạng yếu, giữ dữ liệu trên màn hình và cho thử lại; yêu cầu gửi lại có khóa chống tạo trùng. Nếu thông báo cho nhân viên thất bại, lead vẫn tồn tại và hệ thống tự thử lại qua hàng đợi.

## 3. Client

### Trang chủ

Thứ tự nội dung mobile:

1. Đơn vị tư vấn, lợi ích chính và CTA rõ trong màn hình đầu.
2. Chọn khu vực; cho phép tiếp tục xem giá tham khảo khi chưa chọn.
3. Ba nhóm lựa chọn: tiết kiệm, gia đình/nhà nhiều tầng, combo giải trí/camera.
4. Ba gói đề xuất, mở rộng để xem toàn bộ.
5. Công cụ chọn gói nhanh và so sánh tối đa ba gói.
6. Công trình/đánh giá có bằng chứng và điều kiện công bố.
7. Quy trình đăng ký, tổng chi phí, FAQ và chính sách.
8. Form tư vấn ngắn; footer nêu rõ vai trò đơn vị vận hành và kênh hỗ trợ.

Ưu tiên hero tĩnh. Chỉ dùng carousel khi có lý do rõ và đã kiểm tra tốc độ/khả năng sử dụng.

### Trang sản phẩm

Internet cá nhân/gia đình; combo Internet–truyền hình; combo Internet–camera; WiFi phủ nhiều tầng; Internet doanh nghiệp. Các sản phẩm bổ trợ mở dần theo năng lực tư vấn thực tế.

Mỗi gói hiển thị download/upload riêng, thiết bị và số điểm phát, đối tượng phù hợp, quyền lợi, giá theo khu vực, VAT, kỳ thanh toán, phí hòa mạng, thiết bị mua thêm, tổng tiền ban đầu, thời hạn/điều kiện ưu đãi và quy định thiết bị. Nội dung giá lấy từ một dịch vụ tính giá chung.

### Landing page quảng cáo

Mẫu riêng theo sản phẩm, nhu cầu, địa phương và chiến dịch. Mỗi mẫu có headline phù hợp quảng cáo, một hành động chính, 1–3 gói, bằng chứng, FAQ và form ngắn. Giá được liên kết với gói và bảng giá, không nhập lại bằng văn bản tự do.

Trang địa phương có thông tin và khả năng phục vụ thực tế. Tránh tạo hàng loạt trang chỉ đổi tên địa phương. URL chiến dịch dùng để A/B test phải có cấu hình index/canonical phù hợp.

### Form và trang xác nhận

- Bước đầu: số điện thoại, khu vực phục vụ; tên, nhu cầu và giờ gọi là tùy chọn. Không yêu cầu CCCD hoặc chọn phương thức thanh toán ở bước tư vấn.
- Địa chỉ chi tiết chỉ yêu cầu khi cần kiểm tra hạ tầng. Có thể bổ sung sau khi lead đã lưu.
- Gói/khu vực đã chọn được mang sang form; lưu phiên bản giá tham khảo cùng lead.
- Có giải thích mục đích liên hệ và chính sách dữ liệu ngay cạnh nút gửi; lựa chọn nhận marketing tách khỏi yêu cầu tư vấn.
- Trang xác nhận có mã yêu cầu, thời gian phản hồi dự kiến theo giờ làm việc, lựa chọn giờ liên hệ và kênh chủ động liên hệ.
- Không công bố hạ tầng khả dụng chắc chắn khi chỉ mới thu địa chỉ. Nếu chưa có API kiểm tra thực, hiển thị “đã nhận yêu cầu kiểm tra”.

### Công cụ thu hút và giữ khách

- Chọn gói qua 3–4 câu hỏi: số tầng, số thiết bị, nhu cầu chính, khu vực.
- So sánh gói theo nhu cầu, tổng chi phí và độ phủ sóng; giải thích kết quả đề xuất.
- Lưu gói/khu vực đã xem trên thiết bị; không lưu số điện thoại vào local storage.
- Báo giá chia sẻ bằng liên kết, có hạn hiệu lực và không lộ thông tin cá nhân.
- Nội dung hướng dẫn phủ WiFi, chọn camera, xử lý lỗi; có CTA đúng chủ đề.
- Đặt lịch gọi lại, phản hồi sau tư vấn và giới thiệu bạn bè theo điều kiện minh bạch.
- Sau lắp đặt: kiểm tra hài lòng, hướng dẫn sử dụng và nâng cấp phù hợp; dừng bán thêm khi đang có khiếu nại chưa xử lý.

## 4. Giá và chương trình ưu đãi

[FPT Play](https://fpt.vn/truyen-hinh-fpt-play) hiện công bố giá có thể thay đổi theo khu vực và thời điểm. Giá trên [trang Internet gia đình](https://fpt.vn/internet/gia-dinh) chỉ dùng làm nguồn tham khảo ban đầu; không coi giá trích từ trang công khai là bảng giá đầy đủ cho mọi địa chỉ.

### Mô hình dữ liệu

- Product: nhóm dịch vụ.
- Plan: mã gói, tên, thông số, thiết bị, quyền lợi.
- Region: khu vực phục vụ và nhóm giá; mã ổn định, có ánh xạ địa danh cũ/mới khi cần.
- PriceVersion: gói, khu vực, cước tháng, VAT, kỳ thanh toán, phí ban đầu, ngày bắt đầu/kết thúc, nguồn xác nhận, người duyệt.
- Promotion: khu vực/gói áp dụng, thời gian, quyền lợi, điều kiện, quy tắc được kết hợp.
- QuoteSnapshot: thông tin giá/ưu đãi cụ thể tại thời điểm khách gửi yêu cầu.

### Quy tắc

1. Ưu tiên giá đúng khu vực, sau đó giá vùng, cuối cùng giá mặc định đã được duyệt. Không có giá phù hợp thì yêu cầu tư vấn; không tự chọn giá thấp nhất của vùng khác.
2. Không có hai phiên bản hiệu lực chồng nhau cho cùng tổ hợp gói, khu vực và kỳ thanh toán.
3. Giá lưu bằng số nguyên VND; tách kỳ trả tiền với số tháng được sử dụng/tặng.
4. Tổng trả ban đầu = cước trả trước + phí hòa mạng + thiết bị mua + dịch vụ thêm − giảm giá đủ điều kiện.
5. Ưu đãi hết hạn tự ngừng; cache được làm mới khi xuất bản giá.
6. Mọi trang, form, báo giá và landing page dùng chung nguồn; có preview, duyệt, lịch sử và khôi phục phiên bản.
7. Dữ liệu FPT được nhập thủ công hoặc qua file đã kiểm tra. Chỉ đồng bộ API khi có quyền và tài liệu tích hợp; không giả định có API công khai.

## 5. Admin

| Module | Phiên bản đầu | Mở rộng |
|---|---|---|
| Dashboard | Lead, đủ điều kiện, hợp đồng/lắp đặt, nguồn, SLA liên hệ | Chi phí ads tự đồng bộ, cohort và dự báo |
| Gói/giá | CRUD, giá khu vực, thời gian hiệu lực, duyệt, lịch sử | Import hàng loạt, đồng bộ được cấp quyền |
| Lead CRM | Danh sách/Kanban, người phụ trách, nhắc việc, lịch sử | Chia tự động theo vùng, ca trực, tải công việc |
| Landing page/CMS | Mẫu có kiểm soát, preview, xuất bản, SEO | A/B test, cá nhân hóa theo chiến dịch |
| Chiến dịch | UTM, nguồn, mã chiến dịch, mapping conversion | API báo cáo ads, lead form bên ngoài |
| Chăm sóc | Lịch gọi lại, ghi chú, phản hồi, trạng thái hỗ trợ | Kịch bản Zalo/email/SMS được cấu hình |
| Quản trị | Vai trò, nhật ký, quản lý xuất dữ liệu | Phân quyền theo chi nhánh, chính sách lưu trữ |

Trạng thái lead: mới → đã phân công → đang liên hệ → đã liên hệ → đủ điều kiện → chờ khảo sát/báo giá → đã chốt → đã lắp đặt. Nhánh riêng: không liên hệ được, chưa có hạ tầng, sai thông tin, trùng, từ chối; lưu lý do và lịch hẹn.

Không xóa lịch sử khi trùng số điện thoại: gộp hồ sơ khách và giữ từng yêu cầu/nguồn. Một khách có thể đăng ký ở nhiều địa chỉ hoặc nhiều dịch vụ.

Vai trò: chủ hệ thống, quản lý, marketing, biên tập, kinh doanh, CSKH. Marketing xem báo cáo và chiến dịch; chỉ người được phân công/ủy quyền xem dữ liệu liên hệ đầy đủ. MFA cho admin, nhật ký sửa giá/lead và xuất dữ liệu; xác thực server cho mọi thao tác.

## 6. Hỗ trợ quảng cáo

| Kênh | Tính năng website | Chất lượng cần đo |
|---|---|---|
| Google Search | Landing theo ý định/khu vực, click ID, conversion trực tuyến và ngoại tuyến | Lead liên hệ được, đủ điều kiện, lắp thành công |
| Facebook/Instagram | Landing phù hợp mẫu quảng cáo, Pixel và Conversions API, nhập lead form khi có quyền | Lead chất lượng và hợp đồng |
| TikTok | Landing ngắn, ưu tiên tốc độ, nội dung video tải khi cần; Pixel/Events API | Tư vấn đã tiếp nhận và kết quả bán hàng |
| Zalo | CTA có ngữ cảnh, OA khi được cấu hình, lịch gọi/chăm sóc | Hội thoại thực và kết quả tư vấn |
| SEO | Trang nhu cầu/địa phương, FAQ thực, liên kết nội bộ, sitemap | Lead và lắp đặt theo nhóm trang |
| Giới thiệu/đối tác | Mã giới thiệu, URL/QR riêng, nguồn không bị ghi đè | Khách giới thiệu đã lắp, thưởng đủ điều kiện |

Sự kiện nội bộ: view_plan, select_region, compare_plans, start_form, lead_submitted, lead_qualified, appointment_scheduled, installation_completed; click_call và click_zalo đo riêng, không tự tính thành lead.

lead_submitted chỉ tạo sau khi lưu DB. Sự kiện quảng cáo có mã duy nhất để chống đếm trùng browser/server; hàng đợi có retry và log. Mapping tên sự kiện theo từng nền tảng, không gửi tùy tiện tên sự kiện nội bộ thành sự kiện chuẩn.

Lưu first touch, last touch, UTM và click ID hợp lệ theo lựa chọn quyền riêng tư. Không gửi điện thoại/email thô vào GA4 hoặc URL; các dữ liệu đối sánh phải theo yêu cầu nền tảng và lựa chọn người dùng. Băm dữ liệu không biến dữ liệu thành vô danh.

Tích hợp Google cần theo [hướng dẫn offline conversions hiện hành](https://support.google.com/google-ads/answer/2998031?hl=en-GB), gồm thay đổi tuyến upload sang Data Manager API. TikTok yêu cầu [chống đếm trùng](https://ads.tiktok.com/help/article/event-deduplication?lang=en) khi Pixel và Events API gửi cùng conversion. Meta tích hợp theo tài liệu chính thức khi triển khai.

Các tính năng cần tài khoản ads/OA, token, quyền truy cập và người quản trị cấu hình. Không tự chạy quảng cáo hoặc nhắn khách từ bản kế hoạch này.

## 7. Kéo lại khách và chăm sóc

- Remarketing theo hành vi đã xem sản phẩm nhưng chưa gửi yêu cầu, theo lựa chọn theo dõi của khách; loại khách đã lắp khỏi chiến dịch tìm khách mới.
- Khách đã gửi: lịch gọi có thời hạn, tối đa số lần theo quy trình; tôn trọng giờ hẹn và yêu cầu ngừng liên hệ.
- Khách chưa có hạ tầng: chỉ nhận thông báo khi họ muốn và có cập nhật khả dụng đã xác nhận.
- Khách chưa quyết định: gửi so sánh/báo giá phù hợp, không gửi ưu đãi đại trà liên tục.
- Sau lắp đặt: kiểm tra hài lòng; chuyển phản hồi bất mãn sang CSKH trước khi đề xuất nâng cấp.
- Referral cho khách hài lòng; điều kiện ghi nhận và thưởng sau lắp đặt rõ ràng.
- Không dùng số người xem, đánh giá, countdown hay tình trạng sắp hết ưu đãi giả.

## 8. Mobile và hiệu năng

- Một cột, chữ nội dung từ 16px, mục tiêu chạm khoảng 44–48px, biểu mẫu dùng bàn phím số cho điện thoại.
- Thanh dưới gọn gồm tư vấn/gọi/Zalo; có khoảng trống và safe area, không đè form hoặc nội dung.
- Form dạng bottom sheet/toàn màn hình, đóng được, quản lý focus, hoạt động với bàn phím và nút Back.
- So sánh dạng thẻ xếp dọc; không bắt đọc bảng rộng trên điện thoại.
- Ảnh đúng kích thước, định dạng tối ưu, tải lười dưới màn hình đầu; hero được ưu tiên tải. Chỉ tải video/chat/tracking cần thiết.
- Hiển thị đúng giá và CTA khi JavaScript chậm; kiểm tra mạng yếu, gửi lại và lỗi server.
- Test màn hình 360–430px, Safari iOS, Chrome Android, zoom chữ, bàn phím và khả năng truy cập.
- Mục tiêu thực địa ở phân vị 75: LCP ≤2,5s; INP ≤200ms; CLS ≤0,1, theo [Web Vitals](https://web.dev/articles/vitals). Lighthouse dùng kiểm tra trước ra mắt; dữ liệu người dùng thực dùng đánh giá vận hành.

## 9. Kiến trúc

Public client hỗ trợ render trên server cho SEO/tốc độ; admin riêng có xác thực. Backend chia module: catalog, pricing, lead, content, campaign, reporting, messaging. Dùng cơ sở dữ liệu quan hệ; cache/CDN cho nội dung công khai; lưu ảnh riêng; hàng đợi cho thông báo và conversion.

Đề xuất triển khai một backend có module rõ ở giai đoạn đầu. Lead và tác vụ gửi conversion được ghi bền vững qua outbox để không mất khi tích hợp bị lỗi. Có rate limit, chống bot theo mức rủi ro, kiểm tra số điện thoại và honeypot; OTP chỉ bật khi spam cao hoặc bước cần xác nhận, có thử nghiệm tác động tới conversion.

Theo dõi lỗi, uptime, thời gian tiếp nhận lead, backup và thử khôi phục. Có môi trường staging, data demo tách dữ liệu thật. Chọn stack cụ thể khi chốt đội triển khai/hạ tầng.

## 10. Lộ trình dự kiến

Ước tính 6–8 tuần cho MVP với 2 lập trình viên cùng thiết kế/QA bán thời gian, nội dung và dữ liệu giá được cung cấp đúng hạn. Tích hợp bên ngoài có thể kéo dài tùy quyền truy cập; đây là ước tính, chưa phải cam kết.

| Giai đoạn | Nội dung | Kết quả |
|---|---|---|
| Tuần 1 | Chốt phạm vi, khu vực, giá, wireframe mobile, dữ liệu, định nghĩa KPI | Prototype và đặc tả được rà soát |
| Tuần 2–3 | Client, API gói/giá, form, admin gói/giá và lead | Luồng tư vấn hoạt động trên staging |
| Tuần 4–5 | Landing/CMS, nguồn chiến dịch, phân công/SLA, báo cáo, tích hợp ưu tiên | Theo dõi nguồn tới kết quả bán hàng |
| Tuần 6–8 | Test, mobile, hiệu năng, bảo mật quyền truy cập, training, rollout | MVP sẵn sàng vận hành |
| Sau ra mắt | A/B test, quiz nâng cao, chăm sóc, referral, tích hợp thêm | Tối ưu dựa trên dữ liệu |

MVP nên gồm 5 nhóm sản phẩm, 3 mẫu landing page, 1–3 khu vực pilot, CRM cơ bản, nguồn chiến dịch và một kênh ads ưu tiên. Hệ thống giá vẫn thiết kế mở rộng nhiều khu vực.

## 11. Tiêu chí nghiệm thu và KPI

- Giá/thiết bị/tốc độ đồng nhất ở mọi nơi; quy tắc ngày hiệu lực và khu vực được kiểm thử.
- Lead lưu trước khi báo thành công, không mất khi notification lỗi, không tạo trùng khi gửi lại.
- Mỗi lead có nguồn, người phụ trách, lịch sử và phiên bản giá đã xem.
- Người không được phân quyền không đọc được lead qua giao diện hoặc API.
- Marketing tags tuân theo lựa chọn theo dõi; không lộ thông tin cá nhân trong analytics/URL.
- Conversion browser/server được chống đếm trùng; quy trình ngoại tuyến có log và xử lý lỗi.
- Mobile không tràn ngang/che CTA; form dùng được trên iOS/Android và mạng yếu.
- Sitemap/canonical hoạt động; trang admin và trang chứa dữ liệu riêng không được lập chỉ mục.

KPI: tỷ lệ lưu lead thành công; tỷ lệ liên hệ được; lead đủ điều kiện; CPL đủ điều kiện; chi phí/lắp thành công; thời gian phản hồi; tỷ lệ chốt; tỷ lệ hủy; khách giới thiệu. Định nghĩa lead đủ điều kiện: liên hệ được, nhu cầu phù hợp, địa chỉ trong phạm vi phục vụ và hạ tầng được xác nhận ở bước tương ứng.

SLA mục tiêu nội bộ: liên hệ lần đầu trong 5–10 phút trong giờ trực, nhắc quản lý khi quá hạn. Chỉ công bố lời hứa cho khách khi đội ngũ đáp ứng được. Thiết lập baseline sau giai đoạn pilot rồi đặt mục tiêu cải thiện; không cam kết mức tăng conversion khi chưa có số liệu.

Các quyết định cần chốt trước lập trình: thương hiệu/tên miền và quyền sử dụng; khu vực pilot; bảng giá đã xác nhận; đội/giờ tư vấn; kênh ads ưu tiên và quyền tích hợp; ngân sách/đội triển khai; CRM có sẵn hay dùng admin mới.

## 12. Phân tích lượt truy cập và dữ liệu lead

Mục tiêu: tận dụng dữ liệu có liên quan để phát hiện spam, chọn đúng khu vực/gói, ưu tiên tư vấn và đo chất lượng quảng cáo. “Độ tin cậy” là độ xác thực của dữ liệu và yêu cầu tư vấn, không phải đánh giá phẩm chất của người dùng. Tách điểm tin cậy, ý định mua, mức phù hợp và rủi ro tự động hóa; không gộp thành một điểm thiếu giải thích.

### 12.1. Những gì có thể biết

| Dữ liệu | Cách lấy | Mức độ/giới hạn |
|---|---|---|
| IP công khai | Backend/CDN đã cấu hình trusted proxy | IP của kết nối tại thời điểm truy cập, không phải ID duy nhất của một người |
| ASN, ISP, loại mạng | Cơ sở dữ liệu IP intelligence | Có thể là mạng di động, văn phòng, VPN hoặc bên cấp dải IP; không xác nhận nhà mạng tại nhà |
| Quốc gia/tỉnh/thành ước tính | GeoIP và bán kính chính xác nếu có | Không phải địa chỉ lắp đặt hoặc tọa độ chính xác; hiển thị “ước tính” |
| Vị trí thiết bị | API vị trí của trình duyệt khi khách đồng ý | Chỉ dùng trong luồng kiểm tra địa chỉ, không yêu cầu ngay khi vào trang; vẫn có sai số |
| Thiết bị/trình duyệt | Thông tin trình duyệt thông thường | Dùng tối ưu trải nghiệm; không theo dõi dấu vân tay thiết bị bí mật |
| Nguồn quảng cáo | UTM, referrer, click ID khi phù hợp | Phân biệt nguồn khai báo và nguồn được đối chiếu; không mặc định xác thực tuyệt đối |
| Hành vi tại website | Event xem gói, so sánh, chọn vùng, form | Lưu theo lựa chọn đo lường; chỉ mô tả hành vi trên website này |
| Số điện thoại | Khách gửi trong form | Chuẩn hóa/kiểm tra cấu trúc không chứng minh số hoạt động hoặc người gửi sở hữu |
| Nhà mạng di động | Đầu số hoặc dịch vụ lookup được cấp phép | Đầu số chỉ gợi nhà mạng ban đầu; chuyển mạng giữ số khiến nhà mạng hiện tại khác |
| Quyền kiểm soát số | OTP thành công hoặc nhân viên liên hệ xác nhận | Không chứng minh danh tính pháp lý hoặc khách không có ý định spam |
| Nhà mạng tại địa chỉ lắp | Khách xác nhận hoặc nguồn tích hợp được cấp quyền | Không suy ra từ đầu số điện thoại hoặc IP truy cập |

Theo [MaxMind](https://support.maxmind.com/knowledge-base/articles/maxmind-geolocation-accuracy), IP mobile/VPN có thể định vị không chính xác; lưu độ tin cậy/bán kính nếu nhà cung cấp trả về. Dịch vụ như [Twilio Lookup](https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence) có thông tin carrier/loại số, nhưng cần kiểm tra riêng độ bao phủ Việt Nam, khả năng xử lý số chuyển mạng, phí và điều kiện sử dụng. Không cam kết mọi số đều tra cứu được.

### 12.2. Pipeline xử lý

1. Lượt truy cập: xác định IP từ proxy tin cậy; kiểm tra bot/rate limit; phân giải ASN, ISP, GeoIP qua cache có TTL và nguồn dữ liệu được cập nhật.
2. Tạo session ID ngẫu nhiên; việc lưu ID phân tích lâu dài phụ thuộc lựa chọn người dùng. Không dùng IP để gộp người hoặc suy đoán quan hệ hộ gia đình.
3. Khi gửi form: kiểm tra server, chuẩn hóa số về dạng quốc tế +84 theo quy tắc số Việt Nam, kiểm tra vùng, khóa chống gửi trùng; lưu lead trước.
4. Enrichment chạy nền: IP/phone lookup nếu được cấu hình, phát hiện yêu cầu trùng, trích nhu cầu và tạo điểm. Chậm/lỗi nhà cung cấp không làm mất lead hoặc chặn form.
5. Trả về admin bộ điểm, mức đủ dữ liệu, nguồn, thời điểm và lý do. Phía khách chỉ thấy xác nhận/đề nghị bổ sung phù hợp.
6. Cập nhật điểm khi OTP, cuộc gọi, hạ tầng và trạng thái lắp đặt được xác nhận. Giữ phiên bản thuật toán và lịch sử để kiểm tra.

### 12.3. Thuật toán giai đoạn đầu

**A. Contact confidence, 0–100:** thang điểm heuristic kiểm chứng dữ liệu, không phải xác suất “khách thật”. Khởi đầu 0; +20 cấu trúc số hợp lệ; +30 OTP thành công; +30 liên hệ được và xác nhận yêu cầu; +20 khách xác nhận nhu cầu/địa chỉ phù hợp. Thiếu OTP không được xem là spam. Khi chỉ kiểm tra cú pháp, hiển thị “20/100 – mới xác thực cấu trúc số”, không hiển thị tỷ lệ tin tưởng 20%.

**B. Purchase intent, 0–100:** +25 chọn gói; +20 dùng so sánh/quiz; +25 đặt lịch liên hệ hoặc khai báo thời gian cần lắp; +20 xem điều kiện/tổng chi phí; +10 quay lại cùng session được phép ghi nhận. Giới hạn mỗi tín hiệu một lần trong cửa sổ 7 ngày; giảm ảnh hưởng hành vi cũ. Khách từ ads gửi form ngay vẫn được tư vấn, không bị hạ mức phục vụ chỉ vì xem ít trang.

**C. Service fit:** đánh giá nhu cầu dịch vụ, địa chỉ phục vụ và kết quả hạ tầng; mỗi mục có trạng thái yes/no/unknown và nguồn xác nhận. Chỉ tính điểm trên phần đã biết, đi kèm data completeness. “Chưa khảo sát” khác “không có hạ tầng”; không dùng GeoIP làm căn cứ chọn bảng giá cuối cùng hoặc loại lead.

**D. Automation risk, 0–100:** dùng tín hiệu server và hành vi abuse. Điểm khởi đầu 0; honeypot +50; vượt ngưỡng gửi bất thường +30; nhiều số khác nhau được gửi theo một mẫu tự động +30; thời gian/chuỗi hành động bất khả thi +20. Clamp 0–100; tốc độ điền nhanh, thiếu JavaScript hoặc IP VPN riêng lẻ không đủ để kết luận bot. Ngưỡng thử nghiệm: <40 xử lý bình thường; 40–69 xác minh nhẹ; ≥70 xác minh mạnh hoặc chờ kiểm tra. Chỉ từ chối tự động khi có bằng chứng kỹ thuật abuse rõ; cho người thật đường tiếp tục.

Rate limit cần nhiều tín hiệu/session/endpoint; ngưỡng trên IP cao hơn và hiệu chỉnh cho NAT, mạng di động, văn phòng dùng chung. Không gắn nhãn IP có nhiều người là gian lận.

**Ưu tiên bán hàng:** kết hợp intent, fit đã biết, thời gian cần lắp, thời gian chờ và ca trực. Confidence/risk quyết định bước xác minh cần thêm, không quyết định giá hoặc đối xử với khách. Lead mới đủ số điện thoại phải được tiếp nhận kể cả chưa có lịch sử hành vi.

Ngưỡng và trọng số là đề xuất pilot, cần đo false positive, độ liên hệ được và conversion trước khi áp dụng rộng.

### 12.4. Phân tích nội dung khách gửi

- Trích dịch vụ, số tầng, thiết bị, khu vực, ngân sách khách tự khai báo, thời gian cần lắp và nhu cầu đặc biệt.
- Dùng bộ quy tắc trước; mô hình ngôn ngữ tùy chọn cho ghi chú tự do, trả kết quả có cấu trúc và trích đoạn làm bằng chứng.
- Chưa rõ thì trả unknown và đề xuất câu hỏi cho nhân viên. Không tự suy đoán thu nhập, tuổi, danh tính hoặc đặc điểm nhạy cảm từ IP, tên, cách viết hay số điện thoại.
- AI không tự quyết định số thật, nhà mạng, hạ tầng hoặc giá; các trường này cần validator/nguồn dữ liệu có thẩm quyền.
- Trước khi gửi ghi chú tới dịch vụ AI ngoài, loại dữ liệu không cần thiết như số điện thoại, IP và tên đầy đủ; cấu hình nhà cung cấp và phạm vi xử lý phù hợp.
- Khách có thể cung cấp nhu cầu bằng form có lựa chọn thay vì buộc nhập văn bản dài.

### 12.5. Hồ sơ phân tích trong admin

Hồ sơ gồm số điện thoại được bảo vệ; trạng thái xác thực; contact confidence; intent; fit/completeness; automation risk; gói quan tâm; khu vực khách xác nhận; GeoIP ước tính; ISP/ASN của lần truy cập; carrier điện thoại nếu tra cứu được; current home ISP do khách khai báo; nguồn quảng cáo; lịch sử và hành động tiếp theo.

Mỗi trường enrichment có value, source, observed_at, confidence/accuracy nếu có, status (observed/inferred/confirmed/unknown). Không tự tạo phần trăm chính xác khi nhà cung cấp không trả hoặc hệ thống chưa được hiệu chuẩn.

Ví dụ giả lập: khách chọn Sky, địa chỉ tự khai báo Hà Nội, mạng truy cập được phân giải là mạng di động; carrier số chưa tra cứu được. Admin hiển thị mạng kết nối hiện tại là ước tính và mạng Internet tại nhà là “chưa xác nhận”, đề nghị nhân viên hỏi thêm. Không suy luận khách đang dùng Internet cố định của nhà mạng di động đó.

### 12.6. Khai thác dữ liệu trong marketing

- Báo cáo nguồn → lead hợp lệ → liên hệ được → hạ tầng khả dụng → lắp thành công; đo tỷ lệ spam và chi phí từng bước.
- Phân tích theo nhu cầu/gói/khu vực khách xác nhận để chọn nội dung và phân bổ ngân sách.
- A/B test yêu cầu OTP theo mức rủi ro thay vì mọi khách; đo mức giảm spam và số lead thật bị mất.
- Nguồn quảng cáo được xác minh và kết quả CRM dùng gửi conversion được phép; không đưa nguyên hồ sơ IP/vị trí/điểm rủi ro cá nhân lên nền tảng quảng cáo.
- Không thay đổi giá dựa trên suy đoán khả năng trả tiền, thiết bị hoặc mạng đối thủ; chỉ áp dụng bảng giá/ưu đãi có điều kiện rõ ràng.
- Nếu chưa đủ dữ liệu, dùng rule và báo cáo thống kê. Khi có tập nhãn đáng tin cậy, thử mô hình dự báo liên hệ được/lắp thành công riêng biệt, đánh giá trên giai đoạn thời gian sau và theo nguồn; tránh dùng thông tin phát sinh sau kết quả làm đầu vào dự báo.

### 12.7. Quản lý dữ liệu và triển khai

Tách dữ liệu phục vụ yêu cầu tư vấn, chống abuse, phân tích tùy chọn và marketing tùy chọn. Không bật GPS hoặc tracking bổ sung khi người dùng chưa chọn; không dùng fingerprint bí mật, đọc danh bạ, theo dõi ngoài website hay mua hồ sơ cá nhân không rõ nguồn.

Số điện thoại mã hóa khi lưu; dùng HMAC có khóa cho matching nội bộ thay vì hash đơn giản dễ dò; chìa khóa quản lý riêng. Lưu IP thô ngắn hạn phục vụ chống abuse, dữ liệu marketing tổng hợp giữ theo lịch lưu trữ đã định; đề xuất ban đầu IP log 7–30 ngày cần chốt theo mục đích vận hành. Có phân quyền, log truy cập, hạn chế export, xóa dữ liệu và ngừng marketing khi được yêu cầu.

MVP bổ sung: GeoIP/ASN, validator số điện thoại, chống gửi trùng/bot, scores có giải thích, nhãn unknown và dashboard chất lượng. Giai đoạn hai: lookup phone qua nhà cung cấp đã kiểm chứng, OTP theo rủi ro, NLP nhu cầu, mô hình dự báo khi đủ nhãn.

Tiêu chí nghiệm thu: không nhầm ISP truy cập với ISP tại nhà; không dùng đầu số làm carrier hiện tại; IPv4/IPv6 được hỗ trợ; không tin header IP do client tự khai; NAT/VPN không bị chặn đơn lẻ; lỗi lookup không chặn lead; scores có phiên bản/lý do; dữ liệu thật không xuất hiện ở URL/analytics/log không được bảo vệ; nhân viên sửa được trường suy luận; cập nhật điểm theo bằng chứng mới.

## 13. Kiến trúc được chọn: Python — Vercel — Supabase — R2

Theo lựa chọn mới của người dùng, thay thế đề xuất Next.js/Node.js/Redis/BullMQ/SSE bằng FastAPI + Jinja2 trên Vercel, Supabase PostgreSQL/Auth/Realtime/Queues và Cloudflare R2. Nghiệp vụ và thuật toán viết bằng Python; trình duyệt dùng HTML/CSS/JavaScript gọn, database dùng SQL.

Xem [đặc tả kiến trúc](KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md) cho luồng queue/webhook, tác vụ serverless hữu hạn, phân quyền, pool kết nối, cache, upload và tiêu chí độ trễ. Tài liệu này thay thế các lựa chọn triển khai cũ khi có khác biệt; các yêu cầu sản phẩm và phân tích dữ liệu ở trên tiếp tục áp dụng.
