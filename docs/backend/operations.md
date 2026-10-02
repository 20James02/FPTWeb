# Vận hành backend

## Luồng và giới hạn

Lead API chỉ validate, chuẩn hóa, mã hóa và commit RPC. Contact, lead, quote snapshot, audit, pgmq job và wake signal ghi trong cùng transaction. Gửi lại cùng khóa/payload trả cùng receipt; payload khác trả 409. Lỗi kết nối không được coi là thành công. JavaScript giữ khóa/body trong bộ nhớ qua retry và không lưu số điện thoại vào localStorage. Đóng tab trước khi nhận phản hồi không bảo đảm khôi phục khóa; việc gửi lại vẫn có thể tạo một yêu cầu tư vấn riêng.

Phân tích, phân công, export, chăm sóc và conversion chạy ở queue riêng. Worker tối đa 10 messages, concurrency 3, budget 20 giây, lease 60 giây, fence chống worker cũ ghi đè. Retry tối đa 6 lần có jitter. Tác vụ đợi lịch không tiêu tốn retry attempt. Queue là nguồn bền vững; wake chỉ tăng tốc. Function cấu hình 30 giây tại Vercel, cần kiểm tra quota của gói đích.

HTTP pool RPC 20 connections/instance, deadline toàn lời gọi 2 giây. Chỉ retry SQLSTATE deadlock/serialization đã rollback; không tự retry một timeout sau commit. Adapter Auth có pool riêng; provider pool 10 connections. Queue gate chỉ giữ trong transaction SQL; contact gate theo HMAC, không khóa DB qua I/O provider.

## Auth và phân quyền

`POST /api/v1/auth/session` xác thực mật khẩu với Supabase, TOTP challenge/verify nếu có factor đã xác minh, verify JWT/JWKS và đọc membership hiện tại. Token pair mã hóa trong `private.admin_sessions`; browser chỉ nhận opaque HttpOnly cookie và CSRF cookie. POST/PUT/PATCH/DELETE có cookie phải gửi `X-CSRF-Token`. `SameSite=Strict`, cookie Secure tại staging/production. Login chặn origin khác và throttle theo HMAC email. Supabase/edge rate limits là lớp bổ sung cho nguồn tấn công phân tán.

Refresh dùng CAS/lease xuyên instance; request đồng thời có thể nhận `SESSION_REFRESH_BUSY` 503 và retry. Nếu refresh thất bại hoặc trạng thái không chắc chắn, session bị thu hồi và cần đăng nhập lại. Logout xóa session backend trước; `provider_revoked=false` cho biết provider logout chưa xác nhận, browser vẫn mất quyền qua cookie. Bearer JWT cũng được hỗ trợ; thu hồi membership có hiệu lực trên request tiếp theo, JWT provider có vòng đời riêng nên khi offboard cần vô hiệu hóa membership trước.

MFA AAL2 cho publish giá/content, reveal PII, export/xóa, membership và cấu hình integration/display. Chỉ marketing/global admin được reconcile conversion; care admin reconcile notification có evidence. Timeout gửi ra ngoài được ghi `unknown`, không tự gửi lại một tin nhắn chưa biết kết quả.

## Dữ liệu, consent và thuật toán

Số điện thoại chuẩn E.164 được mã hóa AES-GCM; lookup dùng HMAC riêng. Key version và keyring cho decrypt dữ liệu cũ. Đầu số chỉ cho metadata suy luận; current carrier/owner/home ISP mặc định unknown. GeoIP/ASN chỉ ước tính, không xác nhận địa chỉ lắp đặt. MMDB chưa cấu hình trả unknown; chỉ đọc IP khi bật trust Vercel proxy đúng môi trường.

Score tách contact confidence, intent có decay/dedup, fit nullable và automation risk. Có ruleset/evidence version, reasons, thời điểm tính; không trình bày như xác suất danh tính. Observation nhân viên có evidence, giá trị và thời hạn hợp lệ; thông tin confirmed không bị inferred mới thay thế. Recompute ghi job, không sửa số điểm trực tiếp.

