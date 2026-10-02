# Rollout và trạng thái môi trường

Code và migration có thể review/chạy cục bộ; chưa có account credentials trong phiên để deploy hoặc xác nhận dịch vụ cloud. Giao diện thiết kế vẫn có fixtures về giá, hotline, khách hàng và các claim thương mại; app chỉ mount những trang đó tại development/test. Hoàn tất nội dung được duyệt và binding dữ liệu trước khi công bố HTML production.

## Cấu hình theo thứ tự

1. Tạo Supabase/R2 riêng cho staging, bật pgmq và kiểm tra phiên bản PostgreSQL. `supabase/config.toml` tạo bằng CLI 2.119.0, expose `api` và cấu hình local PostgreSQL 17; test portable hiện chạy PostgreSQL 16.2. Kiểm tra migrations trên phiên bản đích, không tự coi local bằng cloud.
2. Đọc CLI `--help`, link đúng project, kiểm tra migration history rồi apply 9 migrations theo thứ tự. Nếu đã apply 8 bản trước, bản mới là `20261002014547_password_recovery_session_revoke.sql`; đối chiếu history để không chạy lại migration đã áp dụng. Kiểm tra grants, RLS, `private.allowed_topic` và security/performance advisors.
3. Bật Auth ES256/RS256/JWKS, tắt public signup cho cổng nhân viên nếu không cần, tạo owner đầu tiên trong `private.memberships` bằng operator có quyền. UUID branch toàn hệ thống là zero UUID; permissions `['*']` chỉ cho owner. Đăng ký TOTP và kiểm tra AAL2 thực tế. Cấu hình email Recovery chứa OTP theo [password-recovery.md](password-recovery.md). Không có endpoint tự nâng quyền từ `user_metadata`.
4. Điền env theo `.env.example` vào Vercel theo môi trường, giữ tất cả secret phía server. `PAGEFPT_SUPABASE_SECRET` là secret/service-role backend; `PAGEFPT_SUPABASE_AUTH_KEY` là publishable/anon Auth key. Điền origin canonical HTTPS, R2 endpoint/buckets/media domain, Turnstile hostname/action lead, MMDB nếu cần. Chỉ bật trusted proxy trên Vercel.
5. Import bảng giá có nguồn chính thức, dry-run, apply draft, review rồi publish với MFA. Test vùng cụ thể/group/default và khoảng hiệu lực/khuyến mãi. Không publish fixture giá trong tests.
6. Đặt cùng worker secret vào Vault và Vercel; chạy template `deploy/supabase-runtime.sql` với origin và UUID Vault thật. Kiểm tra wake và cron recover khi chặn wake. Kiểm tra pg_net response và delivery ledger, không chỉ HTTP response của trigger.
7. R2 private/public bucket riêng, CORS/lifecycle theo `deploy/r2-policy.md`. Kiểm tra upload thật, ảnh bị từ chối, private URL hết hạn và deletion cleanup. Không chỉ dựa vào boto contract stub.
8. Deploy preview/staging với integrations disabled. Đo Vercel warm/cold, PostgREST RTT và mobile mạng VN. Chạy fault/queue recovery/RLS/MFA/backup restore; chỉ cấu hình live ads/notification sau khi connector mapping, consent và quyền tài khoản được kiểm tra.

## Tích hợp quảng cáo

Có port Google/Meta/TikTok và normalized HTTPS gateways, webhook inbox ký HMAC và stable event_id. Gateway URL/signing secret được cấu hình server; record integration trong admin là switch bổ sung, không cấp credentials hoặc tự tạo tài khoản. Incoming webhook là hợp đồng bridge đã xác thực, không giả nhận đây là native verification của từng vendor. Cần connector triển khai native challenge/OAuth/signature mapping đúng tài khoản thực tế. Gửi ads/SMS/Zalo/email thật vẫn chưa chạy.

## Các nguồn đối chiếu 01/10/2026

- [FastAPI trên Vercel](https://vercel.com/docs/frameworks/backend/fastapi), [Python runtime](https://vercel.com/docs/functions/runtimes/python).
- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [MFA](https://supabase.com/docs/guides/auth/auth-mfa), [Auth REST OpenAPI](https://github.com/supabase/auth/blob/master/openapi.yaml).
- [pgmq](https://supabase.com/docs/guides/queues/pgmq), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron), [API keys](https://supabase.com/docs/guides/api/api-keys).
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
- [libphonenumber](https://github.com/google/libphonenumber): metadata không xác nhận nhà mạng hiện tại khi có chuyển mạng giữ số.

Các nguồn phục vụ cấu hình/giới hạn kỹ thuật; chúng không xác nhận PageFPT là đại lý chính thức, không xác nhận bảng giá hoặc nội dung mẫu trong giao diện.
