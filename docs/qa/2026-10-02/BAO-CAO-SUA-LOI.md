# Sửa lỗi tích hợp PageFPT — 02/10/2026

Đã sửa và kiểm chứng cục bộ năm lỗi F-01..F-05 trong [báo cáo 01/10](../2026-10-01/BAO-CAO-KIEM-THU.md). Giữ Python/FastAPI + Jinja2 và cấu trúc hiện tại. Không triển khai Vercel, không thay đổi tài khoản Supabase/R2 hoặc gửi dữ liệu khách hàng ra ngoài.

## Thay đổi và bằng chứng

| Lỗi | Thay đổi | Kiểm chứng |
|---|---|---|
| F-01: stored XSS ở tên gói | Render tên gói, so sánh, tên khu vực, lý do và lỗi bằng text nodes. Bỏ `safe` trên runline Jinja2 và dùng text nodes khi cập nhật cấu hình trong JS. | Hai diagnostic stored HTML không thực thi handler; regression SSR bảo đảm runline được escape. |
| F-02: gói/giá không liên kết backend | Card/trang sản phẩm/quiz dùng danh mục đã publish và UUID thật. Form quảng cáo cũng dùng UUID gói/khu vực. Giá từ quote có monthly/VAT/term, không dùng giá mẫu; CTA quảng bá không gắn gói được ghi là tư vấn chung. | Browser tạo/publish giá → chọn card hoặc form quảng cáo → gửi → đọc lead có đúng plan/region và snapshot tổng. |
| F-03: lịch hẹn 422 | Caller/mặc định gửi `callback`, giữ version và thời gian có timezone. | Tạo qua UI, API đọc lại lịch đã lưu trong SQL. |
| F-04: tràn ngang mobile | Grid co theo container, item có min-width hợp lệ, bảng cuộn trong panel; clip chuyển động tại showcase. Tách trạng thái lọc loại gói khỏi việc ẩn card của carousel; xóa class center khỏi card bị lọc. | 48/48 cấu hình màn hình không tràn document; nhiều gói trên mobile chuyển/lọc được; form cảm ứng gửi thành công. |
| F-05: recovery báo thành công giả | API email recovery và reset có provider OTP/JWT, active membership và MFA. Throttle HMAC/email/IP tin cậy, kiểm tra origin, validate phản hồi provider. Thu hồi BFF sessions trước PUT password; logout global trước audit hoàn tất. UI chỉ báo đổi sau response xác nhận. | 32 ca recovery gồm MFA thiếu/sai/đúng, provider lỗi/timeout/429, policy, dữ liệu sai, code dùng lại, DB lỗi trước/sau write, logout thất bại, phiên cũ bị từ chối. Browser xác nhận lỗi không chuyển sang thành công và reset thành công xóa credentials. |

Quote cũ không ghi đè khi khách đổi gói/khu vực; bảng so sánh cũng xóa giá cũ rồi cập nhật cùng quote. Request quote và phiên phụ có deadline 3 giây, cho phép gửi tư vấn không có token khi chưa xác nhận giá/phiên. Submit được khóa trong lúc xử lý.

Retry giữ body/key gốc khi kết quả lần gửi trước chưa rõ, kể cả quote/session token tự đổi. Input hoặc consent của khách thay đổi tạo yêu cầu mới. Browser đã chuyển POST đầu tới SQL rồi cố tình làm mất cả ba phản hồi; bấm gửi lại sau refresh quote nhận HTTP 200 với **receipt gốc**, không tạo yêu cầu thứ hai. Một 4xx xuất hiện sau phản hồi mất không làm quên khóa đang chờ.

## Kết quả cuối

