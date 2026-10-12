# Kiểm tra bảng Supabase — 06/10/2026

Đã truy vấn trực tiếp project **FPTWeb**, ref `ryfdlhmbytabinsbxbup`, trạng thái `ACTIVE_HEALTHY`.

- Schema `private`: **37 bảng**, tất cả bật RLS.
- Schema `public` và `api`: không có bảng nghiệp vụ. Backend sử dụng RPC ở schema `api` để xử lý các bảng trong `private`.
- Lịch sử migration: **12 migrations**, từ `foundation` đến `admin_quality`, đã áp dụng. Không cần tạo lại bảng hoặc chạy lại migration.
- Dữ liệu hiện tại: `leads = 0`, `prices = 0`, `resources = 0`, `memberships = 1`, `runtime_settings = 0`.

## Xem bảng

Mở [Table Editor của FPTWeb](https://supabase.com/dashboard/project/ryfdlhmbytabinsbxbup/editor). Chọn schema **private** trong bộ chọn schema. Khi schema đang là `public`, danh sách bảng nghiệp vụ sẽ trống.

Nếu chưa thấy bộ chọn hoặc danh sách chưa cập nhật, mở [SQL Editor](https://supabase.com/dashboard/project/ryfdlhmbytabinsbxbup/sql/new) và chạy câu lệnh chỉ đọc sau:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'private'
order by tablename;
```

## Các bảng đã xác nhận

```text
activities                  admin_sessions             appointments
audit                       catalog_revision           contacts
daily_metrics               deliveries                 events
export_epoch                geography_mappings         geography_syncs
idempotency                 jobs                       leads
memberships                 metric_dirty_days          observations
operational_settings        permits                    prices
quote_history               quotes                     rate_buckets
redirects                   resource_revisions         resources
runtime_settings            saved_lead_views           sessions
site_display_settings       tombstones                 touches
used_challenges             visit_assessments          wake_failures
wake_signals
```

`resources` lưu các tài nguyên nghiệp vụ theo loại, bao gồm gói cước và khu vực; không phải mỗi loại đều có một bảng riêng. `prices` chứa bảng giá. `leads` và `contacts` chứa yêu cầu tư vấn và liên hệ.

Việc các bảng tồn tại khác với việc đã nhập dữ liệu. Chưa nhập gói cước, khu vực và giá thực vào project này; không tự chuyển fixtures QA hoặc giá mẫu từ máy lên cloud. Sau khi hoàn tất đăng nhập admin, cần nhập dữ liệu đã được xác nhận qua chức năng quản trị hoặc quy trình import của ứng dụng.

Đợt kiểm tra này chỉ đọc thông tin schema và số lượng bản ghi, không thay đổi bảng, quyền truy cập hoặc dữ liệu khách hàng.
