# Trang chủ mobile, slide Admin và speedtest — 08/10/2026

## Yêu cầu và kết quả code

- Slide trang chủ cấu hình bởi Admin: tiêu đề, mô tả ngắn, ảnh thư viện R2 đã ready, mô tả ảnh, CTA, gói tư vấn tùy chọn, bật/tắt, bắt đầu/kết thúc giờ Việt Nam, xếp thứ tự/xóa; tối đa 12 slide. Ảnh URL/dimensions được server xác nhận, không nhận URL ảnh tùy ý.
- Slider có nút trước/sau/dots/vuốt, tùy chọn tự chuyển và dừng khi hover/focus/tab ẩn; respects reduced motion. Không dựng giá/ưu đãi giả khi chưa cấu hình. Nếu không có slide bật/còn hiệu lực, dùng hero tư vấn trung tính.
- Chính xác 3 danh mục bảng giá; tên đầy đủ/tên ngắn riêng, chọn gói bằng checkbox hoặc nhóm dịch vụ, tùy chọn mọi gói. Chỉ gói đã công bố trong public catalog được render. Thanh căn giữa và sticky dưới header, không cuộn ngang/cắt chữ; danh mục trống không giữ chiều cao thẻ.
- Mobile: địa bàn một cột, label/nút ngắn, số hotline giữ từ Admin; native select và viewport WebKit 320 được kiểm tra. Sticky CTA chỉ còn “Nhận tư vấn”, Zalo, gọi.
- Giải pháp công nghệ: 4 thẻ ngắn với ảnh thiết bị; mobile scroll-snap, thẻ 75vw căn giữa, nút trước/sau và lật chi tiết; mặt không hiển thị inert/aria-hidden, focus chuyển sang mặt đang xem. Desktop grid; reduced motion không animate flip.
- Quy trình: 4 minh họa SVG theo bước (biểu mẫu, hạ tầng, thiết bị, kiểm tra) cùng nhãn đọc được.
- Footer mobile: thương hiệu/liên hệ, 2 nhóm link, thông tin địa điểm gập/mở, copyright và link bảo mật. Đã bỏ hoàn toàn khối “Minh Bạch Vai Trò Tư Vấn & Chính Sách Báo Giá”, không thêm tuyên bố đại lý chính thức.

## Speedtest: tái hiện và sửa

Trước sửa, test browser để latency có Resource Timing nhưng bandwidth không có: request download 100 KB thành công rồi engine ném `Cannot read properties of undefined (reading 'transferSize')`, giao diện báo chưa hoàn tất giống biểu hiện trên ảnh. Chưa thu được log của iPhone thật nên không kết luận mọi lỗi trên thiết bị đó chỉ có nguyên nhân này.

Sau sửa, mốc fetch/headers/body thực được lưu; chỉ khi entry vắng hoặc timing bị che/không hợp lệ mới dùng dự phòng. Vẫn yêu cầu response thành công, tốc độ tính từ bytes/time; UI công khai “ước tính” vì thời gian gồm RTT. Không tạo số ngẫu nhiên hoặc đổi lỗi mạng thật thành thành công. Ping/Jitter và quyền vị trí tùy chọn giữ luồng hiện có; không đưa payload đo qua Vercel/Supabase/R2.