| Kiểm tra | Kết quả | Artifact |
|---|---|---|
| Pytest, PostgreSQL thật và toàn bộ 9 migrations | **142 passed, 0 failed** | [pytest-final.log](pytest-final.log) |
| Browser tích hợp client/admin | **31 passed, 0 failed**, 0 uncaught JS error | [browser-final.json](browser-final.json) |
| Diagnostic: draft giá, XSS, UUID, settings, recovery | **7 passed, 0 failed** | [diagnostics-final.json](diagnostics-final.json) |
| Responsive: 8 trang × 6 độ rộng | **48/48** tại 360/375/390/430/768/1440px | Ma trận trong browser-final.json |
| Mobile cảm ứng 390×844 | Receipt từ PostgreSQL cho cả hai form; không overflow, retry ổn định, lỗi không hiện xác nhận, không phone trong console | [mobile-browser-check.json](mobile-browser-check.json), [ảnh receipt](mobile-lead-check.png) |
| JavaScript contracts | **6 file đạt**: API/retry/auth/consent, comparison, mobile carousel, quiz, quote, session deadline | [js-contracts.log](js-contracts.log) |
| Ruff / format / mypy / kiến trúc | Đạt; mypy và import rules kiểm tra 86 file nguồn | ruff.log, format.log, mypy.log, architecture.log |
| Syntax JS và browser harness | Đạt | js-syntax.log |
| Build sdist/wheel và smoke package độc lập | Đạt; wheel khớp source, có templates/static và ASGI health | [build.log](build.log), [wheel.log](wheel.log) |
| Hợp đồng frontend | 131 operation, 52 schema; phụ lục/JSON examples/source references đã đối chiếu | [prompt cập nhật](../../frontend/PROMPT-KET-NOI-FRONTEND.md), frontend-contract-verification.log |

[verification.json](verification.json) chứa kết quả có cấu trúc; [manifest SHA-256](changed-source-sha256.json) ghi các package source đã đổi so với snapshot trước sửa. Các file `*-red.log` và runline-red.json giữ lần tái hiện lỗi trước sửa. Các phép kiểm tra cuối đã chạy trên source sau sửa, không lấy kết quả cũ làm kết quả của bản mới.

## Điều cần cấu hình khi đưa lên môi trường đích

Migration mới: `supabase/migrations/20261002014547_password_recovery_session_revoke.sql`. Local đã chạy cả chín bản; **cloud chưa áp dụng trong phiên này**. Đối chiếu history trước khi apply; không chạy lại bản đã áp dụng.

Recovery cần email template Supabase chứa `{{ .Token }}`, SMTP/sender, origin/JWKS/Auth keys và tài khoản kiểm thử có membership/MFA đúng. Xem [hướng dẫn recovery](../../backend/password-recovery.md) và [rollout](../../backend/rollout.md). Không có recovery SMS hoặc trang callback cho email link mặc định. Provider có thể tiêu thụ email code trước khi MFA/password policy thất bại; UI yêu cầu mã mới khi cần.

BFF sessions cũ bị thu hồi trước đổi mật khẩu. Nếu DB lỗi trước thu hồi, không gọi PUT. Nếu provider write hoặc audit sau đó lỗi, phiên BFF cũ đã bị thu hồi và UI không tuyên bố hoàn tất. `provider_revoked:false` là logout toàn cục Supabase chưa xác nhận; cần kiểm tra riêng các app khác dùng provider. Không có transaction nguyên tử chung giữa Supabase Auth và Postgres.

## Giới hạn của kết quả

Đây là local Chrome/Playwright + PostgreSQL dùng dữ liệu tổng hợp. Auth HTTP được mô phỏng với JWT ký thật; chưa xác nhận email được gửi, mật khẩu thật đổi hoặc hosted Auth/MFA hoạt động. R2/cloud, Vercel cold start, RTT PostgREST, thiết bị iOS/Safari và tài nguyên ngoài origin chưa được kiểm tra ở lượt này.

Các route HTML Jinja2 vẫn chỉ mount trong development/test theo cấu hình sẵn có; lượt sửa không mở chúng ở staging/production. Một số nội dung thương mại/vận hành preview còn cần đối chiếu nguồn và tích hợp riêng trước công bố. Chưa coi toàn bộ giao diện sẵn sàng production. Các đo hiệu năng cũ thuộc các bản được ghi trong artifact cũ; không có benchmark tải mới cho bản sửa này.

Pending idempotency hiện giữ trong RAM của tab; reload/đóng tab làm mất khóa. Bộ kiểm tra chứng minh retry tự động và manual trong cùng tab, không chứng minh retry xuyên thiết bị hoặc xuyên phiên browser.