Event batch whitelist, tối đa 20; không nhận phone/IP/notes trong analytics payload. Browser mặc định không theo dõi; `setAnalyticsConsent` chỉ gọi sau lựa chọn rõ ràng. Attribution first/last trong 30 ngày. Click ID mã hóa, chỉ đưa vào delivery khi có consent analytics/marketing và lead opt-in; withdrawal xóa dữ liệu click. Ads acceptance không đồng nghĩa provider đã xử lý conversion.

Cấu hình display lưu PostgreSQL với version/CAS/audit, không có singleton mutable trong RAM. Các record CMS/campaign/referral dùng `private.resources` có typed command; leads/prices/jobs/events/appointments được chuẩn hóa.

## Lịch phục hồi, cảnh báo và báo cáo

Cấu hình `deploy/supabase-runtime.sql` trên môi trường thật: origin và secret reference trong Vault; pg_net wake job, pg_cron gọi recover mỗi phút. Không đặt Vercel cron và Supabase cron trùng nhau. Nếu wake bị mất, cron nhận queue còn pending. Bản HTML admin dùng change cursor polling 5 giây khi tab hiển thị; private Supabase broadcast đã có policy/trigger nhưng chưa kiểm chứng kết nối live. Không coi polling này là SLA realtime 1 giây.

Daily aggregates có dirty-day trigger khi tạo/chuyển trạng thái/xóa lead, recover xử lý tối đa 10 ngày mỗi lượt và ghi definition version. Đây là cohort theo ngày tạo lead và trạng thái/historical contacted hiện tại, không phải count lượt click thành lead. Rebuild dùng để backfill ngày cũ. Job/audit/report endpoints có scope; feed không mang PII.

Theo dõi error rate/p95 intake, oldest pending job, failed/unknown deliveries, stale daily_metrics, wake_failures và quota. Log ứng dụng chỉ route template, request ID, latency/status; chạy Uvicorn `--no-access-log` để tránh URL query trong access logs. Tích hợp alert là cấu hình môi trường; code không tự gửi thông báo tới người khác.

## Retention, xóa, backup và R2

Recover xóa bounded batches: raw IP 7 ngày, optional events 90 ngày, touches/click và visit assessment 30 ngày, browser idempotency 24 giờ. Idempotency webhook có thời hạn vô hạn và giữ receipt opaque đã pseudonymize sau deletion để chặn provider replay phục hồi dữ liệu cũ. Retention lead/contact 12 tháng là chính sách cần phê duyệt trong đặc tả; chưa tự xóa lead hoạt động theo mốc đó.

Privacy execution kiểm tra tất cả branch của contact, xóa PII/lead/observation/activity/appointment/quote history/session liên quan, tạo tombstone và audit tối thiểu. Export epoch chặn download/late completion của mọi export cũ ngay; cleanup chia 20 exports/lượt và 100 objects/lượt. Cleanup chờ tối thiểu 120 giây để Function cũ kết thúc. URL R2 đã cấp có thể còn hiệu lực tối đa 60 giây; lifecycle bucket là lớp thu gom cuối cho orphan/late PUT.

Private bucket: quarantine và exports; public bucket: ảnh WebP đã kiểm tra/re-encode, key theo hash. Presigned PUT 300 giây chỉ vào quarantine; GET export 60 giây sau kiểm tra quyền/audit. R2 CORS giới hạn origin/method/header cần thiết. Thiết lập lifecycle cho quarantine, exports và abort multipart uploads; thời hạn theo chính sách đã duyệt. Không public private bucket.

Backup phải có thời hạn rõ; khi restore, áp lại deletion/tombstones trước mở truy cập. Giữ khóa cũ tới khi backfill ciphertext và các backup còn cần decrypt đã hết hạn. Matching key rotation cần migration HMAC có kiểm soát; không chỉ đổi env vì sẽ tách contact cũ thành contact mới. Không rollback dữ liệu bằng DROP migration trong production.
