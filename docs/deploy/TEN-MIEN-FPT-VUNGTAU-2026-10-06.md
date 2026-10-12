# Gắn tên miền fpt-vungtau.com — 06/10/2026

Website chính: https://fpt-vungtau.com. Admin: https://fpt-vungtau.com/admin/login. Cả hai tên miền đã gắn vào đúng Vercel project pettravel/fpt-web; DNS công khai và Vercel xác nhận configured-correctly, verified true, misconfigured false. HTTPS đã kiểm tra với xác minh chứng chỉ bật. DNS authoritative giữ ns-a1/a2/a3.tenten.vn.

## DNS đã lưu tại TenTen

| Type | Host | Value |
|---|---|---|
| A | @ | 216.198.79.1 |
| A | @ | 64.29.17.1 |
| CNAME | www | e638dea03bdce5f4.vercel-dns-017.com |

Người dùng đã lưu và gửi ảnh xác nhận cả ba bản ghi. Đây là recommendation Vercel đọc trực tiếp từ project/domain đã attach; không dùng IP/CNAME ví dụ cố định.

Snapshot trước: apex A 13.229.38.226; www CNAME dns.ladipage.com, trang www phục vụ LadiPage. Sau thay đổi, DNS công khai đã khớp bảng và domain phục vụ PageFPT. Không chuyển registrar hoặc nameservers.

www chuyển hướng 308 sang apex, giữ nguyên đường dẫn/query. Kiểm tra thực: https://www.fpt-vungtau.com/admin/login?domain-check=final trả Location https://fpt-vungtau.com/admin/login?domain-check=final; Chrome theo chuyển hướng và nhận 200. Không tắt xác minh TLS.

## Cấu hình và triển khai

- Deployment công khai: `dpl_53XqPcoMswgssJ2hQugNbL77uAWX`, candidate https://fpt-7bv4grlsl-pettravel.vercel.app. Build READY; 12 kiểm tra candidate đạt rồi promote; đọc lại apex khớp deployment này.
- Production PAGEFPT_PUBLIC_ORIGIN và PAGEFPT_TELEGRAM_ADMIN_ORIGIN đều là https://fpt-vungtau.com.
- PAGEFPT_ALLOWED_ORIGINS gồm ba origin HTTPS chính xác: fpt-vungtau.com, www.fpt-vungtau.com và fpt-web-ten.vercel.app. Backend CSRF vẫn chặn Sec-Fetch-Site cross-site; không mở wildcard.
- R2 private CORS đã cập nhật và đọc lại qua Cloudflare management API: PUT/Content-Type từ ba origin trên, maxAgeSeconds 300. OPTIONS signed URL: ba origin hợp lệ trả 204, evil.example trả 403. Không upload object trong kiểm tra CORS.
- Worker/Vault/cron giữ alias Vercel đang hoạt động. Không thay khóa hoặc chạy lại migrations. Supabase proof được trao đổi trên server; khôi phục Telegram không phụ thuộc link redirect email.
- .env local giữ origin localhost. Cloud vẫn chạy chế độ staging; việc gắn domain không thay trạng thái catalog hoặc bật quảng cáo.

## Kiểm chứng

- Python: 230 passed, 48.69 giây trong đợt origin; Ruff và mypy đạt. Có 8 integration cases cho alias chính xác, domain giả, HTTP downgrade và cross-site.
- Dry upload: 163 regular files; 12 giá trị nhạy cảm được đối chiếu và không xuất hiện trong source upload.
- 12 kiểm tra candidate đạt: trang khách hàng, Admin, readiness, auth/worker guard, static, sitemap, robots; recovery nhận 202 cho tài khoản tổng hợp chưa liên kết ở cả ba origin, origin lạ nhận 403.
- 10 kiểm tra domain công khai đạt với TLS verification: trang chủ, Admin, health, guards, static, sản phẩm/khuyến mãi và www redirect.
- Chrome trên domain thật: đúng ba trường Tên/Số điện thoại/Địa chỉ, màn hình khôi phục Telegram 6 số, không pageerror hoặc tràn ngang tại 360/390/430/1440px. Chỉ dùng email tổng hợp chưa liên kết; không gửi lead hoặc đổi mật khẩu trong kiểm thử tự động.

### Đối chiếu báo lỗi đổi mật khẩu

Log Vercel xác nhận yêu cầu trên deployment cũ `dpl_3PZiYjCR591j3ByWseSzstNQfgDW` từ domain mới bị 403 trước promotion vì origin cũ. Bản vừa promote đã chứa sửa đổi CSRF/allowed origins và origin mới.

Sau promotion, thao tác thật của người dùng: recovery/reset 200 lúc 15:54:52 và auth/session 200 lúc 15:54:57 (Asia/Ho_Chi_Minh). Supabase xác nhận /verify 200, PUT /user 200, logout 204 và /token 200. Audit private có auth.password_recovered và auth.signed_in tương ứng. Không đọc hoặc thay mật khẩu trong chẩn đoán. Thông báo giao diện cụ thể vẫn cần đối chiếu nếu người dùng gặp lỗi mới.

## Bằng chứng cục bộ

Snapshot ngoài Git tại .local/deploy-cli: fpt-vungtau-dns-before/after.json, fpt-vungtau-verify-after.json, fpt-vungtau-www-verify-after.json, fpt-vungtau-www-redirect-result.json, fpt-vungtau-r2-cors-preflight.json, deployment-domain.json, cloud-smoke-domain.json, promotion-domain.json, production-domain-readback.json, domain-smoke-domain.json và browser-cloud-domain.json. Screenshot mobile: .local/qa/cloud-fpt-vungtau-form.png. Không đưa token, mã hoặc mật khẩu vào tài liệu.

Tài liệu đã đối chiếu: [Vercel domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Domain redirect API](https://vercel.com/docs/rest-api/projects/update-a-project-domain), [TenTen DNS](https://help.tenten.vn/huong-dan-cau-hinh-dns-tai-tenten/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).

Bản UI mới sau đợt gắn tên miền: `dpl_BjQe7LLghWkSdvZxexDTegszh3ii`, đã promote và đọc lại trên domain; xem [ghi nhận triển khai](TRIEN-KHAI-2026-10-06.md). DNS và TLS không đổi.
