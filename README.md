# PageFPT

Backend Python/FastAPI cho website thu lead và quản trị tư vấn: giá theo gói/khu vực/thời gian, CRM, phân tích có giải thích, queue, marketing, CMS, R2, chăm sóc và quản trị dữ liệu. Kiến trúc modular monolith; Supabase RPC giữ các bất biến trong transaction. Không cần Node để chạy backend.

```text
src/pagefpt/
  application.py          App factory và lifecycle
  api/                    HTTP boundary, authorization, dependencies, v1 router
  core/                   Settings, crypto, lỗi, clock, metrics
  infrastructure/         Database/storage ports; Supabase Auth/RPC, R2 adapters
  modules/                Các miền nghiệp vụ độc lập
    identity/ catalog/ pricing/ leads/ intelligence/ abuse/ workflow/
    marketing/ integrations/ content/ media/ care/ reporting/ governance/
  web/                    Controllers Jinja2 của giao diện đã tạo
  templates/ static/      Giao diện client/admin, giữ bố cục hiện có
supabase/migrations/      Schema, grants/RLS, RPC và các bản nâng cấp
tests/                   Unit, PostgreSQL integration, contracts, load, mobile e2e
deploy/                  Cấu hình vận hành để review trước rollout
tools/                   OpenAPI và các công cụ kiểm chứng
docs/backend/            Thiết kế, kết quả, runbook và hợp đồng API
```

## Chạy

Dùng Python 3.12 và uv. Sao chép `.env.example` thành `.env`, điền cấu hình riêng cho môi trường. Các khóa mã hóa, matching, token và worker phải độc lập; mỗi khóa có thể tạo bằng `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

```bash
uv sync --locked
uv run uvicorn app:app --host 127.0.0.1 --port 8000 --no-access-log
```

Development/test mở `/docs` và các trang giao diện xem trước. Staging/production chỉ mở API: các trang HTML hiện có còn dữ liệu thiết kế mẫu nên chưa được tự công bố. Form, đăng nhập, thao tác CRM và cấu hình hiển thị đã nối API thật; không giả lập gửi thành công khi backend lỗi. API không seed bảng giá thương mại. Admin phải nhập nguồn giá, duyệt và publish.

Migrations chạy qua Supabase CLI trên môi trường đích sau khi đọc [rollout](docs/backend/rollout.md). Chỉ expose schema `api`; `private` không expose. Đăng nhập cần publishable/anon key riêng và Supabase Auth dùng khóa ký bất đối xứng ES256/RS256. Không đưa secret/service-role key vào JavaScript.

## Kiểm chứng

```bash
uv run ruff check src tests tools
uv run ruff format --check src tests tools
uv run mypy src
uv run pytest -q
node tests/contracts/browser_api.mjs
```

`pytest` tự khởi tạo PostgreSQL cục bộ bằng `pgserver` hoặc dùng `PAGEFPT_TEST_DSN` trỏ tới một server test. Mỗi suite tạo database riêng rồi xóa database đó. Các RPC chạy thật dưới `service_role`; unit tests không thay thế kiểm tra transaction/quyền. `tools/vendor/pgmq.sql` là fixture upstream cho PostgreSQL portable, không phải migration production.

Mobile e2e: chạy `PYTHONPATH=src:. uv run uvicorn tests.e2e.server:app --port 8091 --no-access-log`, rồi `node tests/e2e/mobile.cjs`. Cần Playwright và Chrome; có thể cấu hình `NODE_PATH`, `PAGEFPT_CHROME`, `PAGEFPT_TEST_ORIGIN`. Harness chỉ dùng dữ liệu giả và database riêng, không gửi tin nhắn/ads thật. Khởi tạo server fixture mới cho mỗi lượt e2e để không tích lũy token bucket từ các lần dùng cùng số test.

Xem [hợp đồng API](docs/backend/api-contract.md), [vận hành](docs/backend/operations.md), [kết quả kiểm chứng](docs/backend/verification.md) và [cấu trúc mở rộng](docs/backend/2026-10-01-project-structure.md). Chưa triển khai hoặc kiểm chứng live Supabase/R2/Vercel trong phiên này.

Bản sửa lỗi tích hợp 02/10/2026: [báo cáo và bằng chứng](docs/qa/2026-10-02/BAO-CAO-SUA-LOI.md), [cấu hình khôi phục mật khẩu](docs/backend/password-recovery.md).
