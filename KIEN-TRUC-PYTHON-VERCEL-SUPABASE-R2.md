# Kiến trúc Python — Vercel — Supabase — Cloudflare R2

Ngày cập nhật: 30/09/2026. Đây là kiến trúc được chọn cho kế hoạch; thay thế đề xuất Next.js/Node.js/Redis/BullMQ/SSE trước đó. Chưa triển khai tài nguyên production.

## 1. Công nghệ

| Phần | Công nghệ | Nơi chạy |
|---|---|---|
| Web khách hàng | FastAPI + Jinja2, HTML/CSS, JavaScript gọn | Vercel Python Functions/CDN |
| Admin | Jinja2 + JavaScript, Supabase JS cho Auth/Realtime | Vercel và trình duyệt |
| API và nghiệp vụ | Python, FastAPI, Pydantic, HTTPX async | Vercel Python Functions |
| Database | PostgreSQL | Supabase |
| Đăng nhập admin | Supabase Auth, JWT, MFA, RLS | Supabase; backend kiểm tra token/quyền |
| Thời gian thực | Private Broadcast hoặc Postgres Changes với RLS | Supabase Realtime |
| Tác vụ bền vững | Supabase Queues (pgmq), visibility timeout, retry | Supabase |
| Xử lý tác vụ | Endpoint Python hữu hạn, chia batch | Vercel |
| Ảnh/tệp | S3-compatible API, boto3, URL ký ngắn hạn | Cloudflare R2 |
| GeoIP/ASN | maxminddb/geoip2, MMDB đóng gói đã kiểm tra dung lượng | Vercel Python |
| Kiểm thử | pytest; kiểm thử browser và tải staging | CI/local |

Python phụ trách server/render/thuật toán. Trình duyệt vẫn dùng HTML/CSS/JavaScript; SQL dùng cho schema, RLS, RPC và trigger. Không chạy Python trong trình duyệt vì không có lợi cho tốc độ mobile của ứng dụng này.

## 2. Luồng lead và tác vụ

1. Client POST /api/leads đến FastAPI cùng khóa idempotency.
2. API kiểm tra cấu trúc và chống abuse nhanh, chuẩn hóa số; không chờ AI/phone lookup.
3. Một transaction/RPC PostgreSQL ghi lead, quote snapshot, message pgmq và bản ghi tín hiệu job. Quyền RPC chỉ cấp backend phù hợp; không mở cho anon gửi tùy ý. Transaction rollback thì không có message mồ côi.
4. API trả xác nhận sau commit. Lead mới được admin nhận qua Supabase Realtime.
5. Database webhook trên bảng tín hiệu gọi endpoint Python /internal/jobs/process. Tín hiệu chỉ chứa job/lead ID; endpoint lấy dữ liệu thật từ DB. Webhook được xác thực bằng secret, giới hạn tải và chống replay/gọi lặp phù hợp.
6. Endpoint claim một batch nhỏ từ queue, dùng visibility timeout phù hợp, xử lý trong ngân sách thời gian; cập nhật kết quả và phiên bản điểm, rồi acknowledge/archive. Job có idempotency; ack không đồng nghĩa có đúng một lần tác động bên ngoài.
7. Lỗi giữ job để retry có backoff, giới hạn lượt thử và lưu failed jobs. Cron định kỳ đánh thức queue khi webhook bị mất hoặc backlog còn; webhook là đường nhanh, cron là đường phục hồi.
8. Kết quả cập nhật được phát tới admin. Reconnect resync qua API theo cursor/version vì Realtime không thay thế DB hay lịch sử bền vững.

Không dựa vào FastAPI BackgroundTasks hoặc asyncio task sau response cho công việc cần đảm bảo hoàn tất. Vercel Functions có giới hạn thời gian theo gói/cấu hình. Python endpoint xử lý job phải hoàn tất hoặc nhường lại queue trước deadline; không chạy daemon Celery/Redis subscriber hoặc WebSocket server thường trực trong Function.

Supabase Queues lưu trữ công việc, không tự chạy mã Python. Supabase Edge Functions không được chọn làm nơi chạy nghiệp vụ Python. Khi tải vượt ngân sách Functions/queue hiện tại, mở rộng batch/concurrency có giới hạn; chỉ thêm worker Python thường trực ở nhà cung cấp khác khi thực sự cần và được chọn lại kiến trúc.

## 3. Realtime và phân quyền

Admin mở kết nối tới Supabase Realtime bằng phiên Auth của người dùng. Chọn private Broadcast cho notification tối thiểu (ID/trạng thái/phiên bản), sau đó API trả chi tiết theo quyền; hoặc Postgres Changes với RLS cho MVP nếu tải phù hợp. Không broadcast số điện thoại/IP cho kênh công khai.

Backend xác minh JWT, quyền và chi nhánh; nếu backend dùng quyền service role vượt RLS thì phải kiểm tra scope ở mọi truy vấn. Service-role key, DB password, R2 key, webhook secret chỉ nằm server. Publishable key phía browser đi kèm RLS, không mở đọc bảng leads cho anon.

Không cache HTML/API admin hay lead riêng tư trên CDN. Logout dừng subscription; bị thu hồi quyền thì không tiếp tục nhận dữ liệu.

