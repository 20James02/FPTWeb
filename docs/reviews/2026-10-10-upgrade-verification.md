# Kiểm chứng nâng cấp và thẻ sản phẩm — 10/10/2026

Mã nguồn đã cập nhật, chưa phát hành production. Số liệu kiểm thử chi tiết nằm trong `2026-10-10-upgrade-verification.json`.

## Thẻ theo ảnh mẫu mới

Trang chủ, khối bảng giá CMS và landing telecom dùng chung template `published_plan_cards.html` và stylesheet `client-plan-reference.css`. Thẻ chuẩn rộng 330px, cao 650px; ở màn hình nhỏ giới hạn chiều ngang theo viewport. Ảnh cao 238px sát viền, bo góc 14px, nền trắng, tên 20px, giá xanh 24px. Tiếp theo là khung Download/Upload, danh sách thiết bị và phụ kiện cuộn bên trong, hai nút đăng ký và chi tiết ở đáy thẻ. Các gói có tên và nội dung dài vẫn giữ chiều cao thẻ.

Kỳ 1/6/12 tháng và checkbox phụ kiện vẫn cập nhật giá tức thời, kiểm tra lại báo giá khi đăng ký. Nút thông tin cạnh giá mở popup có giá, kỳ, VAT và mô tả. Nhãn và ảnh dùng dữ liệu Admin; để trống “Nhãn nổi” nếu muốn bỏ badge như ảnh mẫu. Không sao chép giá hoặc khẳng định ưu đãi từ ảnh mẫu vào dữ liệu thật.

Admin → Gói cước có trường Upload (Mbps) tùy chọn. API PlanInput và danh mục công bố lưu `upload_speed_mbps` cùng payload JSON, không cần migration riêng cho trường này. Gói cũ chưa nhập Upload hiển thị “Chưa cập nhật”; không tự suy ra bằng Download. Popup chi tiết hiển thị cả hai tốc độ. Mẫu đã được kiểm tra ở 320/390/430/768/960/1440px trên trang chủ và landing, với đúng ba gói, tên dài, 20 mục thiết bị, Upload thiếu và phụ kiện tính theo tháng. Trang đo tốc độ vẫn dùng component đề xuất riêng hiện có.

Ảnh kiểm tra dùng media giả, không phải ảnh đang lưu trên R2 production:

- `.local/qa/reference-cards/home-card.png`
- `.local/qa/reference-cards/landing-card.png`
- `.local/qa/reference-cards/home-1440.png`
- `.local/qa/reference-cards/landing-1440.png`

## Các nâng cấp từ kế hoạch kiểm toán

Migration mới `20261010060000_audit_scaling.sql` chia truy vấn theo quyền global, branch và assigned, vẫn kiểm tra quyền từng lead và khử trùng. Benchmark disposable SQL với một triệu lead: median branch 3,9605ms, global 3,398ms, assigned 3,434ms (10 mẫu/scope, 31 hàng/trang). Kết quả là RPC trong PostgreSQL local, không bao gồm mạng và Supabase production. Baseline 100.000 lead ở bản cũ có median 4.807,687ms; sau sửa cùng probe median 4,029ms.

Scheduler tiến qua các batch, ghi checkpoint đúng deadline, dùng khóa để không cảnh báo trùng khi các tick cạnh tranh. Chu kỳ đổi deadline được đánh giá lại. Backfill chỉ nhận audit có due_at khớp; audit cũ thiếu due_at được giữ lại, có thể phát sinh thêm một audit khi đánh giá chu kỳ hiện tại lần đầu.

Workplace Admin có bốn nhóm theo quyền, liên kết bộ lọc, hành động tiếp theo và refresh tích hợp polling có retry. Risk thiếu bằng chứng hiển thị chưa có đánh giá, tín hiệu intake được ghi nguồn. NLP giữ các phủ định, giả định, câu hỏi và mâu thuẫn ở trạng thái cần nhân viên kiểm tra. Nhóm workbench overdue có cả unreachable; báo cáo cohort cũ giữ định nghĩa ba trạng thái. Các con số trên nhóm workbench là lượng đang hiển thị có giới hạn, không phải tổng lead.

GA4 theo dõi impression/click chung của thẻ, placement và measurement_mode; giữ cơ chế consent, chống đếm trùng và loại PII. Sau đồng ý, thẻ đang thấy có thể có impression được gán danh mục thay vì bị impression hạn chế trước đó chặn. Cấu hình thuộc tính GA4/Ads từ xa chưa áp dụng.

## Kết quả kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Python/SQL/API | 399 passed, 137,16 giây |
| JavaScript contracts | 25/25 passed |
| Ruff check / format | Passed |
| mypy / architecture | 101 source files passed |
| Wheel | Build, đối chiếu toàn bộ package, import/static/health smoke passed |
| Chromium Admin | Đăng nhập + MFA fixture, gửi lead vào SQL, workbench → hồ sơ, deep-link, 12 viewport, biểu đồ và refresh passed |
| Chromium thẻ | Upload qua Admin, giá kỳ, checkbox, popup, form báo giá, 12 viewport passed; không pageerror |

Các dịch vụ Auth/media bên ngoài được mô phỏng; dữ liệu và PostgreSQL dùng fixture tạm. Kiểm tra mobile là viewport Chromium, chưa phải Safari trên thiết bị thật. Workflow CI đã cấu hình các kiểm tra này; chưa có kết quả chạy GitHub Actions cho lần thay đổi này.

Reviewer độc lập tìm 4 lỗi Important; đều đã sửa và có regression xác nhận. Một Minor được ghi lại: biểu đồ khởi tạo trong dashboard disclosure đóng dùng chiều rộng dự phòng, cần resize để vẽ lại đúng chiều rộng sau mở. Trang báo cáo riêng không dùng disclosure này. ML hiệu chỉnh, tích hợp GA4/Ads từ xa và SLO production chưa thuộc kết quả hoàn thành.

## Phát hành khi triển khai đợt này

1. Rà diff hiện hành, tách thay đổi trước đó không liên quan; không commit tất cả workspace đang có thay đổi.
2. Chạy migration mới trên staging đã sao lưu, kiểm tra grants/RLS và chu kỳ SLA cũ trước production. Index tạo trong transaction có thể giữ khóa; lên lịch phù hợp nếu bảng thật lớn. Hướng dẫn chính thức về [index PostgreSQL trên Supabase](https://supabase.com/docs/guides/database/postgres/indexes).
3. Triển khai cùng backend/templates/static lên preview; kiểm tra owner/staff, thẻ với ảnh R2 thật, đổi kỳ, phụ kiện và form lead. Thử iPhone Safari thực tế và consent cookie.
4. Theo dõi SQL plan, latency HTTP, retry queue và audit SLA trước khi chuyển traffic production. Kiểm tra thuộc tính placement/measurement_mode trong GA4 theo tài liệu cấu hình đã lưu; cấu hình từ xa không tự được tạo bởi JavaScript.

Các kiểm tra local có thể chạy lại bằng `.venv/bin/python -m pytest -q`, `tools/run_js_contracts.py` và `tools/run_browser_smoke.py`. Runner browser hỗ trợ `PAGEFPT_QA_SCRIPT=tests/e2e/reference_cards.cjs`, `PAGEFPT_NODE_BINARY`, `PAGEFPT_CHROME_BINARY` và `NODE_PATH` theo runtime máy; dùng database disposable, không trỏ PAGEFPT_TEST_DSN vào dữ liệu khách.
