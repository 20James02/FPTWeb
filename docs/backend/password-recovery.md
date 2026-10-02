# Khôi phục mật khẩu quản trị — 02/10/2026

Luồng dùng Supabase Auth REST qua FastAPI cùng origin. Browser chỉ gửi email/mã/mật khẩu qua HTTPS và nhận kết quả; access/refresh token của provider ở server. Chưa có SMS recovery hoặc API tự đăng ký MFA. Thay đổi này chưa chạy với tài khoản Supabase, SMTP hoặc deployment cloud thật.

## Cấu hình môi trường đích

1. Đối chiếu migration history rồi áp dụng `supabase/migrations/20261002014547_password_recovery_session_revoke.sql`. Đây là migration thứ 9, cần đủ 8 bản trước theo thứ tự. Không chạy lại các bản đã áp dụng. Wrapper RPC mới chỉ cấp execute cho `service_role`; không expose schema `private`.
2. Giữ `PAGEFPT_SUPABASE_URL`, `PAGEFPT_SUPABASE_AUTH_KEY` (publishable/anon) và `PAGEFPT_SUPABASE_SECRET` phía server. Auth cần JWT ký bất đối xứng/JWKS như luồng login hiện tại. Khóa Auth không thay thế quyền membership của admin.
3. Trong Supabase Dashboard → Authentication → Email Templates → Reset Password/Recovery, dùng template chứa mã `{{ .Token }}` thay vì chỉ có liên kết mặc định. Ví dụ nội dung: `<p>Mã khôi phục: <strong>{{ .Token }}</strong></p>`. Giao diện này nhận mã email 6–8 chữ số; không có trang callback xử lý recovery link. Kiểm tra cấu hình độ dài/expiry tương ứng của project và việc giao email thật.
4. Cấu hình SMTP/sender đã xác minh, Site URL/origin HTTPS, chính sách mật khẩu và giới hạn Auth theo môi trường. Backend dùng `PAGEFPT_PUBLIC_ORIGIN` cho kiểm tra cùng origin; chỉ bật trusted proxy khi thực sự chạy sau Vercel. Template/SMTP là cấu hình tài khoản ngoài workspace và chưa được thay đổi trong phiên sửa lỗi.
5. Dùng tài khoản kiểm thử có membership active: nhận mã email → nhập mật khẩu mới + mã authenticator nếu đã bật TOTP → reset → đăng nhập bằng mật khẩu mới; kiểm tra mọi phiên admin cũ bị từ chối. Kiểm tra sai/hết hạn/dùng lại mã, provider rate limit và lỗi mạng. Không dùng fixture password trong tests làm tài khoản thật.

Nguồn đối chiếu: [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords), [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Verify OTP](https://supabase.com/docs/reference/javascript/auth-verifyotp), [Auth REST contract](https://github.com/supabase/auth/blob/master/openapi.yaml).

## Hợp đồng frontend

| Lệnh | Body | Kết quả |
|---|---|---|
| `POST /api/v1/auth/recovery` | `{email}` | `202 {accepted:true}` sau provider accepted; thông báo chung cho tài khoản có/không tồn tại |
| `POST /api/v1/auth/recovery/reset` | `{email,otp,password,totp:""}` | `200 {changed:true,provider_revoked:boolean}` sau password update và audit hoàn tất |

Email được chuẩn hóa, tối đa 254 ký tự. OTP email 6–8 chữ số; TOTP trống hoặc 6 chữ số; mật khẩu 8–1024 ký tự, còn chịu chính sách Supabase. Chỉ nhận whitelist fields. Bước nhập mã trong UI chỉ kiểm tra định dạng; xác minh diễn ra ở lần gửi cuối. Không báo đổi thành công khi API lỗi. Xóa mã/mật khẩu khỏi các input sau thành công, chuyển về login và yêu cầu đăng nhập lại.

| Mã lỗi | Xử lý |
|---|---|
| `UNAUTHENTICATED` 401 | Mã không hợp lệ/hết hạn hoặc bằng chứng không hợp lệ; yêu cầu mã email mới |
| `MFA_REQUIRED` / `MFA_TOTP_REQUIRED` 403 | Nhập mã từ authenticator đã đăng ký; không gửi mã qua SMS; có thể cần email code mới |
| `PERMISSION_DENIED` 403 | Membership inactive/không được cấp quyền; không tự cấp quyền bằng recovery |
| `PASSWORD_REJECTED` 422 | Mật khẩu yếu/trùng mật khẩu cũ; yêu cầu mã mới rồi chọn mật khẩu khác |
| Validation 422 | Sửa định dạng email/code/password; không suy luận đã xác thực |
| `RATE_LIMITED` 429 | Chờ trước khi thử lại; có cả throttle backend và giới hạn provider |
| `AUTH_UNCONFIGURED` / `AUTH_UNAVAILABLE` / `DATABASE_UNAVAILABLE` 503 | Chưa xác nhận hoàn tất; yêu cầu mã mới/kiểm tra cấu hình hoặc provider/database |

Provider tiêu thụ email OTP trước các bước MFA/PUT; nếu bước sau thất bại mã email có thể đã hết hiệu lực. Backend không lưu recovery token để retry và không tự retry thao tác reset. UI có nút yêu cầu mã mới. Có thể cần đăng nhập/khôi phục lại nếu password PUT đã commit nhưng response/audit bị mất; hệ thống không giả có distributed transaction giữa Auth và Postgres.

## Thứ tự và thu hồi phiên

Sau OTP recovery, kiểm tra chữ ký JWT, subject, membership active và MFA/TOTP nếu đã đăng ký. RPC `auth_recovery_revoke_sessions` thu hồi toàn bộ BFF sessions của subject, ghi `auth.password_recovery_verified` **trước** PUT đổi mật khẩu. Nếu RPC này lỗi, không gọi PUT. Sau provider xác nhận đúng user, gọi logout global best effort rồi RPC `auth_recovery_complete` ghi `auth.password_recovered` và thu hồi lại mọi phiên phát sinh giữa hai bước. Nếu PUT/response/audit sau đó lỗi, phiên BFF cũ đã bị thu hồi. Không ghi password/code/token vào audit.

`provider_revoked:false` nghĩa là mật khẩu và thu hồi BFF đã hoàn tất, nhưng chưa xác nhận logout global của Supabase. Các phiên đăng nhập trực tiếp provider cần kiểm tra riêng nếu project có ứng dụng khác sử dụng Auth. Quyền admin vẫn do membership và scope server quyết định; recovery không nâng quyền.

Recovery bị giới hạn theo email và IP proxy tin cậy; key được HMAC, không lưu IP/email thô vào bucket/log. IP không tin cậy không được dùng thay bằng IP proxy chia sẻ; email throttle luôn áp dụng. API kiểm tra Origin trước khi gọi provider.
