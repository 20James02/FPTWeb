# Kiểm chứng ảnh link voucher và hoàn thiện đo lường

Ngày: 16/10/2026. Tích hợp trên main71de7d1, giữ các thay đổi bảng giá, sắp xếp gói và mobile mới nhất. Kiến trúc FastAPI/Jinja2 giữ nguyên.

## Phạm vi đã thực hiện

- Mỗi link voucher có ảnh preview riêng: tải ảnh bằng luồng media/R2 hiện có, dán URL công khai, xem trước và trở về ảnh mặc định. Tạo link đầu tiên có tự lưu voucher vẫn giữ ảnh; lỗi lưu link giữ ảnh/mã đường dẫn để thử lại. Sửa ảnh không bật lại link đang tắt; client cũ bỏ trường ảnh không xóa ảnh hiện có.
- Crawler nhận HTML Open Graph/Twitter render phía server; khách vẫn được chuyển tới trang đích và luồng ưu đãi hiện có. Không đưa nội dung voucher bản nháp vào metadata; không tạo cookie khách cho crawler. Click bot tách khỏi click khách. Response thay đổi theo User-Agent và không cache dùng chung.
- Sửa thẻ voucher có chiều rộng tối thiểu lớn hơn màn hình, fieldset/băng trạng thái tràn ngang; nút thao tác hiện trực tiếp trên màn hình cảm ứng.
- GA4 nhận receipt ngay cả khi cấu hình được khởi tạo trong lúc phát receipt; dùng chung cơ chế chống gửi trùng.
- Luồng chuyển đổi cũ cũng kiểm tra riêng analytics/marketing/advertising, retention và quyền trên dữ liệu hiện tại. Luồng chuyển đổi mới khóa session trước delivery, cùng thứ tự với xóa dữ liệu; kiểm tra lại quyền trước chuẩn bị gửi. Không giữ transaction DB qua HTTP tới nhà cung cấp.
- Sửa API danh sách tác vụ đồng bộ bị SQL `state` trùng tên biến OAuth. Màn hình browser kiểm tra cả lỗi HTTP API, không chỉ lỗi JavaScript.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Toàn bộ Python/SQL integration, `python -m pytest -q` | 612 passed, 237.24s |
| JavaScript contracts, `tools/run_js_contracts.py` | 31/31 nhóm passed |
| Ruff | Passed |
| Mypy | 126 source files, không lỗi |
| Kiến trúc import | 126 source files, passed |
| API contract | 266 operations,124 schemas; cập nhật schema ảnh trong voucher handoff |
| Chrome: Trung tâm đo lường | Tạo/sửa, mô phỏng/công bố/khôi phục, chi phí/báo cáo, dừng hàng loạt;360/390/430/1440px, không lỗi page/API |
| Chrome: ảnh voucher | Lưu/sửa/bỏ ảnh, giữ khi bật/tắt, tự lưu voucher đầu tiên,503 rồi thử lại;320/390/430/1440px không tràn ngang/lỗi page |
| Chrome: GA4 |9trang client, loại Admin, receipt thật trong fixture,1conversion; chặn transport ra ngoài |
| Supabase |4migration mới được áp dụng kèm lịch sử giao dịch;30định nghĩa hàm khớp fixture; ACL/RLS passed |
| Gói triển khai Vercel | FastAPI,298files, không chứa.env/.local/.venv hoặc khóa |

Các ca RED/GREEN đã tái hiện: thiếu trường ảnh; mất ảnh khi tự lưu bản nháp; mất ảnh sau lỗi lưu link đầu tiên; API sync-list500; chuyển đổi đọc quyền cũ khi thu hồi đồng thời; xóa lead bị chặn tại cascade delivery. Ca khóa riêng dùng hai kết nối PostgreSQL thật và chờ trạng thái Lock, không suy ra từ mock.

## Hạ tầng và giới hạn xác nhận

Migrations bổ sung, không sửa lịch sử đã áp dụng:

- 20261016020129: quyền/retention của luồng cũ và kiểm tra đồng thời của luồng mới.
- 20261016020644: ảnh preview link voucher và metadata công khai.
- 20261016021145: sửa tên cột truy vấn danh sách đồng bộ.
- 20261016023218: thứ tự khóa gửi chuyển đổi/xóa dữ liệu.

Hồ sơ thực thi gồm kết quả đầy đủ, bản ghi apply migration và smoke deployment trong `.local/qa/admin-measurement-20261015/` của worktree kiểm chứng. Candidate đã build và qua13kiểm tra route/tài nguyên cùng metadata crawler của một link đang tồn tại. Trạng thái chuyển tên miền và Git được xác nhận riêng sau bước phát hành.

Provider/API dùng HTTP giả lập với dữ liệu tổng hợp; không tạo form giả, không gửi OTP/Telegram/conversion vào tài khoản thật. Việc đọc tài khoản/quyền gửi conversion thực tế còn phụ thuộc bộ khóa, OAuth, scope và thiết lập nền tảng trong Admin. Không có benchmark triệu lead hoặc bằng chứng rằng GA4/Ads/Meta đã phân bổ chuyển đổi chỉ từ kiểm thử local. Cache/cách cắt ảnh của mạng xã hội do nền tảng quyết định.

Hướng dẫn: `docs/operations/ANH-PREVIEW-LINK-VOUCHER.md` và `docs/operations/TRUNG-TAM-DO-LUONG.md`.
