# Trạng thái triển khai — 06/10/2026

> Cập nhật 07/10/2026: xem [bản tài khoản, MFA và phân tích mới](ADMIN-ACCOUNTS-ANALYTICS-2026-10-07.md). Các deployment/count dưới đây là trạng thái lịch sử ngày 06/10.

## Vercel và Supabase đã kết nối

- Project: [pettravel/fpt-web](https://vercel.com/pettravel/fpt-web).
- Website: https://fpt-vungtau.com; Admin: https://fpt-vungtau.com/admin/login. www chuyển hướng 308 sang tên miền chính, giữ đường dẫn/query; alias Vercel cũ tiếp tục hoạt động.
- Deployment hiện tại: `dpl_BjQe7LLghWkSdvZxexDTegszh3ii`, URL `https://fpt-9n10bct9j-pettravel.vercel.app`. Đã cập nhật origin tên miền và kiểm chứng DNS/HTTPS; xem [TEN-MIEN-FPT-VUNGTAU-2026-10-06.md](TEN-MIEN-FPT-VUNGTAU-2026-10-06.md). Bản này dùng mã Telegram đúng 6 số vào chat riêng đã xác minh để khôi phục Admin, giữ thông báo lead vào nhóm và các sửa đổi form/login/ảnh gói trước đó. Production target và domain thật đã đọc lại, khớp deployment này.
- Supabase: `FPTWeb`, ref `ryfdlhmbytabinsbxbup`; 14 migrations đã đối chiếu, không chạy lại migrations. Bản mới `20261006082754_telegram_recovery_codes` thêm một bảng mã private; **38 bảng schema private**, tất cả bật RLS. Schema public không có bảng nghiệp vụ. Trạng thái dữ liệu ban đầu tại `SUPABASE-BANG-DU-LIEU-2026-10-06.md`.
- Vercel nhận đúng preset FastAPI, Python 3.12, dependencies từ `uv.lock`, function tại `sin1` theo cấu hình repository.
- Đã thiết lập 24 biến server trên target **Production** của Vercel: 13 biến nền, 6 biến R2, 5 biến Telegram/recovery. Bot token sensitive. Chế độ ứng dụng vẫn là **staging**; Preview chưa được cấp các keys này.
- Giữ nguyên bốn khóa ứng dụng đang dùng; không tạo lại encryption/matching/token/job key.
- Đã build bản mới với `--prod --skip-domain`, kiểm tra qua CLI có quyền truy cập, rồi promote và đọc lại domain công khai.
- Bản cũ `dpl_Hv8WngdWn6p8oEviCnJoa3vzTVSG` thiếu biến môi trường, readiness trả 503. Không dùng bản cũ làm rollback chức năng nếu chưa xử lý cấu hình của nó.

Luồng khôi phục mới: [TELEGRAM-RECOVERY-2026-10-06.md](TELEGRAM-RECOVERY-2026-10-06.md). Yêu cầu thật từ browser trả202; ledger Telegram accepted/message_id11, job done/attempt1. Không thử đổi mật khẩu tài khoản thật; reset/MFA/session revoke kiểm chứng trong fixture PostgreSQL riêng.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Python tests (đợt origin tên miền mới nhất) | 230 passed, 48.69 giây |
| Ruff check/format | Đạt; 133 file đúng format |
| Mypy | Đạt; 92 source files |
| Kiểm tra ranh giới imports | Đạt; 92 source files |
| Browser API contracts | Đạt: retry/idempotency, consent, auth/MFA/CSRF, logout race |
| Wheel build và smoke | Đạt: package import, templates, static assets, ASGI health |
| Vercel cloud build | READY; Python 3.12 với uv.lock |
| `/health/live`, `/health/ready` | 200 trên domain thật |
| `/admin/login` | 200; no-store, có CSP, không có mật khẩu QA hoặc link localhost |
| `/api/v1/admin/me`, `/internal/jobs/recover` chưa xác thực | 401 |
| `/static/js/admin/auth.js` | 200 |
| `/`, `/san-pham/internet-gia-dinh`, `/khuyen-mai` trên domain thật | 200; chỉ gói đã công bố, banner quảng cáo demo được ẩn |

Đợt đầu test có ba lỗi vì Settings của fixture đọc `.env` Supabase thật. Đã xác nhận nguyên nhân bằng cách tắt env_file, sau đó sửa fixture và hai test foundation bằng `_env_file=None`. Không thay đổi cơ chế xác thực của ứng dụng để làm test đạt.

Đã thêm `.vercelignore` để loại env files, CLI cục bộ, tests, dữ liệu audit và tài liệu khỏi upload. Dry-run nhận đúng FastAPI; 161 regular files, khoảng 1.4 MB source. Đã kiểm tra các file upload không chứa năm secrets server đang dùng. Templates, static assets, data cần thiết và Python lockfile được giữ lại.

## Phần cần hoàn tất

**Cloudflare R2 đã hoàn tất kết nối:** người dùng đã hoàn tất đăng ký trên tài khoản **FPT - James** (`63f67f18e38b4396d4a1b622bcc78990`); API list buckets đã thành công. Đã tạo hai bucket APAC `pagefpt-staging-private` và `pagefpt-staging-public`. Đã đọc lại CORS của private bucket: PUT/Content-Type từ tên miền chính, www và alias Vercel; max age 300 giây; OPTIONS ba origin trả 204, origin lạ trả 403; r2.dev của private bucket tắt. Public bucket đã bật r2.dev cho staging tại `https://pub-eed15a4dfbfe41b89fe852fc2a09ba54.r2.dev`. Cặp khóa cũ trả **403 SignatureDoesNotMatch** trên cloud. Người dùng đã thay cặp khóa mới; **9 kiểm tra local và kiểm tra cloud đều đạt**: cả hai bucket trả 200, ký bằng boto3 và độc lập đúng, backend đọc/ghi private, kiểm tra và chuyển ảnh sang WebP, public media đọc được, CORS và private access đúng. Đã cập nhật hai biến sensitive, deploy ứng dụng đầy đủ và promote lên domain thật. Các snapshot chẩn đoán và object thử nghiệm đã được dọn. Xem `R2-CHAN-DOAN-2026-10-06.md`. [Mở R2 của tài khoản đã chọn](https://dash.cloudflare.com/63f67f18e38b4396d4a1b622bcc78990/r2/overview).
1. **Owner:** `27jd07@gmail.com` có quyền toàn hệ thống. Sau khi gắn domain, log/audit xác nhận người dùng tự khôi phục mật khẩu lúc 15:54:52 và đăng nhập lúc 15:54:57. Không đọc hoặc đổi mật khẩu trong chẩn đoán. Snapshot email/MFA tại `OWNER-KIEM-TRA-2026-10-05.md` là trạng thái lịch sử.
2. **Worker đã cấu hình:** Vault dùng khóa hiện có; runtime trỏ domain thật, cron recovery mỗi 5 phút và wake khi job commit. PG net gọi worker 200, không timeout/lỗi. Xem `TELEGRAM-2026-10-06.md`.
3. **Client công khai:** đã mở router ở staging/production và kiểm chứng 200 trên domain thật; không đổi môi trường sang development. Catalog chưa có gói công bố nên hiện thông báo tư vấn. Admin cần nhập/công bố gói, ảnh và giá có nguồn; thông tin liên hệ/chính sách kinh doanh cần được chủ dự án rà soát trước khi chạy quảng cáo.
4. **Nghiệm thu đầy đủ:** chưa gửi lead cloud, chưa kiểm thử owner aal2 hoặc toàn bộ luồng upload/finalize/export qua API admin. Người dùng đã tự khôi phục Telegram và đăng nhập thật thành công; kiểm thử tự động không đổi mật khẩu thật. Telegram đã gửi tin thử thật vào nhóm cấu hình. Advertising/conversion và notification gateway khác giữ disabled; Telegram được bật riêng.

## R2 đã được kết nối

Cặp khóa mới đã được kiểm chứng trên local và cloud, cấu hình `.env` local giữ quyền 0600. Bản đầy đủ `dpl_An66a5VA3Bebt2uHB4QfsmMz13wJ` đã promote và kiểm tra lại domain thật: health/admin/static 200, endpoint chưa xác thực 401, endpoint chẩn đoán không tồn tại. Đợt này có 30 test media/governance/admin quality đạt trong 6.71 giây. Hướng dẫn dưới đây được giữ để tham khảo cấu hình; không cần nhập lại keys đang hoạt động.

R2 đã được bật và hai bucket đã được tạo. Giữ private bucket không public. Public bucket chỉ dùng cho ảnh đã finalize; gắn custom domain cho production. r2.dev hiện được bật để kiểm thử staging, không thay thế custom domain khi ra mắt.

Trong R2 → Account Details → Manage API Tokens, tạo Object Read & Write cho đúng hai bucket. File riêng đã được chuẩn bị để nhập Access Key ID và Secret Access Key: `.local/deploy-cli/r2-credentials.env`, quyền 0600, nằm ngoài Git/deployment upload. Điền và lưu file; không gửi secret qua chat. Backend/Vercel sẽ cần cấu hình sau:

```dotenv
PAGEFPT_R2_ENDPOINT=https://63f67f18e38b4396d4a1b622bcc78990.r2.cloudflarestorage.com
PAGEFPT_R2_ACCESS_KEY=YOUR_ACCESS_KEY_ID
PAGEFPT_R2_SECRET_KEY=YOUR_SECRET_ACCESS_KEY
PAGEFPT_R2_BUCKET=pagefpt-staging-private
PAGEFPT_R2_PUBLIC_BUCKET=pagefpt-staging-public
PAGEFPT_MEDIA_DOMAIN=https://pub-eed15a4dfbfe41b89fe852fc2a09ba54.r2.dev
```

CORS Dashboard cho private bucket:

```json
[
  {
    "AllowedOrigins": ["https://fpt-vungtau.com", "https://www.fpt-vungtau.com", "https://fpt-web-ten.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 300
  }
]
```

Các biến R2 đã được thêm vào Production và ứng dụng đã redeploy. Kiểm tra thêm luồng admin finalize ảnh và export khi hoàn tất đăng nhập owner/MFA. Không coi cấu hình env là bằng chứng upload đã thành công. [R2 CLI và credentials](https://developers.cloudflare.com/r2/get-started/cli/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Tiếp tục worker và Auth

- Vault/runtime/cron đã hoàn tất: giữ khóa PAGEFPT_JOB_SECRET hiện có, domain thật; recovery mỗi 5 phút. Không chạy lại file placeholder hoặc tạo lại khóa. Worker vẫn yêu cầu X-Job-Secret/Bearer.
- Supabase Auth: khôi phục hiện dùng mã Telegram 6 số và challenge UUID; proof Supabase trao đổi trên server, không yêu cầu link/email OTP. Site URL và worker origin Vercel hiện có được giữ; public_origin và telegram_admin_origin đã đổi sang https://fpt-vungtau.com.

## Trạng thái repository

Deployment được tạo từ workspace qua CLI. Thay đổi `.vercelignore`, test isolation và tài liệu hiện chỉ ở máy này; chưa commit/push trong đợt triển khai. Git deployment tiếp theo cần mang theo các thay đổi được chấp nhận.

Tài liệu nền: `HUONG-DAN-VERCEL-SUPABASE-R2.md`. [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), [Vercel promotion](https://vercel.com/docs/cli/promote).

## Cập nhật giao diện/ảnh gói cước trong ngày

- Trang đăng nhập chỉ hiện bước mật khẩu; OTP mở sau MFA_REQUIRED, khôi phục qua nút nhỏ. Phản hồi đăng nhập chậm không ghi đè màn hình người dùng vừa chọn.
- Admin → Gói cước & bảng giá → Gói cước → Thêm/Sửa: chọn ảnh đã xử lý hoặc tải JPEG/PNG/WebP ≤10 MB, xem trước, bỏ ảnh, lưu nháp và Công bố. Ảnh được liên kết bằng UUID; URL và kích thước do backend lấy từ ảnh R2 ready. Upload cần content.write, lưu gói cần catalog.write.
- 208 pytest, 11 nhóm JS contracts và Chrome trên fixture SQL thật đã đạt. Auth/S3 ngoại vi được mô phỏng trong kiểm thử browser; không gửi email/lead thật. Chrome kiểm tra lựa chọn ảnh, signed PUT file, finalize WebP, ảnh công bố và độ rộng 360/390/430/1440.
- Candidate mới READY, 10 kiểm tra cloud đạt; promote xong, đọc lại Vercel production id khớp và 8 kiểm tra domain thật đạt. Schema JSON hiện có được sử dụng, không thêm migration.
- Hợp đồng OpenAPI, inventory và prompt frontend đã được xuất lại với image_id/image_alt.

Chrome trên domain thật cũng đạt: login ẩn OTP/khôi phục đúng lúc, trang chủ rỗng catalog hiển thị bình thường, không có pageerror hoặc tràn ngang ở 390px. Chỉ mở UI, không gửi thông tin đăng nhập, email khôi phục hoặc lead thật. Bằng chứng lưu trong .local/deploy-cli/browser-cloud-client-release.json.

## Form tư vấn ba trường và gói khách chọn

- Bottom sheet chỉ có Tên, Số điện thoại và Địa chỉ cụ thể nhập văn bản; giữ đồng ý liên hệ. Tóm tắt gói chỉ xuất hiện khi mở từ một gói cụ thể. Nút tư vấn chung không tự gán gói.
- Khi mở từ thẻ gói, request gửi `plan_id`; Admin danh sách/chi tiết nhận UUID và `labels.plan` là tên gói. Báo giá đã xác nhận tiếp tục đi theo lead nếu có; không buộc khách chọn lại địa bàn trong form.
- Candidate READY, 7 kiểm tra cloud đạt trước promote; sau promote, 5 kiểm tra domain đạt và production target khớp. Chrome trên domain thật xác nhận đúng ba trường, CTA nằm trong màn hình 390px, không tràn ngang/pageerror. Chỉ mở UI; không gửi lead thật.
- Dry upload: 162 regular files; kiểm tra không chứa bảy giá trị credentials server. Bằng chứng: `.local/deploy-cli/domain-smoke-short-form.json`, `.local/deploy-cli/browser-cloud-short-form.json`, `.local/qa/cloud-short-form.png`.
- Chi tiết kiểm thử: `../qa/2026-10-06-short-lead-form.md`. Không thêm migration hoặc thay đổi biến môi trường trong đợt này.

## Cập nhật giao diện, logo và số tư vấn (2026-10-06, sau bản tên miền)

Deployment `dpl_BjQe7LLghWkSdvZxexDTegszh3ii` đã build READY và promote. Đọc lại deployment từ `fpt-vungtau.com` khớp chính xác. Cấu hình Vercel/Supabase/R2, origin và worker giữ nguyên; không thêm migration. Bản mới có CSS/form Admin thống nhất, sidebar không gạch chân, logo SVG chính thức, thẻ navbar 3D, số liên hệ `0868.247.625` chỉnh tại Admin và trang thông tin dữ liệu riêng.

- 238 kiểm thử Python đạt; 36 kiểm thử UI/contact chạy lại sau chỉnh template cuối; 12 file JS contract đạt; Ruff/mypy đạt.
- Chrome fixture: 130 trạng thái + 30 lần mở dialog; 8 dialog reason/assignment/confirm bổ sung; kiểm tra bàn phím, reduced motion và chuyển động thường. Auth/PostgreSQL và R2 fixture dùng dữ liệu giả.
- Candidate: 15 kiểm tra đọc, 3 ảnh WebP tải từ deployment có SHA256 khớp bản cục bộ. Upload: 171 regular files, kiểm tra không chứa 12 secrets; `.env`/công cụ cục bộ/test/audit bị loại.
- Chrome trên HTTPS production: 6 trang công khai × 5 chiều rộng 360/390/768/1024/1440; logo/ảnh tải được, số gọi đồng nhất, navbar đúng dịch vụ, form vẫn đúng 3 trường, nút gửi cuộn tới được ở height 500px, login/forgot UI và redirect www đạt. Không gửi lead, mã recovery hay thay mật khẩu trên cloud trong đợt này.
- QA chi tiết: [Rà soát UI/forms/brand/contact](../qa/2026-10-06-ui-forms-brand-contact.md). Ảnh minh họa thiết bị không đại diện cho một model FPT cụ thể.
