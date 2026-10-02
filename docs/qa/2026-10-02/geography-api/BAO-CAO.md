# Kiểm chứng API danh mục hành chính — 02/10/2026

Đã nối Province Open API v2 tới admin đồng bộ và danh mục client. Đã gọi API live, source.mode=live, checksum trùng bản dự phòng; database local có34 tỉnh/thành và3.321 xã/phường nguồn v2, ngoài địa bàn synthetic của fixture. Không thay Supabase/Vercel production.

- Python: **174 passed**, 33,82s (pytest.log). Gồm validation/timeout/oversize/fallback/singleflight/giữ cache hợp lệ; permission/MFA/RLS; rollback; giữ custom/draft/retired; idempotence; ward-price-quote-lead sau resync.
- Browser hiện có: **31/31** luồng, **48** checks layout; giá theo địa bàn **11/11** luồng (fixtures giá/lead synthetic).
- Browser mới: checkbox/tìm không dấu → nhập Hanoi126wards; nhập toàn bộ34/3321; client lazy paginate chọn ward, đồng bộ form và khôi phục reload; gọi sync live200/mode=live. Không uncaught JS. **4 viewport**360/390/768/1440, input44px và font16px, dialog không tràn ngang (browser.json/log, ảnh admin/client-mobile).
- Review độc lập đã sửa stale preview và uppercase Đ; JS regression RED→GREEN. Bổ sung độc lập tải identity khi mở dialog trước workspace hydration; browser smoke và JS regression.
- 9 file JS contracts đạt. Ruff/format, mypy88 nguồn, architecture88 nguồn đạt. Wheel build và isolated smoke xác nhận snapshotJSON/templates/static trùng nguồn.
- Route/OpenAPI:137 operation,54 schemas; inventory nguồn và quyền geography khớp; xem docs/frontend/verification-contract.json.

Độ trễ nhập snapshot3.355 resources đo ở PostgreSQL local khoảng0,48s, không phải benchmark cloud. SourceHTTP bounded, không trên luồng khách. Server local8000 giữ chạy, dữ liệu Auth/plan/lead là QA synthetic, geography là nguồn API thực. Giá thương mại chưa tự tạo.
