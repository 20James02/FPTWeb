# Kiểm chứng GA4, liên hệ landing và form mobile — 09/10/2026

## Thay đổi

- Landing mobile: logo, đăng ký và menu trên một hàng; hotline ẩn ở header, header mặc định 56px.
- Hero form có tên, điện thoại và địa chỉ văn bản; chuyển tỉnh/thành xuống khu vực gói. Dữ liệu chuyển sang popup xác nhận; generic form không mang nhầm gói, đăng ký từ thẻ vẫn giữ gói/kỳ/phụ kiện/báo giá.
- Zalo trong footer, contact popup, thanh dưới mobile và popup xác nhận. Từng landing có hotline/Zalo/Messenger riêng; Zalo trống dùng hotline của landing, hotline trống dùng số chung. Hai landing không đổi liên hệ của nhau hoặc trang chủ.
- GA4 `G-D0J0XLJ891` ở client base và standalone telecom; không có ở Admin, không tải trong preview. Basic Consent Mode theo lựa chọn hiện có. Sự kiện thành công chỉ từ phản hồi máy chủ có receipt/event_id; dedupe theo receipt nội bộ trong trang.
- Các tham số chỉ lấy whitelist; không đưa ô nhập liên hệ, receipt, token, query/hash URL vào GA. Marketing attribution không đồng nghĩa bật cá nhân hóa quảng cáo.

## Kết quả kiểm tra

- `pytest -q`: **369 passed**, 124.87s. Log `.local/qa/client-analytics-pytest-final.log`.
- `node --test tests/contracts/*.mjs`: **27 passed**, không lỗi. Bao gồm consent/refusal/withdrawal, preview, một lần init, PII/URL filtering, marketing revoke, dedupe conversion.
- Browser fixture Chromium và WebKit: 9 route client có mã; Admin không có; consent tải một tag mỗi trang; gửi form lỗi không tạo conversion; receipt SQL thật tạo một conversion; lặp receipt không đếm thêm; đổi kỳ/phụ kiện tạo sự kiện; form trực tiếp được ghi nhận; withdrawal chặn sự kiện.
- Telecom fixture cả hai browser: preview, draft/publish, generic form 3 ô, chuyển dữ liệu, đăng ký từ thẻ giữ gói/phụ kiện/kỳ/region/quote, 3/6/9 thẻ bằng kích thước, menu, popup, 320–1440, uploader/save fencing.
- Regression campaign editor và profile/consent: qua. Mobile layout probe: **16 mẫu** (Chromium/WebKit × 305,320,375,390,430,767,768,1440), không tràn ngang; mobile header 56px, form 285.8px tại 390px và 321.6px tại 305–320px. Kiểm tra ảnh render 320/390px.
- Một lỗi `networkidle` trong test GA Chromium khi di chuyển nhanh qua nhiều trang đã được sửa ở harness: chờ module cần kiểm tra, không chờ toàn bộ các quote chạy nền. WebKit ghi nhận hủy request quote của trang cũ khi điều hướng; harness chỉ bỏ artifact này trong pha kiểm tra route, không bỏ lỗi trong luồng tương tác thực.

## Triển khai

- Vercel `pettravel/fpt-web`, production **`dpl_7fhoRkSqVKxuapu9s2dwpeu8iHdP`**.
- Candidate: `https://fpt-q0vztafw2-pettravel.vercel.app`, READY, **69 checks**.
- Production: `https://fpt-vungtau.com`, inspect xác nhận đúng deployment, READY, **71 checks**, asset SHA256 khớp source gồm google_analytics.js/api.js/CSS/JS đã thay đổi; www redirect và các boundary khách/Admin đúng.
- Dry upload đã kiểm tra 240 file, 2,472,682 byte; không .env, .local, .venv, credentials, tests/docs hoặc thư mục Supabase.
- Chrome trên tên miền thật: ba route client, một Google script load trên trang được cho phép, click Zalo có sự kiện, withdrawal dừng đo, Admin không có mã. Không gửi lead thử lên production.
- WebKit trực tiếp trên tên miền thật bị môi trường browser hủy điều hướng ngay khi mở URL, cả load/DCL và thử cấu hình trust; chưa xác định nguyên nhân. Không dùng kết quả này để khẳng định Safari production đã qua. Các luồng WebKit ở fixture và render local đều qua; HTTPS/readiness/71 HTTP checks trên domain đều qua.
- Transport Google bị chặn trong QA để không gửi test event vào property thật. **Chưa xác nhận dữ liệu trong GA4 Realtime/DebugView**, chưa sửa các settings trong tài khoản Google. Lựa chọn hiện theo trang mở; cần banner/ghi nhớ consent nếu muốn tăng độ bao phủ giữa các trang.

## Tài liệu vận hành

Xem [GOOGLE-ANALYTICS.md](../frontend/GOOGLE-ANALYTICS.md) cho tracking plan, key event, UTM, dimensions, funnel, redaction và các nâng cấp đề xuất.
