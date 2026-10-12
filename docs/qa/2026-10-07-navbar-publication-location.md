# QA navbar, công bố giá và vị trí khi đo mạng

## Các lỗi đã xác định

- Menu doanh nghiệp và liên kết chân trang mở Internet gia đình; đã chuyển đúng trang doanh nghiệp.
- Các mục FPT Play, Camera dùng chung một trang không có nội dung tương ứng; đã có năm trang dịch vụ, nội dung chi tiết và anchor đúng từng mục.
- Trang dịch vụ tự lấy gói đầu tiên; catalog rỗng và CTA chung có thể gửi sai nhu cầu Internet. Nay hiển thị tất cả gói published đúng loại; tư vấn chung không tự chọn gói, CTA của gói giữ ID; CTA chung/mobile/địa bàn giữ loại dịch vụ hiện tại.
- Slug sản phẩm không tồn tại trả Internet 200; nay trả 404.
- Liên kết tải Hi FPT cũ trả 404; thay bằng trang hướng dẫn chính thức `https://hi.fpt.vn/support/tai-khoan/tai-hi-fpt-o-dau`, xác nhận HTTP 200.
- Production có GiGa bản nháp và giá bản nháp liên kết. INVALID_PLAN xuất hiện khi công bố giá trước gói. Owner có TOTP verified (xác minh qua detailed Auth user); không phải chưa có MFA. Giá draft thuộc gói draft có “Công bố gói trước”; lỗi API giữ mã và dẫn sang mục Gói cước. Backend guard/MFA/CAS giữ nguyên. Không công bố dữ liệu kinh doanh production trong lượt kiểm tra.

## Vị trí khi đo mạng

Native Geolocation chỉ khi bấm bắt đầu; đo không đợi cấp quyền. Từ chối/không trả lời/lookup lỗi vẫn có kết quả. BigDataCloud chỉ nhận current-device coordinates trực tiếp từ browser sau đo; fixture intercept, không gửi tọa độ giả ra dịch vụ. Không lưu tọa độ/backend/analytics; chỉ áp dụng tỉnh/xã trong catalog sau khách xác nhận. Callback cấp quyền trễ vẫn hữu ích cho lượt hiện tại. Hủy/đổi lượt/ẩn trang fence dữ liệu cũ và xóa thông báo gợi ý. Disclosure trong trang đo và trang thông tin dữ liệu.

## Kết quả kiểm chứng

- 302 kiểm thử Python đạt trong 75.36 giây; sau thay liên kết/disclosure, 53 kiểm thử giao diện liên quan đạt trong 13.35 giây.
- 14 tệp contract JavaScript đạt, gồm 7 ca speed model và 3 ca lifecycle vị trí; quote, phiên, địa bàn và các contract admin hiện có.
- Navbar: 22 đường dẫn nội bộ, 40 kiểm tra viewport trên 8 trang ở 360/390/768/1024/1440; không tràn ngang, không trường thiếu nhãn hoặc lỗi JavaScript. Kiểm tra click desktop/mobile, đúng loại dịch vụ/ID gói, đổi xã cập nhật giá; ảnh trang và 5 form mobile được xem trực quan. Smart Home/FAQ mở đúng section trang chủ.
- Vị trí: Chrome native granted, denied, permission pending và reverse-lookup failed đều đo hoàn tất; gợi ý cần xác nhận, quote dùng xã đã chọn; không request geocode khi đang đo.
- Hồi quy speedtest: SDK Cloudflare thực với fixture ở chế độ giảm chuyển động và animation bình thường; phase/mẫu/graph, giá, CTA, hủy/retry/error/stale/hidden/history, responsive đều đạt. Hồi quy navbar/focus/keyboard/drawer/dialog đạt.
- Công bố giá: luồng browser + SQL cô lập tái hiện INVALID_PLAN, hướng dẫn công bố gói rồi giá, quote xác nhận; chỉ dữ liệu tổng hợp.
- Ruff, mypy (95 source files), kiểm tra kiến trúc và git diff whitespace đạt.
- Review độc lập phát hiện CTA mobile sai loại; đã sửa và test. Lượt review cuối xác nhận các finding đã xử lý, không thấy regression đáng kể trong phạm vi.

Bằng chứng cục bộ: `.local/qa/navbar-pages/report.json` và ảnh; `navbar-location-pytest.txt`, `navbar-final-ui-pytest.txt`, `navbar-location-contracts.txt`, `speed-location-browser-green.txt`, `speed-location-lifecycle-green.txt`, `catalog-publish-green.txt`, `navbar-location-speed-reduced.txt`, `navbar-location-speed-motion.txt`, `navbar-location-navigation.txt`.

## Triển khai

Đã tạo candidate Vercel `dpl_62Yv1VJzAkoEpWRrVsUdjJCGeGyT` (`fpt-p3t3zlikz-pettravel.vercel.app`) READY. 35 kiểm tra candidate đạt: trang dịch vụ, speedtest, SHA256 assets, API công khai, guest Admin bị chặn đúng quyền. Promote thành công lên `fpt-vungtau.com`. Lần đầu CLI trả `Not authorized`; sau xác minh đúng phiên owner, lần retry được chấp nhận. Không cần yêu cầu người dùng cấp lại quyền; không kết luận khóa hết hạn chỉ từ thông báo lỗi. Manifest dry-run có 193 file runtime, không chứa env, secrets, `.local`, tests, docs hoặc operator tools. Không thay schema hoặc công bố dữ liệu kinh doanh.

Kiểm tra tên miền sau promote: 37 HTTP/auth/asset SHA256 kiểm tra đạt; inspect xác nhận đúng deployment READY. Chrome live kiểm tra 22 đường dẫn navbar, 10 viewport của năm trang dịch vụ và CTA chung/mobile đúng loại, không lỗi JavaScript. Một lượt Cloudflare thực trên kết nối máy phát triển hoàn tất dù quyền vị trí native bị từ chối: 46 request, không có reverse-geocode; không phải kết quả mạng người dùng. Screenshot live trong `.local/qa/navbar-live/`. Lượt live harness đầu gọi thừa APIRequestContext GET sau điều hướng cùng trang bằng hash bị timeout; kiểm tra độc lập trang HTTP 200 (0.657 giây), harness dùng lại status của document đã tải cho điều hướng hash; lần cuối toàn bộ đạt.
