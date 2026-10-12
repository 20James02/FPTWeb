# Advanced Consent Mode — 10/10/2026

## Hành vi

- Google tag chung trên client tải ngay, với bốn quyền denied trước config/event. Một page_view/trang; chưa chọn và từ chối vẫn gửi tín hiệu hạn chế không cookie.
- Sự kiện thủ công chưa đồng ý chỉ gồm loại sự kiện, URL/referrer sạch, send_to và form_location thuộc tập cố định. Không gửi ID gói, địa bàn, thử nghiệm, UTM hoặc thông tin nhập. Sau đồng ý analytics mới có tham số sản phẩm đã lọc; quyền quảng cáo luôn denied.
- ads_data_redaction=true, URL passthrough/Google Signals/cá nhân hóa quảng cáo tắt. Admin/preview không tải tag. Đổi cấu hình chung consent_mode=basic là đường quay lại chế độ chặn trước đồng ý.
- Thu hồi hạn chế ngay trong trình duyệt dù API lỗi; session ack đến muộn không được khôi phục quyền cũ. Nâng quyền vẫn chờ backend xác nhận. Preference và consent journal đổi sang 2026-10-v2, yêu cầu lựa chọn mới sau thay đổi thông báo.
- generate_lead chỉ sau receipt thành công, dedupe trong trang; receipt không gửi Google. Sự kiện gửi form thất bại không được tính chuyển đổi.
- Thông báo/chính sách ghi rõ đo lường hạn chế vẫn gửi Google khi chưa chọn hoặc từ chối, có thông tin kỹ thuật mạng. Không khẳng định cookieless là vô danh hoàn toàn hoặc miễn yêu cầu pháp lý.

## Lỗi được tái hiện và sửa

Real transport phát hiện Enhanced measurement lấy ep.form_destination từ action mặc định của form, chứa query gốc dù page_location thủ công đã sạch. Trước tải tag, code gắn URL sạch cho các form chưa khai báo action; không thay URL API hoặc payload gửi AJAX. Đồng thời áp dụng page_location/referrer sạch ở gtag set toàn cục trước consent update để bảo vệ hit do Google tự sinh.

## Kiểm chứng

- 64 kiểm thử Python liên quan UI/landing/lead/thử nghiệm/speedtest: pass; `.local/qa/advanced-consent-python-final.txt`.
- 22 file contract JavaScript: pass; bao gồm Advanced/Basic, denied/granted/withdrawn, PII, dedupe, API lỗi và session ack trễ.
- Chromium + WebKit: thông báo 320/390/1440 px, lựa chọn/khôi phục/thu hồi, 9 tuyến client, Admin loại trừ, lead SQL thật trong fixture riêng, conversion một lần. Google transport giả trong các kiểm thử này; `.local/qa/advanced-consent-final-checks.txt`.
- Real Google transport tại fixture: page_view và select_plan denied HTTP 204 với gcs=G100, không cookie GA trước lựa chọn hoặc sau từ chối; granted gcs=G101 với cookie và ID sản phẩm; thu hồi về G100 không ID. Không gửi lead thật hoặc đo mạng; `.local/qa/advanced-consent-google-local.json`.
- Ruff, Prettier và diff whitespace checks: pass. Inventory deployment FastAPI 243 files, không chứa credential hoặc fixture.

## Giới hạn

Chưa truy cập tài khoản/property GA4. Không chứng minh cookieless pings xuất hiện đầy đủ trong Realtime hoặc property đủ điều kiện mô hình hóa. Real transport cho thấy Form interactions tự động đang hoạt động: cần tắt trong Data stream để không đo cả form lựa chọn dữ liệu và không đếm trùng form_start do website tự đo. Cần kiểm tra Outbound clicks, Site search, Page changes/history và data redaction trong property. Bộ lọc sự kiện thủ công không bảo đảm kiểm soát mọi sự kiện tự động của property.

Tham khảo: [Google consent setup](https://developers.google.com/tag-platform/security/guides/consent), [Behavioral modeling](https://support.google.com/analytics/answer/11161109).

## Phát hành

Deployment: `dpl_7TibbJUB9KYMu75pLDfN7r3ikCzR`, https://fpt-d99e4m2mz-pettravel.vercel.app. Candidate READY vượt 71 kiểm tra, sau đó promote thành công. Domain https://fpt-vungtau.com được inspect xác nhận trỏ về deployment này, trạng thái Ready.

Live vượt 73 kiểm tra; các asset thay đổi khớp SHA256 mã nguồn. Real Google transport trên domain lặp lại thành công chưa chọn/từ chối/granted/thu hồi; HTTP 204 đúng measurement ID, G100/G101 phù hợp và không có các giá trị PII synthetic trong request. Không gửi lead hoặc đo mạng trên production. Bằng chứng: `.local/deploy-cli/advanced-consent-candidate-check.log`, `advanced-consent-live-check.log`, `advanced-consent-production-inspect.txt`, `.local/qa/advanced-consent-google-live.json`.

CLI có cảnh báo npm update-check không lấy được dist-tags; promote exit 0 và kiểm tra domain/transport đều xác nhận thành công. QA server riêng đã dừng và cleanup database fixture. Không push Git hoặc thay cấu hình property GA4.