## 4. Kết nối dữ liệu và giảm độ trễ

- Vercel Python chọn region gần Supabase, ưu tiên thử nghiệm cùng vùng Singapore nếu tài khoản hỗ trợ; CDN vẫn phục vụ static toàn cầu.
- Dùng Supabase Data API/RPC cho giao dịch nghiệp vụ, tái sử dụng HTTP client trong instance warm. Một RPC thay nhiều HTTP call để ghi lead + queue nguyên tử.
- Nếu truy cập SQL trực tiếp, dùng transaction pooler cho serverless; pool nhỏ, timeout rõ và xử lý prepared statements theo driver. Tránh tạo pool lớn ở mỗi instance.
- MMDB mở một lần mỗi instance warm. Dữ liệu được cập nhật qua build; file tải vào /tmp chỉ là cache tạm, không phải kho bền vững. Không tải file lớn từ R2 ở mọi lượt request.
- Cache RAM có giới hạn chỉ là tối ưu cho instance warm; không dùng làm nguồn điểm/giá/rate limit toàn hệ thống. Cache dùng chung có TTL lưu Supabase khi cần; không thêm Redis vào MVP mặc định.
- Landing page render tĩnh trước khi có thể; trang động Jinja2 có cache công khai kiểm soát. Giá cache theo region/plan/version và hết hạn không muộn hơn hạn giá/ưu đãi. Form commit quote snapshot đã xác nhận; hiển thị thay đổi nếu giá cập nhật.
- Nội dung cá nhân và bảng giá theo người đăng nhập không dùng chung public cache. Vercel cache chỉ bật theo chính sách explicit và kiểm tra thực tế; không giả định Jinja2 tự có ISR của Next.js.
- HTTPX thực hiện I/O đồng thời với concurrency giới hạn; SDK đồng bộ như boto3/DB reader không gọi blocking trong async loop khi tác vụ đáng kể, dùng threadpool hoặc endpoint sync phù hợp.
- Queue chứa ID/dữ liệu tối thiểu; events hành vi gộp batch, không thực hiện enrichment tốn tiền trên mỗi page view.

## 5. R2

Ảnh public dùng custom domain media và cấu hình Cloudflare cache; object key có phiên bản/hash để tránh ảnh cũ. Ảnh được tối ưu khi upload trước khi xuất bản, không biến đổi nặng trong request mobile.

Admin xin presigned PUT qua API rồi upload trực tiếp đến R2, giảm dữ liệu đi qua Vercel. API kiểm tra quyền và sinh object key giới hạn; bucket CORS chỉ cho origin cần thiết. Kiểm tra size thực, loại file/nội dung sau upload trước khi publish; presigned URL không tự đảm bảo mọi ràng buộc file.

Tệp riêng dùng bucket private và presigned GET hạn ngắn sau kiểm tra quyền. Supabase lưu metadata/object key. Không dùng R2 làm DB/queue. Với giao diện serverless, không phụ thuộc local filesystem để lưu upload.

## 6. Mục tiêu và giới hạn

Mục tiêu thử nghiệm: API lưu lead p95 ≤500ms tại server; khách nhận phản hồi khoảng ≤1–1,5s trên mạng thử nghiệm; Admin thấy lead khoảng ≤1s sau commit; enrichment local hoàn tất dưới khoảng 1s, enrichment ngoài có ngân sách 2–5s rồi timeout/pending. Đây là mục tiêu, cần đo cả cold start, queue delay, region RTT và quota, không bảo đảm thời gian thực cứng.

Khi webhook lỗi, job chờ cơ chế phục hồi nên không đạt ngưỡng bình thường. Không dùng Vercel Hobby cron tần suất thấp để cam kết enrichment dưới giây. Chọn Supabase Cron pg_cron/pg_net hoặc Vercel Cron có gói/tần suất phù hợp; endpoint cron xác thực, lock/visibility timeout tránh chạy chồng.

Giám sát API p95/p99, cold start, số kết nối DB, job age/failed jobs, webhook lỗi, Realtime lag và quota R2/lookup. Nghiệm thu gồm crash sau commit/trước ack, duplicate wake, provider timeout, token hết hạn, mất Realtime và cache giá hết hiệu lực.

## 7. Cấu trúc dự án

```text
app.py
pyproject.toml
uv.lock
vercel.json
app/
  routes/       # public, admin, API, internal jobs
  services/     # pricing, leads, intelligence, storage
  scoring/      # rules và phiên bản điểm
  templates/    # client/admin Jinja2
  static/       # CSS/JS đã build
  models/       # Pydantic
supabase/
  migrations/   # schema, RPC, RLS, queue và trigger
tests/
```

Tách preview/staging và production: Supabase project, bucket/key R2 và webhook credentials riêng. Preview không kết nối dữ liệu thật hoặc gửi conversion thật. CI test trước deploy; migration tương thích code cũ/mới để rollback web không làm hỏng schema.

## Tài liệu đối chiếu

- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [Giới hạn Vercel Functions](https://vercel.com/docs/functions/limitations)
- [FastAPI Templates](https://fastapi.tiangolo.com/advanced/templates/)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
