# Cấu trúc mở rộng và hoàn thiện backend

Tiếp nối đặc tả backend 30/09 và yêu cầu tự triển khai của người dùng ngày 01/10/2026. Giữ FastAPI/Python/Jinja2 và các thư mục giao diện hiện có; API URL giữ nguyên khi di chuyển module nội bộ.

## Cấu trúc đã chọn

- `src/pagefpt/api`: ghép router, dependency, middleware và hợp đồng HTTP.
- `src/pagefpt/core`: cấu hình, mã hóa, lỗi, đồng hồ, logging; không nhập router nghiệp vụ.
- `src/pagefpt/modules/<domain>`: schema, domain/service, router của từng miền: identity, catalog, pricing, leads, intelligence, workflow, marketing, content, media, care, governance, reporting, integrations, abuse.
- `src/pagefpt/infrastructure`: các cổng database/storage và adapter Supabase/R2; không lưu dữ liệu sản phẩm trong RAM.
- `src/pagefpt/web`, `templates`, `static`: giao diện đã tạo. Không đổi CSS/bố cục. Nối hợp đồng API và loại kết quả thành công giả.
- `supabase/migrations`: phiên bản database/RLS/RPC; migration tiếp theo bổ sung chức năng, không sửa cấu trúc đã triển khai ở môi trường thật.
- `tests/{unit,integration,contracts,load}`: thuật toán thuần, PostgreSQL thật với service_role, adapter HTTP/R2, hiệu năng.
- `deploy`, `tools`, `.github/workflows`, `docs/backend`: cấu hình, bootstrap tái lập, CI, runbook và OpenAPI.

## Thứ tự thực hiện

1. Khôi phục test PostgreSQL tái lập; ghi baseline.
2. Tách lớp ứng dụng/API/module/infrastructure, giữ frontend tại chỗ, kiểm tra import và API.
3. Đăng nhập Supabase thật, cookie HttpOnly/CSRF, thu hồi session và refresh có khóa; API hiện tại vẫn hỗ trợ Bearer token.
4. Hoàn thiện CRUD giá, lịch hẹn, quote confirmation, intelligence/recompute, CMS redirects và báo cáo/retention tự động.
5. Nối form và admin với API thật, giữ idempotency qua lỗi mạng, không xác nhận thành công khi lỗi/409.
6. Kiểm thử lỗi đồng thời, phân quyền và toàn bộ suite; phát hành tài liệu vận hành, hợp đồng API, cấu hình Vercel/Supabase/R2 và báo cáo kết quả.

Không có tài khoản cloud trong phiên: hoàn thiện code/config/test cục bộ; xác thực live provider và triển khai production cần môi trường và credentials thật. Giá nhập/publish bởi người có quyền; không tự seed giá thương mại.

## Kết quả

Các bước 1–6 đã thực thi cho code cục bộ. Có 14 module, 8 migration, OpenAPI sinh từ code, CI workflow, Makefile, schema/architecture/wheel tools và runbook/deploy templates. Kết quả và giới hạn xác nhận tại `verification.md`; cloud rollout chưa chạy.
