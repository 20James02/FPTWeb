# Khôi phục mật khẩu Admin qua Telegram

Ngày cập nhật: 06/10/2026. Thay thế luồng email/link trước đây theo yêu cầu owner.

## Cấu hình

Giữ Supabase Auth quản lý mật khẩu, JWT và MFA. Backend dùng API Admin generate_link loại recovery để tạo proof **không gửi email**, rồi giữ hashed_token được mã hóa phía server. Mã khách nhập là mã ngẫu nhiên 6 số độc lập với email_otp của Supabase.

`PAGEFPT_TELEGRAM_RECOVERY_ACCOUNTS` là JSON server-only ánh xạ email đã chuẩn hóa sang **Chat ID riêng dương**, đã xác minh từ lệnh có marker do owner gửi trong chat riêng. Ví dụ `{"admin@example.com":"123456789"}`. Không chấp nhận Chat ID nhóm âm. Không tự đăng ký liên kết qua API public. Owner cần thêm từng admin đã xác minh vào cấu hình triển khai; admin chưa liên kết không tự khôi phục qua Telegram.

`PAGEFPT_TELEGRAM_CHAT_ID` vẫn là nhóm nhận thông báo lead. Recovery code gửi đến binding riêng, không dùng nhóm này. Telegram enabled và bot token phải hợp lệ. Khóa Supabase Admin/bot chỉ tồn tại server; API/browser không được nhận action_link, hashed_token, email_otp hoặc provider session.

Áp dụng đầy đủ migration theo thứ tự; migration mới `telegram_recovery_codes` tạo bảng private có RLS và RPC chỉ service_role được gọi. Schema mới tương thích ứng dụng trước; phát hành code và env cùng một deployment rồi promote.

## Contract

| Endpoint | Request | Response |
|---|---|---|
| POST /api/v1/auth/recovery | `{email}` | `202 {accepted:true,challenge_id:UUID}` |
| POST /api/v1/auth/recovery/reset | `{email,challenge_id,otp,password,totp:""}` | `200 {changed:true,provider_revoked:boolean}` |

Chỉ nhận `otp` đúng 6 chữ số ASCII; giữ số 0 đầu. Không nhận recovery_link hoặc mã 7/8 số. Password 8..1024 ký tự, thêm chính sách Supabase. TOTP trống hoặc 6 số. Form bước 2 chỉ kiểm tra định dạng; proof Telegram và MFA được xác minh khi lưu mật khẩu mới. Browser giữ challenge_id/code trong bộ nhớ và input, không lưu localStorage/sessionStorage. Gửi lại cập nhật challenge_id, xóa input mã cũ. Xóa mọi input mã/mật khẩu khi thành công và yêu cầu đăng nhập lại.

Email chưa liên kết nhận cùng hình dạng response 202 với UUID ngẫu nhiên, không phát sinh provider request/job. Response accepted không khẳng định tồn tại tài khoản hay Telegram đã giao thành công. Không công bố recipient hoặc membership. Throttling HMAC email/IP áp dụng mọi email; gate gửi lại tối thiểu 60 giây cũng áp dụng email chưa liên kết.

## Mã và chống lạm dụng

- Mã sinh bằng secrets.randbelow, định dạng 6 số; hết hạn sau 5 phút kể từ reservation server.
- Chỉ một challenge hiện hành mỗi account HMAC; reservation khóa DB trước provider call để tránh hai lần generate_link chồng nhau.
- Lưu HMAC challenge_id + code; code transient và provider proof được mã hóa AES-GCM, không plaintext.
- Tối đa 5 lần nhập sai. DB lock cập nhật số lần thử/tiêu thụ nguyên tử; hai request đồng thời chỉ một request nhận proof.
- Gửi lại thay challenge_id/proof/code, vô hiệu mã trước. Đổi binding riêng cũng khiến mã trước không sử dụng được.
- Active membership được kiểm tra lúc tạo, trước gửi, lúc consume và trước đổi mật khẩu. Không tăng quyền qua recovery.
- Mã hết hạn/blocked/consumed bị xóa ciphertext khi consume/prepare; code ciphertext xóa khi delivery terminal. Mỗi account chỉ giữ một hàng, không tích lũy lịch sử mã.

## Queue và delivery

Queue notifications chứa kind telegram_recovery và challenge UUID; không chứa email/mã/provider proof. Worker prepare kiểm tra lease/fence, challenge hiện hành/hạn/membership và đọc code đã mã hóa. Gửi plain text vào chat riêng đã cấu hình, protect_content, không đính link hay nút. Ledger chỉ lưu trạng thái/code lỗi/message_id.

Connect/5xx có retry và429 theo retry_after, trong khi challenge còn hiệu lực. Tin lỗi mạng mơ hồ ghi unknown, không tự gửi lại. Deadline code được kiểm tra trước mỗi lần gửi; tin đã bắt đầu gửi có thể đến sau khi người dùng gửi lại nhưng mã cũ đã vô hiệu tại DB. User có thể gửi lại sau cooldown khi Telegram không đến. Worker wake theo DB commit và cron phục hồi hiện có; không dùng background task sau response Vercel.

## Đổi mật khẩu và MFA

Sau consume, backend giải mã proof, POST verify token_hash với Supabase, xác minh JWT và subject khớp challenge, active membership, rồi MFA hiện có. Không dùng Admin update_user để bỏ qua MFA. Nếu bước sau consume lỗi, mã đã dùng; yêu cầu mã mới.

RPC auth_recovery_revoke_sessions xóa BFF sessions **trước** PUT password. PUT phải xác nhận đúng subject; logout global best effort rồi RPC auth_recovery_complete ghi audit và thu hồi phiên mới phát sinh. Không báo changed:true khi bước bắt buộc lỗi. provider_revoked:false nghĩa là logout provider chưa được xác nhận, dù password/BFF đã xử lý. Không có transaction phân tán giữa Auth/Postgres; không tự retry reset nếu response mất.

## Lỗi UI

RECOVERY_EXPIRED 401: sai mã/hết hạn/đã dùng/blocked, gửi lại mã mới. RECOVERY_UNCONFIGURED 503: chưa có cấu hình Telegram recovery. RATE_LIMITED 429: chờ ít nhất 60 giây trước khi gửi lại. MFA_REQUIRED 403: gửi lại mã Telegram và nhập mã ứng dụng xác thực. PASSWORD_REJECTED 422: yêu cầu mã mới và chọn mật khẩu phù hợp. AUTH_UNAVAILABLE 503: không báo thành công, yêu cầu mã mới. PERMISSION_DENIED 403: membership đã bị thu hồi; không tự cấp quyền.

Nguồn: [Supabase generateLink](https://supabase.com/docs/reference/swift/auth-admin-generatelink), [Auth REST contract](https://github.com/supabase/auth/blob/master/openapi.yaml), [Auth SDK response transformation](https://github.com/supabase/auth-js/blob/master/src/lib/fetch.ts), [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage).