Nguồn đối chiếu: [Cloudflare engine](https://github.com/cloudflare/speedtest), [issue thiếu Resource Timing](https://github.com/cloudflare/speedtest/issues/17), [MDN Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming). Bản vendor có patch được ghi provenance/SHA tại `docs/frontend/CLIENT-SPEEDTEST.md`.

## Kiểm chứng

- Test mới `test_home_merchandising.py`: render production thật từ cấu hình, window/disabled, đúng 3 tên khác nhau, URL ảnh tùy ý/thời gian không timezone bị từ chối, plan/media không hợp lệ, auth, giữ dữ liệu khi input sai.
- `home_mobile.cjs`: dùng editor Admin thật → lưu → mở client, nút slide/CTA đúng plan, danh mục trống, thẻ 75%, lật/inert, cuộn; 320/360/390/430/768/1440. Chrome và WebKit đều qua, không lỗi JS/tràn ngang/cắt chữ ở các phần kiểm tra.
- `speedtest_mobile.cjs`: Chrome/WebKit, mỗi engine 4 tình huống: bình thường, thiếu bandwidth timing, timing che/không có protocol, mạng bị chặn. 3 tình huống đầu đo hoàn tất; tình huống chặn trả error, dự phòng có thông báo ước tính. Request đo giả lập để lỗi timing tái hiện xác định; không coi đây là tốc độ mạng của người dùng.
- Bằng chứng JSON/ảnh/log ở `.local/qa/home-mobile`, `.local/qa/speedtest-mobile`; chỉ chứa dữ liệu QA. WebKit Linux không thay thế nghiệm thu trên iPhone vật lý.
- Không thêm migration hoặc biến môi trường: dùng JSON cấu hình có version trong bảng hiện có và kiểm tra quyền/MFA/CSRF.

## Thao tác Admin

Mở **Cài đặt & Trạng thái → Trang chủ: ưu đãi & danh mục** (hoặc liên kết từ Nội dung/Bảng giá). Tải ảnh vào **Nội dung & Ưu đãi → Hình ảnh** trước, chọn ảnh trong slide. Chọn gói/nhóm cho 3 danh mục, lưu. Chỉ slide bật và còn thời hạn xuất hiện; công bố gói và giá riêng trong mục Bảng giá để khách có giá thật.

## Kết quả cuối và triển khai

- Pytest: **310 passed**, 74.15s (`.local/qa/mobile-home-final-pytest.log`).
- 14 bộ JS contracts qua; Ruff, kiểm tra kiến trúc và mypy 95 source files qua; `git diff --check` không lỗi.
- Giao diện Chrome/WebKit: mỗi engine **9 điểm kiểm tra**, gồm tối đa 12 nút slide ở 320 px; không tràn ngang. Trước sửa cuối, 12 nút khiến scrollWidth 340 ở viewport 320; sau sửa nhóm nút cuộn trong khung, kiểm thử bổ sung qua.
- Speedtest Chrome/WebKit: mỗi engine **4 tình huống** qua, có thông báo ước tính trong luồng dự phòng.
- Candidate READY `dpl_FgLBw3WZ58WqdbmTpf9QqGFLtZmK` qua **38 kiểm tra HTTP/asset SHA256**, sau đó promote thành công.
- `https://fpt-vungtau.com` qua **40 kiểm tra HTTP**: trang public, readiness, Admin redirect/API 401, JS/CSS trùng nguồn, www redirect 308 giữ path/query. `vercel inspect fpt-vungtau.com` xác nhận đúng deployment ID và READY.
- Chrome trên tên miền qua **7 điểm kiểm tra**: 6 viewport 320–1440, footer, 3 danh mục, 4 minh họa, thẻ 75%, không cắt chữ/tràn; trang đo mạng không tự bắt đầu đo. Footer cao khoảng 592 px ở 390/430 và 613 px ở 320, gồm các link có vùng chạm thoải mái.
- WebKit trực tiếp đến URL HTTPS trên máy QA trả lỗi transport “Operation was cancelled”, cả khi bỏ qua kiểm tra certificate. Các kiểm tra WebKit nêu trên chạy thành công với server QA trên loopback; không báo đã kiểm thử WebKit trên tên miền/iPhone thật. HTTPS và response trên tên miền được xác minh độc lập qua HTTPX và Chrome.
- Đo thực trên tên miền bằng Chrome viewport iPhone, chủ động che Resource Timing bandwidth: **complete**, 46 request Cloudflare, download/upload đều có kết quả, hiển thị “ước tính”, không lỗi JS. Chỉ lưu trạng thái/metric, không lưu IP/ASN; đây là phép đo môi trường QA, không phải tốc độ của điện thoại khách. Bằng chứng `.local/qa/speedtest-mobile/live-report.json`.
- Thư viện ảnh, gói và slide production không bị thay đổi bởi kiểm thử. Chưa có slide bật thì trang chủ giữ hero trung tính; Admin cần tạo nội dung ưu đãi thật qua editor.

Hướng dẫn trường/API: `docs/frontend/HOME-MERCHANDISING.md`. Báo cáo menu Admin và những khoảng trống đã xác minh: `docs/qa/2026-10-08-admin-menu-audit.md`.
