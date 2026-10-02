# Ledger — Geography API
- API v2 hiện hành được kiểm tra bằng tài liệu nguồn và HTTP thực. Nested depth2 không có province_code tại ward; lấy cha từ nesting, vẫn reject mã cha sai nếu được cung cấp.
- TDD nguồn: import missing-module RED; validator/HTTP/fallback GREEN. Sync RED vì migration chưa có, GREEN PostgreSQL thật.
- 34 tỉnh/thành +3.321 xã/phường =3.355 resources, không phải3.655. Import toàn bộ khoảng0,476–0,488 giây PostgreSQL local.
- Idempotence giữ UUID/revision; branch conflict rollback cả batch kể cả sau insert tỉnh trước; giữ draft/custom/retired; RLS browser denied; imported ward dùng đúng quote/lead và giữ giá khi sync lại.
- Final reviewer đọc độc lập: P2 request cũ ghi đè dialog mở lại, P3 Đ uppercase không tìm không dấu. Cả hai có RED→GREEN JS regression và đã sửa.
- Ruling: checkbox tất cả gửi province_codes=[] — API mới có thêm tỉnh vẫn được nhập hết; preview checkbox dùng snapshot đóng gói có ngày, chỉ sync gọi nguồn ngoài.
- Ruling: khi live refresh lỗi, giữ snapshot live hợp lệ trong instance nếu có trước khi dùng bundled; trả mode=cached/ngày tải/warning. Có RED→GREEN test; không gọi fallback là dữ liệu mới.
- Singleflight per instance, không claim distributed cache. Nguồn HTTP server-only, không PII; customer selector DB/lazy wards, không chờ provider.
- Không Git repo để commit, không credential Supabase/Vercel cloud hay migration production. Local demo là fixture PostgreSQL/Auth synthetic hiện hành; không gộp/xóa UUID địa bàn nhập tay.

- Bổ sung RED→GREEN identity hydration: mở sync trước workspace ready vẫn tải membership để chọn chi nhánh. Browser smoke mới kiểm tra cách này và Đà Nẵng không dấu.
