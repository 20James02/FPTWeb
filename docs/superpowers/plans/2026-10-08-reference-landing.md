# Landing telecom theo ảnh tham chiếu

Phạm vi đã được người dùng yêu cầu: dựng mẫu landing trong CMS hiện có, cấu hình toàn bộ nội dung và ảnh, mobile/desktop đồng bộ, chọn 3 hoặc nhiều gói. Giữ Python/Jinja2, không đổi trang chủ. Tham chiếu quyết định hình thức; dữ liệu giá, hotline, ưu đãi, bằng chứng phải lấy từ cấu hình thực.

- [x] Schema LandingSettings trên PageInput (template blocks mặc định tương thích cũ); nội dung hero/gói/lợi ích/thống kê/đánh giá/FAQ/ưu đãi/CTA/footer, ảnh R2 và UUID gói, hạn mức + chống HTML/URL nguy hiểm. Kiểm tra RED→GREEN.
- [x] Render mẫu telecom riêng: header, hero/form, gói đồng chiều cao, bảng so sánh, ưu đãi, lợi ích, thống kê, đánh giá, FAQ, CTA/footer. 3 gói grid cân đối; 4–6 grid desktop; nhiều gói xuống hàng; mobile thẻ một cột và bảng scroll trong khung.
- [x] Landing editor riêng tại /admin/landing-pages: CRUD/lưu nháp/công bố/ngừng, tất cả sections chỉnh trong form có kiểm soát, upload R2, preview unsaved desktop/mobile dùng renderer chung, CAS và quyền giữ như CMS.
- [x] Tích hợp lead/session/idempotency/consent/kỳ/phụ kiện và địa bàn theo API hiện có; preview chặn gửi form. Browser Chromium/WebKit 320–1440, 3/6/9 gói, keyboard, retry, lỗi validation/quyền, CSS so sánh ảnh.
- [x] Review độc lập, hồi quy backend/JS, docs/hợp đồng, deploy Vercel không archive sau kiểm tra danh sách tệp; smoke và promote vào tên miền đã được cấp quyền.

Quyết định: dùng preset telecom trên resource page JSON nên không cần migration; page blocks cũ giữ nguyên. Không nhập giá, số khách, 63 tỉnh hoặc đánh giá ví dụ trong ảnh vào dữ liệu production. Ảnh nền mới là ảnh trang trí thay được trong Admin, không chứng minh sản phẩm/ưu đãi. Thực thi inline theo quyền tự tiếp tục đã có.
