# Tỉnh/thành và xã/phường từ API

Nguồn: [Province Open API v2](https://provinces.open-api.vn/api/v2/redoc), danh mục sau sáp nhập 2025. Đây là API cộng đồng, không tuyên bố API cơ quan nhà nước. Bản đóng gói tải ngày 02/10/2026 gồm 34 tỉnh/thành và 3.321 xã/phường. Tên/mã hành chính không xác nhận phạm vi phủ sóng mạng.

## Sử dụng

Trong `/admin/pricing`, bấm **Đồng bộ tỉnh, xã từ API**. Chọn chi nhánh, chọn tất cả hoặc checkbox tỉnh cần quản lý, tìm không dấu nếu muốn. Mỗi tỉnh nhập cả xã/phường trực thuộc. Mặc định lấy mới từ API; nếu timeout/lỗi cấu trúc, giữ snapshot API hợp lệ đã lưu trong instance (mode=cached), hoặc dùng bản đóng gói nếu chưa có (mode=bundled), và hiển thị cảnh báo/ngày tải thực tế. Có thể chủ động chọn bản dự phòng. Cần `catalog.write` tại chi nhánh và MFA (AAL2), session/CSRF hiện hành.

Sau đồng bộ, danh mục được công bố để chọn trong gói/bảng giá và trang khách. Client có **Tất cả tỉnh/thành**, chọn tỉnh rồi xã/phường; ward tải theo trang tối đa100, cache trong tab. Tỉnh/xã dùng UUID DB, dùng chung cho quote và lead, không lấy mã hành chính gửi vào `region_id`. Gói/giá vẫn phải thiết lập và công bố riêng.

## Hợp đồng API

| Lệnh | Dữ liệu / xử lý |
|---|---|
| `GET /api/v1/admin/locations/source` | Quyền catalog.write, không cần MFA để xem. Metadata bản dự phòng `{provider,source_url,fetched_at,checksum,mode,warning}` + `provinces:[{code:int,name,ward_count}]` + `syncs` theo quyền chi nhánh. Không gọi nguồn ngoài khi mở form. |
| `POST /api/v1/admin/locations/sync` | `{branch_id:UUID,province_codes:int[]=[],source:"live"|"bundled"="live"}`. `[]` đồng bộ toàn bộ bản nguồn mới; UI gửi `[]` khi tick tất cả. Chọn một số tỉnh thì gửi mã nguồn API. |
| Kết quả sync | `{created,updated,skipped,total,revision,source:{provider,source_url,fetched_at,checksum,mode,warning}}`. `skipped` gồm thay đổi thủ công, địa bàn đã ngừng, con của tỉnh chưa công bố. `total` là số địa bàn trong batch, không phải toàn DB. |
| Đọc địa bàn sau sync | Giữ nguyên `/regions/hierarchy`, `/regions/{provinceUUID}/wards`, `/admin/locations` với cursor như hướng dẫn giá theo địa bàn. |

Lỗi `INVALID_PROVINCE_CODE`422 khi tỉnh đã chọn không có trong snapshot thực; tải lại danh mục. `GEOGRAPHY_SCOPE_CONFLICT`409 khi UUID/mã/cha/chi nhánh không tương thích; toàn batch rollback, giữ giá và liên kết cũ. `PERMISSION_DENIED`403 cho quyền/MFA. `DATABASE_UNAVAILABLE`503 có thể xảy ra sau timeout; kiểm tra trạng thái hoặc đồng bộ lại, do sync idempotent. Body nhận whitelist; không cho client cung cấp URL nguồn hay hàng dữ liệu tùy ý.

UUIDv5 theo namespace URL và chuỗi `province_open_api_v2:{province|ward}:{code}` cố định. ResourceInput sạch chứa mã `vn2025-province-1`/`vn2025-ward-4`, name, level, parent_id, branch_id, zone_id=khac, aliases và price_group_id. Nguồn/mã bên ngoài và payload nhập cuối lưu riêng tại private.geography_mappings, không spread metadata vào RegionInput. Không tự gộp UUID địa bàn nhập tay trùng tên; không tự xóa mã mất khỏi nguồn. Mỗi địa bàn thuộc một chi nhánh; resync dùng chi nhánh đã nhập trước đó.

Bản sửa thủ công (cả đã công bố) và bản nháp được giữ nguyên, không tự ghi đè hoặc hồi sinh bản đã ngừng. Đổi cha/chi nhánh cần quản trị riêng, không tự chuyển bảng giá. Một giao dịch khóa catalog_revision, một audit/manifest batch; chỉ tăng revision khi thực sự thêm/cập nhật resource. Không có số điện thoại/IP gửi tới API này.

## Tốc độ và triển khai

Nguồn server HTTPX bất đồng bộ, timeout tổng10s/connect2s, giới hạn2MB, kiểm tra code/name/cha/trùng. Singleflight và cache live5phút theo instance, fallback30giây. RPC sync có ngân sách10s; RPC còn lại giữ2s. UI sync25s. Không gọi API ngoài trên luồng khách, quote hay lead. PostgreSQL local nhập3.355 địa bàn khoảng0,49s; đây không phải cam kết độ trễ production.

Áp dụng migration11 `supabase/migrations/20261002041818_geography_api_sync.sql` sau migration giá phân cấp10. Hai bảng provenance private có RLS, chỉ service_role; không secret/env mới, không thay cấu hình R2/Vercel. Deploy dùng quy trình staging và [Supabase database functions](https://supabase.com/docs/guides/database/functions); tác vụ này chỉ kiểm thử DB local, chưa áp dụng cloud.

Source JSON được đóng gói trong wheel tại `pagefpt/modules/catalog/data/vn_geography_v2.json`; ngày và checksum có trong preview/kết quả sync. Muốn cập nhật bản dự phòng phát hành: tải URL depth2 qua server, validate_snapshot trước, ghi fetched_at UTC, chạy test nguồn/đóng gói và review thay đổi. Không sửa migration đã áp dụng.
