# Auth và Telegram recovery implementation plan

> **For agentic workers:** Use executing-plans for inline implementation; request one fresh-context review before push.

**Goal:** Kiểm tra tài khoản trước khi tạo mã Telegram; phục hồi kết nối worker và kiểm chứng trước khi push Git theo yêu cầu.

**Architecture:** Giữ Python/FastAPI, RPC server-only, mã HMAC và hàng đợi có lease/fence. Lookup giới hạn trong schema private đọc Auth và membership; không thêm API công khai tra cứu email.

**Tech Stack:** FastAPI, Supabase Postgres/Vault/pg_net/pg_cron, Telegram Bot API, Vercel.

**Spec:** Yêu cầu ngày 14/10/2026: kiểm tra nhận mã/thông báo Telegram, xác minh email tồn tại trước khi tạo mã, kiểm tra kỹ rồi push Git.

## Constraints and rulings

- Không ghi secrets, mã xác thực hay dữ liệu khách vào log; không gửi thông báo thử thật.
- Giữ nguyên MFA, chống dò mã, thời hạn 5 phút, cooldown 60 giây và response chung chống dò tài khoản.
- Ruling: triển khai sửa luồng hiện có liên tục theo yêu cầu trực tiếp của người dùng; không thêm vòng xin duyệt tài liệu từ skill.
- Ruling: service_role không có SELECT auth.users; lookup SECURITY DEFINER chỉ trong private, search_path rỗng, kiểm tra role service_role, revoke PUBLIC/anon/authenticated. Không mở bảng Auth cho client.
- Ruling: wake trigger đã tồn tại, không thêm cơ chế gửi trực tiếp hay drain hàng đợi để thử. Thêm status endpoint chỉ đọc để kiểm tra khóa worker.
- Giữ nguyên các commit giao diện voucher của người dùng.

## Review focus

- Email cấu hình Telegram nhưng không tồn tại / bị khóa / xóa / không có membership hoạt động: không tạo proof/code/job.
- Provider trả subject khác lookup hoặc quyền bị rút trong lúc generate: không gửi mã.
- Client không có job secret không được đọc worker status; status không claim/schedule/send.
- Telegram 429/5xx/lost acknowledgement không tạo gửi trùng hoặc bỏ qua lease/fence.
- Lịch worker không dùng thời hạn 5 phút, pg_net timeout phải đủ cho runtime worker.

## Tasks

- [x] Add failing integration tests for eligibility, provider subject mismatch and readonly worker status.
- [x] Add forward migration and minimal recovery/worker fixes; seed synthetic Auth users in offline fixtures.
- [x] Run recovery, notification, permissions, retry tests; browser recovery/MFA at mobile/desktop widths.
- [x] Review entire diff independently; run full Python/JS/static/architecture checks.
- [x] Apply tested migration, verify Vercel/Vault credentials without exposing secrets; readonly live status and scheduled HTTP verification.
- [x] Document evidence/limitations and prepare verified Git payload. Commit SHA and remote push verification are reported in the final response.

## Evidence ledger

- Readonly bot getMe/getChat/getChatMember succeed; notice group membership administrator and recovery chat private.
- Supabase job secret matches local configuration; last-day scheduled HTTP responses: 72 × app UNAUTHENTICATED/401; cron interval */5.
- No recent pending notice/recovery jobs at investigation time. Stored evidence: ignored .local/qa/recovery-telegram-20261014/.
- Ruling: candidate status authenticates with the existing Vault/local key; no credential rotation. Actual 401 cause is the old worker origin redirecting across hosts and dropping Authorization; pg_net readonly probes reproduce old 401/direct 200. Runtime origin now uses the direct canonical HTTPS domain.
- Forward migration applied: history 27 entries, server-only lookup privileges verified. First scheduled HTTP after runtime repair: 200 without timeout.
- 503 full Python checks, 60 focused checks after review adjustment, 29 JS contracts, browser four widths, static/type/architecture checks pass. Reviewer found one test lost its provider-mismatch coverage; corrected fixture and asserted verify called/password write absent.
