# Quản lý gói và giá theo địa bàn

## Thao tác tại /admin/pricing

1. **Địa bàn:** ưu tiên **Đồng bộ tỉnh, xã từ API**, chọn checkbox tỉnh để nhập danh mục đã công bố. Xem [danh mục qua API](DANH-MUC-DIA-BAN-API.md). Khi cần nhập tay: thêm tỉnh/thành với tên, mã, vùng miền và chi nhánh có quyền quản lý. Thêm xã/phường bằng cách chọn tỉnh trực thuộc; hệ thống kế thừa chi nhánh và vùng miền. Lưu rồi **Công bố**. Không sử dụng danh mục địa lý giả khi chưa có dữ liệu được công bố.
2. **Gói cước:** thêm/sửa tên, mã gói, dịch vụ, tốc độ, mô tả, thiết bị. Chọn tất cả địa bàn hoặc bỏ chọn để tick các tỉnh/thành, mở nút Xã/phường để chọn nơi cụ thể. Tick một tỉnh áp dụng cho các xã/phường con. Lưu rồi **Công bố**; chỉnh sửa gói đang công bố giữ nội dung công khai cũ cho đến lần công bố tiếp theo.
3. **Bảng giá:** chọn gói, Giá mặc định hoặc địa bàn. Có tìm tên tỉnh/thành, xã/phường và chọn nhiều checkbox. Nhập một giá chung cho các nơi đã chọn; cước/phí nhập VND có phân cách hàng nghìn. VAT nhập phần trăm, tùy chọn đã gồm VAT, tháng thanh toán/tặng, thời gian bắt đầu/kết thúc, nguồn giá đã kiểm chứng. Lưu nháp hoặc chọn công bố ngay (cần MFA).
4. **Giá ngoại lệ:** tạo giá riêng cho một hoặc nhiều xã/phường bằng cùng form; không phải nhập lại giá tỉnh. Khi khách chọn xã/phường, giá riêng thắng giá tỉnh.
5. **Sửa giá:** nháp sửa trực tiếp; đã công bố tạo bản thay thế nguyên tử, khóa gói/địa bàn/kỳ thanh toán. Bản cũ kết thúc lúc bản mới bắt đầu. Ngày bắt đầu phải nằm trong khoảng giá cũ; muốn giá ở thời gian/phạm vi khác, dùng Thêm giá mới.
6. **Ngừng:** ngừng cung cấp gói hoặc ngừng áp dụng giá/địa bàn, giữ lịch sử lead/báo giá. Không ngừng tỉnh khi còn xã/phường hoạt động. Không công bố giá có khoảng thời gian trùng với giá cùng gói/địa bàn/kỳ.

Giá mặc định chỉ có hiệu lực trong phạm vi cung cấp của gói. Giá chưa xác nhận hiển thị yêu cầu tư vấn; không lấy giá thấp nhất ở địa bàn khác. Không có sẵn giá thương mại; danh mục hành chính có thể đồng bộ từ API v2, quản trị viên thiết lập phạm vi cung cấp và giá đã kiểm chứng.

## Quy tắc client

- Trang chủ và form tư vấn đồng bộ tỉnh/thành, xã/phường. Đổi tỉnh xóa xã đã chọn và xóa token giá cũ ngay lập tức.
- `region_id` gửi API là UUID xã/phường nếu có chọn, nếu không là UUID tỉnh/thành. Trường `code` trong hierarchy là UUID; `region_code` là mã hành chính do admin nhập, **không** dùng để gọi báo giá.
- Giá theo thứ tự: xã/phường → tỉnh/thành trực thuộc → nhóm giá kế thừa → giá mặc định. Tất cả phải đúng gói, kỳ thanh toán và khoảng hiệu lực `[start,end)`.
- Các phí, VAT, kỳ và tổng trả trước được hiển thị từ quote thật. Không suy ra VAT hoặc miễn phí thiết bị từ nội dung tĩnh.
- Ward được tải khi chọn tỉnh, có cache trong tab, deadline và chống response cũ ghi đè. Không suy đoán vị trí khách bằng IP để tự chọn giá.

## API bổ sung và thay đổi

