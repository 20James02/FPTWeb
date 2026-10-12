# Kiểm chứng slide, đo mạng và lựa chọn cookie/phân tích

Ngày hoàn tất kiểm chứng production: 10/10/2026 (Asia/Ho_Chi_Minh).

## Production

- Website: https://fpt-vungtau.com.
- Deployment: `dpl_9a7A8i6SmULT66UdkHmz6brvy5B2`, Vercel xác nhận Ready và domain trỏ đúng bản này.
- Bản build: https://fpt-r8ulrm8au-pettravel.vercel.app.
- Trước promote: 70 kiểm tra candidate thành công. Sau promote và kiểm lại ngày 10/10: 72 kiểm tra domain thành công, SHA256 tài nguyên cập nhật khớp source.
- Không thay đổi schema Supabase. Không commit/push toàn bộ cây làm việc đang có nhiều thay đổi từ các yêu cầu trước.

## Lựa chọn cookie/phân tích

- Thông báo tự xuất hiện sau 1 giây nếu chưa lưu lựa chọn. Có Đồng ý, Từ chối, Tùy chỉnh.
- Đồng ý bật phân tích; không tự bật marketing hoặc các quyền quảng cáo Google.
- Từ chối không cản xem gói/gửi tư vấn. Lựa chọn được lưu 180 ngày trên thiết bị; có thể thay đổi qua Lựa chọn dữ liệu ở footer.
- Chỉ lưu lựa chọn sau backend xác nhận thành công. Khôi phục qua backend khi chuyển trang. Phiên tạo một lần khi có nhiều yêu cầu đồng thời; lỗi mạng không ngăn gửi lead.
- LocalStorage chứa version, hai lựa chọn boolean và hạn sử dụng; không lưu số điện thoại, thông tin liên hệ hoặc session token ở bản ghi lựa chọn.
- Admin và preview không hiển thị thông báo hoặc khôi phục theo dõi.
- Chromium và WebKit kiểm tra thành công (Chromium kiểm lại ngày 10/10, log `.local/qa/cookie-browser-final.txt`): ba lựa chọn, ghi nhớ, thu hồi, 44px mục tiêu chạm, không che toolbar tại 320/390/1440px. Google transport bị chặn trong QA offline.
- Kiểm thử Google offline trên Chromium: 9 route client, Admin không có tag, một chuyển đổi cho lead có receipt SQL thật. Dữ liệu QA tổng hợp.

## Google Analytics trên domain thật

Measurement ID `G-D0J0XLJ891`.

- Trước đồng ý: 0 request Google tag, 0 request collect trong phiên kiểm tra.
- Bấm Đồng ý: Google tag HTTP 200; Google Analytics collect HTTP 204 cho page_view.
- Sang trang đo mạng: khôi phục đồng ý, page_view HTTP 204. Có scroll HTTP 204.
- Tắt phân tích ở footer: bật ga-disable; sang trang ưu đãi không tải Google script và analytics_opt_in=false. Từ chối được ghi nhớ.
- Kết quả chỉ ghi mã HTTP, Measurement ID và tên event; không ghi URL query đầy đủ hoặc thông tin khách.
- Không truy cập giao diện property Google Analytics; chưa xác nhận trạng thái thông báo phát hiện tag trong tài khoản hoặc báo cáo Realtime của người dùng.
- Bằng chứng: `.local/qa/media-cookie-google-live.json`, `.local/qa/cookie-live-mobile.png`. Các file .local không đưa lên Vercel/Git.

## Slide và thông tin đo mạng

- Slide trang chủ chỉ hiển thị ảnh hoặc video và link khi bấm; tên/ghi chú phục vụ Admin. Video tải sau khi bấm phát, có pause; không tải video tự động.
- Chromium: toàn chiều ngang tại 320/390/768/1440px, link cấu hình hoạt động, video phát/dừng, không còn mục đo mạng ở navbar.
- Gợi ý đo mạng đặt dưới slide. Trang đo mạng rút gọn chữ, thể hiện IP công khai, ASN/tổ chức và vị trí ước tính. Cloudflare cấp IP; RIPEstat bổ sung ASN/holder/GeoLite khi có kết quả hợp lệ.
- Tra metadata không chặn engine đo; deadline tổng 8 giây. Hủy/chuyển trang fence kết quả cũ. Dữ liệu không xác định được ghi rõ, không bịa nhà mạng hoặc vị trí.
- Vị trí GeoIP và ASN holder là ước tính, không xác minh địa chỉ lắp đặt hoặc nhà mạng hợp đồng của khách. Quyền vị trí vẫn tùy chọn.
- Home mobile Chromium kiểm tra 320/360/390/430/768/1440px, 12 slide, control, CTA chọn gói, ba danh mục, thẻ giải pháp 75%/flip/swipe.

## Kiểm thử và giới hạn

- Python: 376 passed, 108.87s, toàn bộ suite. Log `.local/qa/media-cookie-pytest-full.txt`.
- Node contracts: 31 passed, 0 failed. Có kiểm tra TTL/storage chặn, server acknowledgement, phiên đơn, preview, Google consent/PII/không trùng, dữ liệu RIPE không chắc chắn, timeout phiên vẫn gửi lead.
- Ruff các file Python liên quan và Prettier các JS liên quan thành công.
- Browser đo tốc độ dùng transport tổng hợp trong QA, không đo đường truyền người dùng. Ngày 10/10 chạy fixture riêng với cấu hình production đầy đủ (payload tối đa 10MB): Chromium thành công, gồm metadata, gói theo địa bàn, giá trả trước, CTA, hủy/lỗi/thử lại/chuyển tab/history và các kích thước màn hình. Log `.local/qa/media-speed-full-final.txt`. Lần chạy trước trên máy thiếu RAM/swap gặp timeout mock upload 10s; không tăng timeout production để che lỗi môi trường QA.
- Chạy lại ngày 10/10 với fixture speedtest riêng và payload mock giới hạn 1MB: thành công trên Chromium. Đã kiểm tra metadata IP/ASN/ISP/vị trí, gói theo địa bàn, giá trả trước, CTA, hủy/lỗi/thử lại/chuyển tab/history và bố cục 360/390/768/1024/1440px. Production vẫn giữ cấu hình payload tối đa 10MB. Trước đó assertion kiểm thử giả định thẻ đầu tiên luôn có giá tháng, không phù hợp fixture có giá trả trước; đã sửa kiểm tra mọi thẻ được chọn thay vì phụ thuộc thứ tự.

## Tài liệu

- https://developers.google.com/tag-platform/security/guides/consent
- https://vercel.com/docs/cli/promote
- `docs/frontend/GOOGLE-ANALYTICS.md`, `docs/frontend/HOME-MERCHANDISING.md`, `docs/frontend/CLIENT-SPEEDTEST.md`.
