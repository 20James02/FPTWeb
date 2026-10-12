# Kết nối Supabase FPTWeb — 03/10/2026

## Project và thay đổi đã thực hiện

- Project: **FPTWeb**, reference `ryfdlhmbytabinsbxbup`.
- Project URL: https://ryfdlhmbytabinsbxbup.supabase.co.
- Dashboard: https://supabase.com/dashboard/project/ryfdlhmbytabinsbxbup.
- Region: `ap-northeast-2`; PostgreSQL 17.11; trạng thái khi kiểm tra `ACTIVE_HEALTHY`.
- Trước triển khai: không có bảng ứng dụng, migrations hoặc tài khoản Auth.
- Đã sửa `PAGEFPT_SUPABASE_URL` từ hostname database sang URL Data API và điền publishable key vào `PAGEFPT_SUPABASE_AUTH_KEY`.
- Giữ nguyên server secret và bốn khóa ứng dụng đã có; không ghi giá trị các khóa trong tài liệu/log.
- File `.env` chỉ cấp quyền chủ sở hữu (0600), được Git ignore.
- Đã áp dụng đủ 12 migrations của repository qua MCP/SQL. Mỗi migration chạy trong transaction cùng bản ghi lịch sử; giữ nguyên version/name của file nguồn để tương thích đối chiếu lịch sử bằng CLI sau này.
- SQL nguồn được lưu trong `supabase_migrations.schema_migrations.statements[1]`; checksum đã đối chiếu từng file. Sai khác do ghép chuỗi ở bản lưu migration đầu đã được phát hiện và sửa trước khi tiếp tục; SQL schema đã thực thi không thay đổi.
- Extensions đã sẵn sàng: pgmq 1.5.1, pg_net 0.20.4, pg_cron 1.6.4, supabase_vault 0.3.1.
- Có 37 bảng trong schema private; tất cả bật RLS, không cấp quyền bảng cho anon/authenticated/PUBLIC.
- Có policy `pagefpt_private_broadcast` trên `realtime.messages`.

## Exposed schema

Đã cấu hình trực tiếp:

```sql
ALTER ROLE authenticator SET pgrst.db_schemas = 'api';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
```

Chỉ schema `api` được expose. `private` và `public` bị từ chối qua Data API.

Đây là override trên role authenticator. Dashboard Exposed Schemas không tự thay thế override này. Nếu muốn quản lý qua Dashboard về sau, cấu hình Dashboard chỉ expose `api`, rồi chạy `ALTER ROLE authenticator RESET pgrst.db_schemas;` và reload config, sau đó kiểm chứng lại các phép kiểm quyền bên dưới. [Tài liệu Supabase](https://supabase.com/docs/guides/troubleshooting/pgrst106-the-schema-must-be-one-of-the-following-error-when-querying-an-exposed-schema).

## Kết quả kiểm chứng

Dùng app thật từ `pagefpt.application.create_app(Settings())`, cấu hình `.env`, ASGITransport và kết nối HTTPS thật tới Supabase. Không dùng gateway/mock hoặc server QA.

| Kiểm tra | Kết quả |
|---|---|
| Backend /health/live | 200, status alive |
| Backend /health/ready | 200, status ready |
| Trang /admin/login | 200 |
| /api/v1/admin/me chưa đăng nhập | 401 |
| RPC health bằng server secret | 200, ready true |
| RPC health bằng publishable key | 401, PostgreSQL 42501 |
| RPC yêu cầu schema private | 406, PGRST106 |
| RPC yêu cầu schema public | 406, PGRST106 |
| claim_jobs: lead_local | jobs rỗng, thành công |
| claim_jobs: lead_external | jobs rỗng, thành công |
| claim_jobs: conversions | jobs rỗng, thành công |
| claim_jobs: notifications | jobs rỗng, thành công |
| claim_jobs: maintenance | jobs rỗng, thành công |

Auth settings và JWKS trả HTTP 200; signing key công khai là ES256, được TokenVerifier của dự án chấp nhận. Chưa có user để kiểm chứng token/đăng nhập thực tế.

8 kiểm tra HTTP/backend/quyền và 5 kiểm tra claim queue trống đã đạt. Không tạo lead/contact thử trong database này. Không coi kiểm tra queue trống là xác nhận retry/enrichment hoặc tác động nhà cung cấp đã hoạt động.

## Migrations đã xác nhận

MD5 ở đây dùng để kiểm tra SQL nguồn giữ nguyên, không dùng cho bảo mật hoặc đối sánh dữ liệu khách hàng.

| Version | Name | MD5 SQL nguồn |
|---|---|---|
| `20260930080832` | `foundation` | `ccb43de079e36cfc534280fae5f93010` |
| `20260930082001` | `catalog_intake` | `101e207b1d679b49a37db451b54db411` |
| `20260930082718` | `workflow_intelligence` | `1e012fb511c3b937f5eb60c39ab21969` |
| `20260930084349` | `modules` | `a877693aa58e27ecae8abf34bf39422c` |
| `20260930085247` | `governance_media` | `07acb030a33257e79b25b39254a86417` |
| `20260930085905` | `hardening` | `ab06e5c473bd057838370bfbe194e069` |
| `20260930091141` | `operations` | `6d0907e2b68f1877bc637cdc49621bc7` |
| `20261001014824` | `sessions_and_crm_completion` | `112c420644f9eb230707e668e7244dfb` |
| `20261002014547` | `password_recovery_session_revoke` | `34d06a82c114bb85d3dd030b97b407bc` |
| `20261002030610` | `hierarchical_regional_pricing` | `4bbe44f3cfc241ee1d398f002e8bcbaa` |
| `20261002041818` | `geography_api_sync` | `1b30b99c3f003ab27b5f4501dc3cc645` |
| `20261002080000` | `admin_quality` | `c7059e2ba456226227c8e5a97f3daf42` |

## Advisors

Đã chạy security và performance advisors, không báo toàn bộ sạch:

- 37 thông báo INFO RLS enabled/no policy ở private là phù hợp thiết kế backend service_role; không thêm policy đọc rộng để xóa thông báo.
- Hai nhóm security WARN về quyền execute của hàm platform `public.rls_auto_enable()`: đã kiểm tra hàm trả event_trigger và gắn event trigger; public hiện không expose. Không thay đổi hàm/quyền platform trong bước kết nối này.
- Performance có 2 cặp index trùng trên leads, 3 foreign key chưa có covering index và thông báo unused index ở database mới. Cần xử lý bằng migration riêng sau khi review, không xóa index tùy tiện trong lúc kết nối.

## Các bước chưa hoàn thành

- Chưa có Auth user hoặc membership owner; chưa đăng ký/kiểm chứng MFA cho user.
- Chưa nhập địa bàn, chi nhánh, gói hoặc giá thương mại.
- Origin hiện là HTTP localhost; không cấu hình worker gọi origin này từ Supabase. Chưa có runtime_settings hoặc cron pagefpt-recover hoạt động.
- Chưa cấu hình R2 hoặc deployment Vercel.
- Chưa kiểm thử end-to-end lead, chống trùng/retry, Realtime, đăng nhập MFA, upload hoặc export trên cloud.
- Python app hiện vẫn ở development theo cấu hình local. Các trang client ở production còn gate trong source.

Bước tiếp theo: tạo owner thật và MFA; triển khai Vercel/R2 theo [hướng dẫn](HUONG-DAN-VERCEL-SUPABASE-R2.md), cấu hình Vault/worker bằng origin HTTPS thật, rồi nghiệm thu end-to-end.
