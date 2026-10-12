# Gói đã chốt, lịch thanh toán và nhắc nhân viên — 07/10/2026

## Phạm vi

Chọn gói đã công khai và kỳ 1/6/12 tháng; lập nhiều khoản theo ngày/số tiền/ghi chú; sửa hoặc hủy khoản chờ thu; xác nhận đã thu và tùy chọn tạo kỳ kế tiếp. Lịch sử giữ snapshot gói/kỳ, không sửa nhu cầu gốc hoặc trạng thái CRM.

Thông báo trong Admin dành riêng cho nhân viên đang phụ trách; dedup theo người nhận và phiên bản khoản, đánh dấu đã đọc, mất quyền khi bàn giao, dừng khi đã thu/hủy. Cron 5 phút và inbox recovery dùng ngày Việt Nam. Chưa triển khai Telegram riêng hoặc OS push.

Khung cơ sở đánh giá chuyển vào dialog; thông tin chính dùng nhãn dễ đọc. Đổi tên thao tác dữ liệu cá nhân thành **Hiển thị thông tin**, giữ nguyên quyền/MFA.

## Kiểm chứng

- Red phase: 19 kiểm thử mới thất bại vì chưa có API. Sau triển khai, 26 kiểm thử billing SQL/API đạt. Bao gồm CAS, retry chống trùng, thu + kỳ mới atomic, collision rollback, scope/MFA/PII, cascade, phân trang, gửi nhắc đúng người và tháng cuối năm/năm nhuận.
- Review tái hiện hai vấn đề: sửa khoản tháng 2 làm mất mốc ngày 31 và inbox render lại làm mất focus. Đã thêm kiểm thử thất bại trước sửa, sửa, chạy đạt; review cuối không còn phát hiện cần sửa.
- Toàn bộ Python: **293 passed, 86.86 giây**. 12 file JS contract đạt. Ruff/format 146 files, mypy và architecture 94 source files đạt; git diff whitespace check đạt.
- Browser thao tác với PostgreSQL disposable, Auth fixture và Chrome thật: chọn gói, thêm/sửa/thu/hủy, tạo kỳ sau, inbox/đọc, popup điểm, giữ bản nháp khi refresh, viewport 1440/768/360 và dark mode; không overflow/pageerror. Kiểm thử focus inbox riêng đạt cả trường hợp hết thông báo.
- Evidence: `.local/qa/billing-python-full.txt`, `billing-contracts.txt`, `billing-browser-green.txt`, `lead-billing/result.json` và ảnh `form-{1440,768,360}.png`.
- Supabase migration **20261007052315_lead_billing_reminders** áp dụng thành công; 3 bảng RLS bật, anon/authenticated không có quyền đọc trực tiếp, service role có quyền; các hàm mới có search_path rỗng và chỉ service role execute. API dispatch có billing hook; cron `pagefpt-recover` vẫn active mỗi 5 phút.
- Advisors không phát hiện thiếu index FK của bảng mới hoặc function search path. RLS không có policy cho schema private là chủ đích chặn browser; các cảnh báo cũ về password protection/index trùng không thuộc thay đổi này. Tài liệu xử lý: [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [duplicate index](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

Không thử ghi khoản thanh toán/đánh dấu thu/bàn giao lead khách thật hoặc gửi thử thông báo ra Telegram. Dữ liệu thao tác browser/SQL là tổng hợp trong môi trường kiểm thử.

## Triển khai

Candidate `dpl_Dv66e9tGwEjSkUVF3p3sQPcRkr3t`, `https://fpt-2arxw2wn8-pettravel.vercel.app`, READY. Manifest195 entries (183 regular files), có đủ các file runtime mới, không tải credentials/env/local tools. Candidate đạt **14** HTTP/asset SHA checks, promote thành công. Tên miền [fpt-vungtau.com](https://fpt-vungtau.com) đạt **16** kiểm tra: home/health/login/catalog hoạt động, trang riêng redirect đăng nhập, APIs riêng401, www308 giữ path/query; toàn bộ JS/CSS billing mới khớp SHA256 source. Inspect tên miền trả đúng deployment trên và READY.


Evidence cloud: `.local/deploy-cli/deployment-billing.json`, `cloud-smoke-billing.json`, `cloud-live-billing.json`, `domain-billing-inspect.json`, `upload-billing.json`. Luồng ghi tài chính/MFA được kiểm thử bằng SQL thật và browser fixture; cloud kiểm tra auth gates, schema/grants và mã đã triển khai, không sửa dữ liệu khách thật.
