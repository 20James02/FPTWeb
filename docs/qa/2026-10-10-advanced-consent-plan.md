# Consent Mode nâng cao

Phạm vi được yêu cầu: đo lường hạn chế trước lựa chọn và sau từ chối; không tự cấp quyền cookie hoặc quảng cáo. Triển khai trực tiếp trong kiến trúc hiện có.

1. Google tag dùng Advanced Consent Mode với bốn quyền mặc định denied trước config/event. Gửi một page_view/trang và tương tác chuẩn hóa; trước đồng ý bỏ ID gói, địa bàn, thử nghiệm, nguồn UTM. Giữ Basic làm chế độ dự phòng trong cấu hình chung.
2. Lựa chọn hiện có chỉ nâng analytics_storage khi backend xác nhận đồng ý; từ chối/thu hồi trả denied. Không bật quảng cáo, Google Signals, URL passthrough. Lead chỉ ghi nhận sau receipt máy chủ, dedupe trong trang; không gửi thông tin nhập hay receipt ID.
3. Cập nhật thông báo và chính sách để giải thích đo lường không cookie vẫn gửi Google, có thông tin kỹ thuật kết nối. Cookie không đồng nghĩa dữ liệu hoàn toàn vô danh hoặc miễn yêu cầu pháp lý.
4. Kiểm thử unit, Chromium/WebKit, chưa chọn/từ chối/đồng ý/thu hồi/tải lại, PII, admin/preview, URL sạch, không đếm lead lỗi hoặc lặp. QA transport giả trước; kiểm tra transport Google thật có giới hạn sau khi deploy.
5. Deploy candidate, kiểm tra assets/trang, promote và xác minh domain. Không thay cấu hình property GA4 khi chưa có quyền.

Nguồn: https://developers.google.com/tag-platform/security/guides/consent

Review tập trung: thứ tự consent trước config; không ép granted; không lặp page_view; không lộ campaign/ID khi denied; quảng cáo luôn denied; Basic fallback và Admin preview không tải tag.
