# Triển khai mã khôi phục qua Telegram — 06/10/2026

Yêu cầu owner: chỉ dùng mã 6 số, không email/link. Owner chọn chat riêng và đã xác minh bằng lệnh chứa marker trong chat riêng @fptadminbot; sender.id = chat.id và chat.type = private. Mã khôi phục chỉ gửi vào binding này; thông báo lead vẫn gửi nhóm đã cấu hình.

## Code và database

- Contract/UI: nhận otp6số + challenge_id; không còn recovery_link. Input numeric, maxlength6, giữ số0đầu. Gửi lại cập nhật challenge_id, xóa mã cũ. Xem [password-recovery.md](../backend/password-recovery.md).
- Supabase Admin generate_link recovery chỉ tạo proof, không gửi email. **REST trả user fields ở top-level**, SDK mới chuyển thành user/properties; adapter/test fixture đã đối chiếu source chính thức.
- Mã tự sinh secrets.randbelow, hạn5phút,5lần nhập sai, cooldown60giây. DB lock/reservation trước provider, HMAC mã gắn challenge, provider proof/outbound code mã hóa AES-GCM. Chỉ một lần consume; không bỏ qua MFA/provider JWT/member active.
- Worker queue chỉ giữ UUID, fenced delivery, không đưa OTP/email/proof vào job list/result/audit. Retry không gửi challenge đã thay/hết hạn/thu hồi. Ambiguous send đánh dấu unknown, không tự phát lại. Ciphertext outbound xóa sau delivery terminal, proof xóa sau consume/expire handling.
- CLI Supabase2.119.0 tạo migration; cloud apply/history xác nhận migration `20261006082754_telegram_recovery_codes.sql` thứ14. 38bảng private RLS. Kiểm tra live: anon/authenticated không đọc bảng; anon/authenticated không execute recovery/dispatch; service_role có execute.
- Env Production thêm PAGEFPT_TELEGRAM_RECOVERY_ACCOUNTS dạng secret qua stdin. Mapping/token chỉ nằm server/ignored0600; không ghi email/ChatIDriêng vào tài liệu này. Giữ keys hiện có, không đổi SMTP, không bật ads connectors.
- Security advisors: thông tin38bảng RLS không policy là deliberate deny for public roles; 3WARN sẵn có vẫn gồm public.rls_auto_enable grants cho anon/authenticated và leaked-password protection chưa bật. Feature không thêm SECURITY DEFINER, không thay platform function/plan/SMTP ngoài phạm vi.

## Kiểm chứng

- TDD red quan sát backend chưa tạo challenge, UI thiếu challenge_id, và khác biệt REST/SDK response trước khi sửa.
- Toàn bộ pytest **222passed,46.83s**; có case5sai/expiry/resend/concurrent request/concurrent reset/private binding/leadingzero/provider errors/MFA/BFF revoke/DB errors/retry/ambiguity.
- Ruff check/format133files, mypy92source, architecture92source và tất cả12nhóm hợp đồng JS đạt.
- Browser fixture PostgreSQL riêng: reset + MFA + session/audit thực, external Auth HTTP synthetic;4widths360/390/430/1440đạt. Không dùng dữ liệu khách/tài khoản thật.
- Upload dry163regularfiles,10sensitivevalues không xuất hiện; env/.local/.venv excluded. Source tests/docs/migrations không upload.
- Candidate7checks, stable6checks đạt; browser stable4widths khôngoverflow/pageerror; request recovery thật trả202, UI chuyển bước mã6số.

## Website thật

Deployment **dpl_3PZiYjCR591j3ByWseSzstNQfgDW**, candidate https://fpt-ih5uwrtgl-pettravel.vercel.app, stable https://fpt-web-ten.vercel.app. BuildREADY rồi candidate smoke trước promote; stable target đọc lại khớp id. 24envvarsProduction, ứng dụng vẫnstaging, Preview không nhận credentials.

Cloud browser tạo một recovery request thật, không submit mật khẩu. Challenge0b782a47-3e96-4047-819f-7e95e11999f3, jobeb490443-0ccb-4607-a42c-495b8b69cc7d. SQL ledger xác nhận **accepted, message_id11, jobdone,attempt1**, code_ciphertext đã xóa; challenge còn hiệu lực tại thời điểm kiểm tra. Không ghi mã/proof/password vào evidence. Không xác minh người dùng đã đọc Telegram hoặc đổi mật khẩu thật.

Để đổi mật khẩu: tải lại /admin/login → Quên mật khẩu → email đã liên kết → mã6số trong chat riêng → mật khẩu mới (+MFA nếu đã bật). Tin thử thuộc challenge của browser kiểm tra; người dùng tạo yêu cầu mới trong browser của mình, chờ cooldown60giây nếu vừa có request. Gửi lại làm mã trước hết hiệu lực.

Evidence `.local/deploy-cli/`: deployment-telegram-recovery.json, promotion-telegram-recovery.json (production_matches), cloud-smoke-telegram-recovery.json, domain-smoke-telegram-recovery.json, browser-cloud-telegram-recovery.json; screenshot `.local/qa/cloud-telegram-recovery-code.png`. Secrets/private recipient không nằm trong output/commit.