| API | Ý nghĩa |
|---|---|
| POST/PUT `/api/v1/admin/plans[/{id}?expected_version=n]` | Thêm `applicable_region_ids: UUID[]`, tối đa500, `[]` nghĩa mọi địa bàn |
| POST/PUT `/api/v1/admin/regions[/{id}?expected_version=n]` | Thêm `level: province|ward` (mặc định province), `parent_id: UUID|null`; ward cần parent và cùng branch |
| GET `/api/v1/admin/plans?limit=100&before=UUID` | `{items: resourceDTO[], next_cursor: UUID|null}`, UUID DESC, snapshot published vẫn có trong DTO |
| GET `/api/v1/admin/locations?level=province|ward&parent_id=UUID&limit=100&before=UUID` | Danh mục theo phạm vi tài khoản, gồm nháp/công bố/đã ngừng; trả resourceDTO và next_cursor |
| GET `/api/v1/regions/hierarchy` và `/api/v1/regions` | Chỉ tỉnh/thành đã công bố; lọc tại SQL, không tải hết xã/phường |
| GET `/api/v1/regions/{provinceUUID}/wards?limit=100&before=UUID` | Public `{items: publishedRegionDTO[], next_cursor: UUID|null}`; chỉ ward của tỉnh đã công bố |
| POST `/api/v1/admin/prices/bulk` | `{rows: PriceInput[1..500], publish: bool=false}`. `pricing.write` mỗi phạm vi; khi publish=true thêm `pricing.publish` và AAL2. Nguyên tử, lỗi một dòng rollback cả giá/audit/revision |
| POST `/api/v1/admin/prices/{id}/replace?expected_version=n` | PriceInput, `pricing.write`+`pricing.publish`+AAL2. CAS bản cũ; giữ cùng plan/scope/term; cắt khoảng cũ hoặc ngừng cũ nếu bắt đầu đúng lower; tạo/công bố bản mới nguyên tử |
| GET `/api/v1/admin/prices` | Giữ before UUID; thêm `scope_label` để render/tìm địa bàn mà không cần gọi riêng từng ward |
| POST `/api/v1/quotes` | Nhận region_id là province/ward UUID. Thêm trạng thái `not_available` khi gói không áp dụng; không có quote_token. `confirmed` giữ hợp đồng hiện có và region_id khách chọn |

Phải gọi trang ward tiếp theo đến khi next_cursor=null; không giả định <=100 xã/phường. Public RegionDTO là payload đã công bố + id/version; Admin resourceDTO chứa payload, published_payload, status, version và branch_id. Không spread resourceDTO vào input API: dùng whitelist của PlanInput/RegionInput/PriceInput.

Giá VAT `vat_bps` vẫn là basis points trong API: % hiển thị nhân100 khi gửi (8%→800). Mọi thời gian API là ISO8601 có timezone; form chuyển giờ local qua UTC. `scope_kind=region` dùng chung cho cả tỉnh và xã; không thêm scope_kind=ward. Bản group cũ được giữ loại khi sửa; form chủ yếu thiết lập default/province/ward.

Mã lỗi: PRICE_OVERLAP409, VERSION_CONFLICT409, REGION_HAS_CHILDREN409, IMMUTABLE_SCOPE409, INVALID_PARENT422, INVALID_REGION422, INVALID_PLAN422, INVALID_REPLACEMENT_START422, PERMISSION_DENIED403. CSRF/session cookie và MFA hiện có vẫn áp dụng.

## Database và deploy

Migration mới: `supabase/migrations/20261002030610_hierarchical_regional_pricing.sql`. Áp dụng sau9 migration hiện có, trước khi đưa code mới lên Vercel. Không sửa migration đã triển khai. Migration thêm indexes địa bàn và wrapper RPC, giữ private schema/RLS và function grants chỉ service_role; không có secret mới, không thay cấu hình R2.

Mới kiểm thử trên PostgreSQL local/disposable; không thực hiện thay đổi Supabase/Vercel production trong tác vụ này. Khi triển khai thực tế dùng quy trình staging hiện tại, xem [Supabase database functions](https://supabase.com/docs/guides/database/functions). Changelog chính thức được đọc2026-10-02: [Postgres15.19/17.11 advisory](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) liên quan extension/index của nền tảng; tác vụ này không nâng cấp PostgreSQL.
