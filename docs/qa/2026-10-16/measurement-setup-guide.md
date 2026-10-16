# Hướng dẫn thiết lập Trung tâm đo lường & Ads

Ngày: 16/10/2026. Baseline: `2df4b5ae6edfb637f3b3f5d29704c7c5bd7b5e70`.

## Phạm vi

- Thêm nút Hướng dẫn thiết lập, tab Hướng dẫn và 7 phần mở/thu gọn trên `/admin/measurement`: bắt đầu, GA4, Google Ads, Meta, chiến dịch/UTM, kiểm tra và gỡ lỗi.
- Thêm giải thích tại từng ô ID và trợ giúp bộ khóa theo provider. Callback OAuth lấy từ public origin server; chuỗi Meta `{{campaign.id}}` giữ nguyên khi Jinja render.
- Nút trong hướng dẫn chỉ chuyển panel/focus; không tạo kết nối, lưu khóa, công bố, cấp quyền hoặc ghi lên nền tảng.
- Dùng HTML details/summary, CSS hiện có và JS nhẹ. Đồng bộ token màu sáng/tối của màn hình đo lường với hệ thống Admin.
- Không sửa schema, hợp đồng API, xử lý lead, giá, card gói cước hoặc chính sách consent.

## Kiểm chứng

- **26/26** kiểm thử Python thuộc Admin UI, registry và releases thành công.
- Browser hồi quy của Trung tâm đo lường thành công: thêm kết nối/cấu hình, mô phỏng, công bố/khôi phục, nhập chi phí/báo cáo, thao tác hàng loạt, 4 viewport.
- Browser kiểm tra hướng dẫn: mở từng chủ đề, chuyển đúng panel, focus đúng summary/heading, Enter đóng/mở, mô tả trường theo provider, callback và Meta macro đúng. **5 độ rộng** 360/390/430/768/1440, **2 theme** sáng/tối không tràn ngang; summary đạt chiều cao thao tác ít nhất 44px. Không có lỗi JavaScript, không phát sinh request ghi từ thao tác xem hướng dẫn.
- Đã xem screenshot mobile sáng và desktop tối. Screenshot/evidence tại `.local/qa/measurement-guide-20261016/`.
- Kiểm tra callback bằng OAuth start thực trong fixture với origin trống, origin thường và có dấu `/` cuối; URI hiển thị khớp URI backend. Review độc lập phát hiện trường hợp này, đã sửa và được review lại.
- Ruff, Node syntax check và `git diff --check` thành công.

## Kết quả kiểm thử rộng hơn cần lưu ý

**30/31** nhóm JavaScript contract thành công. `speed_cards_details.mjs` đang mong dòng “Tổng thanh toán ban đầu” trong popup gói, nhưng source đã commit hiện tại không còn dòng này. Chạy riêng hai file từ **HEAD không chỉnh sửa** trong thư mục tạm tái hiện cùng lỗi; không phát sinh từ phần hướng dẫn. Giữ nguyên source/thay đổi thẻ gói do người dùng đã thực hiện, không sửa kỳ vọng test để che lỗi.

Không gọi API quảng cáo thật, không gửi conversion hoặc lead giả tới production. Thử trình duyệt dùng SQL/cookie fixture nội bộ và chặn transport bên ngoài. Việc bổ sung hướng dẫn không chứng minh tài khoản GA4/Ads/Meta đã nhận dữ liệu thật.

## Đối chiếu nội dung

Hướng dẫn dựa trên schema, provider connector, OAuth callback và chức năng Admin hiện có. Đã đối chiếu tài liệu chính thức Google về Measurement ID, DebugView, liên kết GA4–Ads, nhập key events, conversion tag, auto-tagging và URL suffix/ValueTrack. Tài liệu Meta có liên kết trong hướng dẫn để người vận hành kiểm tra quyền/API version; máy đọc tài liệu hiện không truy cập được nội dung hai trang Meta, nên không cố định phiên bản API hoặc khẳng định tên menu áp dụng cho mọi tài khoản.
