# Voucher preview sau chuyển hướng và môi trường GA4

Ngày kiểm tra: 16/10/2026.

## Nguyên nhân xác minh được

- Link `days9999` đã lưu đúng ảnh R2 và ảnh truy cập công khai thành công. Crawler có User-Agent được nhận diện nhận đúng Open Graph tại link ngắn, nhưng crawler chung/Zalo theo HTTP 302 tới trang đích chưa có metadata của voucher.
- Vercel Production đặt `PAGEFPT_ENVIRONMENT=staging`, trong khi bản cấu hình GA4 đã công bố thuộc `production`. Endpoint cấu hình trả HTTP 200 nhưng không có measurement ID/release khả dụng.

## Thay đổi

- Render Open Graph/Twitter trên đúng trang đích có `pf_offer` của link đang bật; giữ chuyển hướng, cookie, popup và form hiện có. Không ghi thêm click/session trong thao tác đọc metadata.
- RPC metadata chỉ cấp quyền service role, chỉ dùng nội dung voucher đã công bố trong thời gian hiệu lực. Không đưa bản nháp hoặc ghi chú nội bộ ra client.
- Kiểm tra slug, trang đích và đường dẫn riêng tư; timeout 1,5 giây. Lỗi metadata không chặn trang hoặc form. HTML có metadata dùng `private, no-store`.
- Áp dụng migration `20261016030359_voucher_redirect_preview_metadata` vào Supabase và ghi nhận lịch sử migration.
- Sửa riêng biến môi trường Production của Vercel thành `production`; không đổi kết nối Supabase/R2 hoặc secrets.

## Kiểm chứng trước phát hành

- Ca hồi quy mới thất bại trước bản sửa vì thiếu `og:image`, sau sửa thành công.
- Python: **615 passed**, 248,96 giây; nhóm kiểm tra tập trung: **18 passed**.
- JavaScript: **31/31** nhóm contract thành công.
- Trình duyệt Chromium, User-Agent Zalo: redirect, ảnh OG/Twitter, cookie, popup ưu đãi và voucher trong form thành công.
- Kiểm tra Analytics trên 9 route client: loại trừ Admin, một conversion theo biên nhận lead của fixture, không gửi transport ra nền tảng quảng cáo khi QA.
- Ruff, mypy (126 file), architecture boundaries (126 module), `git diff --check` thành công.
- Bản Vercel thử `https://fpt-3gwsjjmc9-pettravel.vercel.app`: cấu hình tải đúng `G-D0J0XLJ891` và release; trang đích trả đúng ảnh đã lưu với UA Zalo; cache/form/popup/health và bảo vệ Admin thành công.
- Review độc lập chỉ đọc: không phát hiện vấn đề quan trọng.

## Phạm vi kết luận

Mã tích hợp và cấu hình GA4 trên website đã được kiểm chứng. Chưa có bằng chứng GA4 nhận sự kiện thực tế trong tài khoản; không coi phép thử chặn transport là xác nhận phía Google. Google Ads/Meta chưa có kết nối tài khoản thực tế được xác nhận; không báo hoàn tất hai tích hợp này.

Ứng dụng chia sẻ có thể giữ preview cũ riêng. HTML hiện tại đúng ảnh không đảm bảo tin nhắn đã gửi tự thay thumbnail.
