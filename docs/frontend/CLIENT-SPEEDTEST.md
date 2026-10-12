# Đo tốc độ kết nối

Trang `/do-toc-do` mở từ lời mời ngay dưới hero/slide trang chủ hoặc tiện ích footer. Đã bỏ mục đo mạng trong navbar desktop/mobile. Khách bấm bắt đầu mới tải engine và truyền dữ liệu thử. Trang dùng header, thông tin liên hệ trong Admin, catalog, địa bàn và form tư vấn hiện có.

## Phương pháp và giới hạn

- Engine chính thức `@cloudflare/speedtest` 1.14.1 đo trực tiếp từ trình duyệt tới Cloudflare; dữ liệu tải thử không đi qua backend Python/Vercel, Supabase hoặc R2.
- 12 ping HTTP; download/upload lần lượt dùng mẫu 100 KB, 1 MB, 10 MB. Payload thông thường tối đa 56.4 MB cộng metadata và overhead. Retry của engine khi endpoint bận có thể làm lượng truyền lớn hơn; giao diện ghi khoảng 60 MB cho lượt thông thường, không tuyên bố giới hạn tuyệt đối.
- Mbps, ping, jitter, ping/jitter khi tải do SDK tính. Min/max và số mẫu lấy từ các mẫu ping hợp lệ. Độ trễ cần ít nhất một mẫu; jitter cần hai mẫu; thiếu mẫu hiện `—`, không hiện 0. Loaded latency loại các request quá ngắn theo phương pháp SDK.
- Dial dùng thang log `log10(1 + Mbps) / log10(1001)`, chặn ở 1000+; giá trị số vẫn hiển thị tốc độ thực vượt 1000. Vạch số và kim dùng cùng hàm. Animation nội suy kim giữa mẫu thật; không sinh tốc độ ngẫu nhiên.
- Timeout từng request bandwidth 10 giây, toàn lượt 60 giây; hủy, offline, ẩn tab hoặc rời trang dừng các request. Kết quả chưa đầy đủ không được ghi đo hoàn tất.
- Mất gói chưa đo vì chưa có TURN. ASN và vị trí từ IP không chứng minh nhà mạng hiện tại hoặc địa chỉ chính xác. Kiểu kết nối chỉ hiện khi trình duyệt cung cấp.
- Metadata được lấy trước phép đo để tránh ảnh hưởng ping khi rảnh. Logging SDK tắt; kết quả/IP chỉ nằm trong trang hiện tại, không lưu vào backend, localStorage hay analytics. Sao chép kết quả không chứa IP.

## Gói mạng đề xuất

### Vị trí tùy chọn khi bắt đầu đo

`speed_location.js` gọi native Geolocation sau khi bấm bắt đầu, không chặn engine. Từ chối, không hỗ trợ hoặc chưa trả lời vẫn đo; thông báo sau 8 giây không bỏ callback cấp quyền trễ của lượt hiện tại. Sau đo, tọa độ hiện tại gửi trực tiếp từ browser tới BigDataCloud client reverse-geocode, timeout 5 giây, không gọi backend/proxy, không lưu tọa độ hoặc ghi analytics. Không sử dụng IP fallback khi khách từ chối.

Đối sánh tên tỉnh/thành duy nhất trong danh mục đang công bố; xã/phường chỉ trong tỉnh vừa khớp, độ chính xác phải ≤10 km. Không khớp, trùng hoặc ngoài Việt Nam thì dùng lựa chọn thủ công. Gợi ý luôn cần bấm “Dùng địa bàn gợi ý”; không tự thay địa bàn đang chọn. Hủy, đổi lượt, offline, ẩn/rời trang fence callbacks và response trễ. API nhà cung cấp có thể chưa cập nhật địa giới; địa bàn đo cũng có thể khác nơi lắp đặt, nên không coi gợi ý là vị trí chính xác.

