# QA công cụ đo tốc độ

Kiểm tra bằng Chrome với SDK Cloudflare thật; network fixture tạo phản hồi đo/metadata có kiểm soát. Fixture SQL chỉ chứa gói tổng hợp, không ghi khách hàng production.

## Các lỗi được tái hiện và sửa

1. Giá trả trước có `monthly_vnd=null`: trước đây chỉ hiện cần tư vấn; red → green với tổng trả trước và VAT/kỳ.
2. Tiêu đề portal chồng menu desktop: kiểm tra vùng chữ bằng Range, ẩn tiêu đề phụ ở header.
3. Đổi tỉnh khi phép đo đang chạy còn gói/giá tỉnh cũ: browser red → green; luôn render phạm vi mới, chỉ hoãn request giá.
4. Vạch số dial không khớp thang log: browser kiểm tra tọa độ sáu vạch red → green; kim/vạch dùng chung hàm gauge.
5. SDK trả median 0 cho bucket rỗng: dùng actual vendor SDK với request nhanh 100 ms và bucket ping rỗng, red → green; presentation kiểm tra số mẫu hợp lệ cho latency/jitter, vẫn giữ zero thực khi có mẫu.

6. Khôi phục trang từ lịch sử trình duyệt còn trạng thái đang đo: browser pagehide/pageshow red → green; lưu trạng thái đã dừng và làm mới quote khi trang được khôi phục.

Review độc lập phát hiện mục 3–5; đã xác minh và sửa bằng kiểm thử. Lượt reviewer tiếp theo không chạy được do giới hạn sử dụng; kết luận cuối dựa trên đọc mã và kết quả kiểm tra trực tiếp.

## Phạm vi kiểm chứng

- Python: 295 test đạt (74.80 giây); SSR route, navbar, gói công khai, escaping, quyền hiện có.
- JavaScript: toàn bộ 13 tệp contract đạt (19 node test cases và các assertion riêng); riêng speedtest sáu test, gồm cấu hình tải, actual SDK empty bucket, units/null, phạm vi/thứ tự gói, gauge và metadata.
- Browser: không tự đo/tải SDK; phase, mẫu/graph/kết quả, metadata không chạy HTML, quote xã, trả trước, CTA đúng gói; dừng/retry/lỗi/response trễ/ẩn tab và pagehide/pageshow phục hồi lịch sử; không lỗi JavaScript.
- Responsive 360/390/768/1024/1440; kiểm tra overflow và overlap; reduced-motion và animation bình thường. Navbar desktop/mobile, bàn phím/focus/Escape được kiểm tra hồi quy.
- Một lượt Cloudflare thực đã hoàn tất trên máy phát triển: 56.4 MB payload hoàn tất, 44 request, không lỗi; đây là kết nối máy phát triển, không phải kết quả mạng khách hàng.
- Ruff, format, mypy, kiểm tra kiến trúc và whitespace diff.

Log cục bộ không triển khai: `.local/qa/speed-python-final.txt`, `speed-contracts-final.txt`, `speed-final-reduce.txt`, `speed-final-motion.txt`, `speed-navigation-final.txt`, `speed-live.txt`; ảnh và kết quả fixture trong `.local/qa/speedtest/`. Không lưu IP thực vào kết quả QA.

## Release

Đã triển khai production Vercel `pettravel/fpt-web`, deployment `dpl_4uwXnMfmk7kGcYu2ePpBdxjL8hK3` (`fpt-6xnlvo400-pettravel.vercel.app`), READY; promote thành công, tên miền chính inspect xác nhận đúng deployment.

- Manifest: 190 regular files, không secrets/local tools/tests/docs/migrations.
- Candidate: 23 kiểm tra HTTP/auth/assets đạt; SHA256 tài nguyên khớp source.
- Live `https://fpt-vungtau.com`: 25 kiểm tra đạt, gồm redirect www và các trang/API bảo vệ quyền.
- Chrome trên tên miền chính: một lượt Cloudflare thực hoàn tất, 46 request, 56.4 MB payload; đủ download/upload/ping/jitter/loaded ping, không lỗi JS. Không lưu IP thực hoặc ghi form khách hàng.
- Không thay schema/env Supabase/R2. Log deploy và kiểm tra trong `.local/deploy-cli/*speedtest*`; kết quả browser production `.local/qa/speedtest/live-domain-cloudflare.json`.
- Thông báo CLI không truy vấn được npm dist-tags là lỗi kiểm tra phiên bản CLI, không phải lỗi promote: exit 0, Success, inspect/live checks đều xác nhận bản đã lên.
