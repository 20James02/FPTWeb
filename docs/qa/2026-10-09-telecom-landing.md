# QA landing telecom — 09/10/2026

Phạm vi: mẫu landing xanh/cam theo hai ảnh người dùng, editor riêng trong Admin, nội dung/ảnh có cấu hình, bố cục 3/6/9 gói, giá vùng/kỳ/phụ kiện và form hiện có. Python/FastAPI/Jinja2 được giữ nguyên. Không dùng giá, hotline, số khách hoặc đánh giá minh họa làm dữ liệu production.

## Kết quả kiểm tra

- Pytest toàn dự án: **348 passed, 94.28 s** (`.local/qa/landing-full-final.log`). Chín trường hợp landing kiểm tra tạo/lưu/công bố/xem trước, không ghi database khi preview, tương thích CMS cũ, chọn đúng ba gói, HTML/URL/media không hợp lệ và quyền truy cập.
- **17 file contract JavaScript đạt**, gồm term không mất khi không lấy được báo giá, preview không gửi lead và dừng hàng đợi quote khi rời trang. Rerun log `.local/qa/landing-js-contracts.log`. Hồi quy `card_periods.cjs` đạt cả 9 nhóm kiểm tra trên catalog đã chứa hơn 24 gói QA.
- Ruff đạt; mypy và kiểm tra kiến trúc đạt cho **100 file Python**.
- Chromium và WebKit: **15 nhóm kiểm tra đạt**: bản đang nhập khác bản đã lưu; lưu/công bố; chuyển form; giá địa bàn; popup mô tả; 3/6/9 thẻ; 320/390/430/768/940/1440 không tràn ngang; kích thước thẻ bằng nhau; menu mobile/tablet; preview không gửi; kỳ mặc định 12 và đổi 1/6/12; phụ kiện và lead thực trong database giả; cách ly upload cũ; giữ thay đổi nhập thêm khi phản hồi lưu chưa về; dãy chấm chuyển gói dài vẫn nằm trong màn hình mobile. Luồng tải ảnh trực tiếp và lưu UUID media cũng được kiểm chứng.
- Reviewer độc lập xác nhận cookie preview thiếu CSRF hoặc Origin không tin cậy trả 403, yêu cầu hợp lệ trả 200. Không còn phát hiện P0/P1/P2 chưa xử lý trong phạm vi review.

Lỗi được tái hiện rồi xử lý: upload trang cũ chặn lưu trang mới; phiên lưu trả về làm mất cờ thay đổi mới; menu bị ẩn ở tablet; kỳ thanh toán bị mất khi không có quote; hàng đợi quote tiếp tục trong document đang rời trang và dãy chấm carousel tràn ngang khi có nhiều gói. Quote cũ được hủy khi rời trang hoặc đổi địa bàn; timeout mỗi request giữ mức 3 giây. Kiểm tra bố cục WebKit chờ network idle trước khi đổi trang để không coi log transport lúc đóng document là lỗi JavaScript của UI. Dữ liệu test ở server loopback 8098 và database riêng; không gửi lead kiểm thử vào production.

Ảnh đối chiếu tại `.local/qa/landing/`: `chromium-390.png`, `chromium-940.png`, `chromium-1440.png`, `chromium-admin.png` và các bản `webkit-*`. Nền decor được tạo bằng imagegen: phòng khách, router và TV bên phải, nền xanh/cyan và khoảng trống bên trái, không chữ/logo/người. Asset `/static/images/landing-hero.webp` khoảng 161 KB, có thể thay bằng ảnh riêng trong Admin. Hai ảnh mẫu quyết định bố cục/màu sắc; chưa có bộ ảnh gốc để khẳng định trùng tuyệt đối từng pixel.

## Triển khai

Đã đối chiếu tài liệu chính thức [FastAPI trên Vercel](https://vercel.com/docs/frameworks/backend/fastapi), [deploy CLI](https://vercel.com/docs/cli/deploy), [promote CLI](https://vercel.com/docs/cli/promote). Upload bình thường, không archive; dry inventory **236 mục, 2.41 MB**, kiểm tra cả mục dung lượng 0 và đường dẫn riêng tư. `.local`, `.env*`, `.venv`, `.git`, test, docs và Supabase migrations không nằm trong upload.

Candidate cuối: `dpl_GcJ1jpUWZxFKtr8k4NJUdzRNkfjy`, `https://fpt-ohti9xxx4-pettravel.vercel.app`, trạng thái READY, **63 kiểm tra cloud đạt**, gồm byte hash JS/CSS/WebP mới, route Admin bị chặn với guest và preview POST guest trả 401. Bản thử trước chưa promote. **Đã promote** vào `https://fpt-vungtau.com`; inspect tên miền xác nhận đúng deployment READY. **65 kiểm tra live đạt**, gồm hash asset khớp source và các route hiện có hoạt động. Log `.local/deploy-cli/cloud-smoke-landing.json`, `.local/deploy-cli/cloud-live-landing.json`. Không tạo trang/gói/lead minh họa trên production.