Nguồn: [MDN Geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition), [BigDataCloud client API](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api), [Fair Use](https://www.bigdatacloud.com/docs/article/fair-use-policy-for-free-client-side-reverse-geocoding-api), [privacy](https://www.bigdatacloud.com/privacy-and-cookie-policy). Disclosure có trước nút đo và trong trang thông tin dữ liệu.

### Chọn gói và xác nhận giá

Catalog công khai, loại Internet/combo/doanh nghiệp; lọc phạm vi theo đường dẫn xã → tỉnh → vùng. Tối đa ba gói, ưu tiên tốc độ niêm yết cao hơn download đã đo 15%, rồi tốc độ/tên/mã ổn định. Chưa có kết quả thì gói chỉ để tham khảo; không cam kết thay gói sẽ đạt tốc độ niêm yết.

Giá gọi `POST /api/v1/quotes` với `plan_id`, `region_id` cụ thể nhất và `billing_months: 6`. Hiển thị đúng giá tháng hoặc tổng trả trước, VAT, kỳ thanh toán và số tiền ban đầu. Không có giá giữ “Cần tư vấn”; gói `not_available` được thay thế. Đổi địa bàn hủy response cũ và cập nhật gói/giá ngay cả lúc đo; request giá tạm dừng đến khi đo xong. CTA mở form với đúng `selectedPlanId`, gửi lead qua luồng hiện có.

## Tệp và provenance

- Route: `src/pagefpt/web/client_routes.py`; template `templates/client/speedtest.html`.
- CSS riêng: `static/css/client-speedtest.css`; model/controller/recommendations trong `static/js/client/`.
- Vendor: `static/js/vendor/cloudflare-speedtest-1.14.1.js`, bản MIT được ghim theo upstream. Có bản vá tương thích: đọc các tên Server-Timing hiện tại và dự phòng khi Resource Timing vắng mặt/bị hạn chế. Giữ giấy phép ở `cloudflare-speedtest-LICENSE.txt`.
- SHA256 vendor: `d9ca5ddcf5370d47b7b720e3f633d75a43a36bbf404a349c13aad26fdc8847ab`.
- Nguồn: [Cloudflare Speedtest](https://github.com/cloudflare/speedtest), [npm 1.14.1](https://www.npmjs.com/package/@cloudflare/speedtest/v/1.14.1).

Không thay schema Supabase, biến môi trường, quyền Admin hoặc hạ tầng R2 cho tính năng này.

### Tương thích trình duyệt mobile (08/10/2026)

Khi Resource Timing vắng mặt hoặc các mốc bị che về 0, engine dùng `performance.now()` trước fetch, khi nhận header và khi đã đọc xong body. Request vẫn phải thành công; không sinh số giả khi endpoint bị chặn. Phép đo dự phòng tính trên payload thật của endpoint (upload gửi đúng số byte, download yêu cầu đúng dung lượng) và thời gian thực; có RTT nên không đồng nhất với thông lượng thuần. Giao diện ghi rõ kết quả ước tính. Quyền vị trí vẫn tùy chọn. Chrome và WebKit được kiểm tra với request giả lập; chưa xác nhận trên thiết bị iPhone của khách.

### Thông tin kết nối và giao diện gọn (09/10/2026)

IP công khai và điểm đo lấy trực tiếp từ response header Cloudflare trong trình duyệt. Tra cứu RIPEstat `network-info` (IP → ASN), `as-overview` (ASN → tên tổ chức đăng ký), `maxmind-geo-lite` (IP → vị trí ước tính). Không gửi IP tới GA4 hoặc dữ liệu form. Thông báo dữ liệu nêu rõ Cloudflare/RIPEstat nhận IP khi bấm bắt đầu.

Tra cứu chạy song song, timeout chung 8 giây, không chặn hoặc quyết định thành công phép đo. Dừng/đo lại/tab ẩn hủy tra cứu; phản hồi cũ không cập nhật lượt mới. Nguồn thiếu dữ liệu hoặc ASN/vị trí không duy nhất thì giữ Không xác định. Tên tổ chức ASN không xác nhận hợp đồng nhà mạng của khách và vị trí IP không phải địa chỉ lắp đặt.

Trang ưu tiên download/upload/ping/jitter, IP, nhà mạng/tổ chức ASN, vị trí ước tính và điểm đo. Chỉ số phụ, quyền vị trí và giải thích nằm trong phần mở rộng. Không hiển thị số mất gói giả khi chưa đo.

Tài liệu API đã đối chiếu: [RIPEstat Network Info](https://stat.ripe.net/docs/data-api/api-endpoints/network-info), [AS Overview](https://stat.ripe.net/docs/data-api/api-endpoints/as-overview), [MaxMind GeoLite](https://stat.ripe.net/docs/data-api/api-endpoints/maxmind-geo-lite).


## Thẻ gói đề xuất — cập nhật 10/10/2026

Thẻ dùng component `speed_plan_cards.html`, ảnh chiếm 30% chiều cao; chiều cao chung 700px. Desktop có tối đa ba cột, tablet hai cột, mobile một cột. Danh sách chỉ có một hoặc hai gói tự căn giữa với chiều rộng giới hạn. Các thẻ có cùng chiều rộng/chiều cao trong cùng bố cục, nút đăng ký nằm cùng hàng.

Nhãn huy hiệu, tốc độ, thiết bị, đăng ký và chi tiết lấy từ `card_labels` đã công bố trong Admin. Ảnh thiếu dùng minh họa Internet; không bịa ảnh thiết bị thực tế. Tên dài được giới hạn hai dòng trên thẻ và có thể đọc đủ trong popup. Nội dung thiết bị dài cuộn riêng; popup hiển thị đầy đủ mô tả và thiết bị.

Giá tách thành số tiền, đơn vị, nhãn loại giá và ghi chú VAT/kỳ/tổng ban đầu. Hiện vẫn báo giá kỳ 6 tháng theo hành vi trước của trang đo tốc độ. Giá mỗi tháng không bị nhầm với tổng kỳ. Quote không có cước tháng chỉ hiển thị tổng thanh toán ban đầu, không quy thành giá tháng bằng 0. Quote sai kiểu, âm hoặc hết hạn không hiển thị như giá xác nhận. Khi đổi địa bàn, giá cũ bị xóa trong lúc xác nhận giá mới.

Sau khi đo, thẻ đầu trong kết quả xếp hạng được nhấn viền cam và nhãn “Gợi ý từ kết quả đo”; không gọi là tốt nhất hoặc bảo đảm tốc độ thực tế. Lý do chỉ đối chiếu băng thông công bố với download thực đo. Khi chưa đo, không hiển thị nhãn này. Kết quả đo hiển thị cục bộ, không chuyển vào lead/Google Analytics.

Các hook nội dung: nhu cầu gia đình/học tập/làm việc, nhiều nhu cầu kết nối, kết nối kinh doanh. CTA lấy từ cấu hình Admin; không thêm số người xem, số lượng còn lại hoặc ưu đãi không có dữ liệu.

Quote đã xác nhận được chia sẻ với lớp quote hiện có để popup có cùng thông tin giá. Form đăng ký vẫn xác nhận quote tại backend và giữ mã gói được chọn.
