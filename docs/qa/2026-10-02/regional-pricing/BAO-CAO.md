# Kiểm chứng gói cước và giá theo địa bàn — 2026-10-02

Môi trường: FastAPI thật, SQL migration thật trên PostgreSQL disposable, Chrome desktop/mobile. Supabase Auth HTTP mô phỏng bằng tài khoản/OTP QA. Không có dữ liệu khách hàng thật hoặc thay đổi cloud. Không dùng bản ghi địa lý/giá thử làm dữ liệu thương mại.

| Kiểm tra | Kết quả / bằng chứng |
|---|---|
| Pytest toàn bộ | **161 passed**, [pytest.log](pytest.log) |
| Browser baseline | **31/31**, **48** kiểm tra viewport, [baseline-browser.json](baseline-browser.json) |
| Browser tính năng mới | **11/11**, không page errors; modal360/390/768/1440px, input>=44px và16px, [browser.json](browser.json) |
| Diagnostics | **7/7**, [diagnostics.json](diagnostics.json) |
| JS contracts | 8 script chạy thành công, gồm6 baseline và2 script địa bàn mới (script review có2 cases). Kiểm tra đổi tỉnh nhanh, cache, ward response cũ, giá/token, retry, analytics consent, carousel, quiz, session timeout |
| Ruff / format | Đạt, [ruff.log](ruff.log), [format.log](format.log) |
| Mypy / layering | **86** source files đạt, [mypy.log](mypy.log), [architecture.log](architecture.log) |
| Build + isolated wheel | Đạt, [build.log](build.log), [wheel.log](wheel.log) |
| Frontend contract | **135** operations/**53** schemas; OpenAPI, source references và phụ lục prompt khớp |

Các trường hợp mới: ward→province→group→default, VAT không cộng hai lần, khuyến mãi tỉnh kế thừa, applicability, parent/cùng branch, public không lộ draft ward, không ngừng tỉnh có con; bulk lỗi rollback cả giá/audit/revision, published replacement CAS/overlap rollback giữ lịch sử; MFA và scope,121 ward qua nhiều trang, thứ tự cursor bảng giá có tên; lead lưu snapshot với UUID ward và giá chính xác.

Review độc lập chỉ đọc phát hiện scope draft, cache tên ward, dropdown landing khóa sau submit, eager catalog và thứ tự aggregate ảnh hưởng cursor. Đã sửa và kiểm chứng. Các lỗi cache/disabled/ward controls/public province-only/scope label đã quan sát RED trước khi sửa và GREEN sau sửa.

Giao diện dùng native dialog (Escape/focus), label, lỗi trong form, tìm tên + checkbox, nguồn giá trống để nhập căn cứ. Đã xem ảnh thực tế desktop/mobile; toast admin được đưa ra khỏi flex layout. Ảnh trong cùng thư mục là dữ liệu QA.

Sử dụng: xem [GIA-THEO-DIA-BAN.md](../../../frontend/GIA-THEO-DIA-BAN.md). Migration mới `20261002030610_hierarchical_regional_pricing.sql` phải chạy trước code mới khi triển khai Supabase/Vercel. Trạng thái hiện tại là triển khai local; chưa xác nhận Supabase/Vercel production.
