# Form tư vấn rút gọn — 06/10/2026

Theo yêu cầu chỉ hiển thị Tên, Số điện thoại và Địa chỉ cụ thể (text). Bỏ vùng miền, tỉnh/thành, xã/phường, giờ liên hệ, ghi chú trong bottom sheet. Số điện thoại vẫn bắt buộc; tên/địa chỉ giữ tùy chọn như trước. Dòng đồng ý liên hệ và honeypot được giữ. Gói và địa bàn đã chọn trên trang chính đi theo ngữ cảnh, không hỏi lại; không tự suy ra UUID địa bàn từ văn bản địa chỉ.

Tối ưu mobile: một cột, autofill name/tel/street-address, input 16px, nút đóng 44px; chỉ hiện tóm tắt gói khi có gói cụ thể. Lỗi số điện thoại được liên kết với field; retry không mất dữ liệu.

Form Health & Friction Index (đánh giá cấu trúc thủ công, không phải tỷ lệ chuyển đổi đo thực tế): trước 57/100 (12/30 hiệu quả trường, 12/20 cân bằng giá trị/công sức, 12/20 rõ ràng, 12/15 xử lý lỗi, 6/10 tin cậy, 3/5 mobile); sau 91/100 (29/30, 18/20, 18/20, 13/15, 8/10, 5/5). Chưa có dữ liệu tỷ lệ hoàn thành hoặc bỏ từng trường; không khẳng định mức tăng chuyển đổi. Không thêm tracking PII trong đợt này.

Kiểm chứng: 210 pytest đạt (46.18 giây), gồm kiểm tra gói đã công bố được nhận đúng UUID/tên trong danh sách và chi tiết Admin, và tư vấn chung không tự gán gói. 11 nhóm JS contracts đạt, Chrome integration 31 kiểm tra + 48 kích thước/trang đạt; mobile retry dùng cùng idempotency key, không hiện receipt giả khi 503. Luồng ba field qua SQL thật, trả receipt và admin giải mã được tên/địa chỉ; điện thoại được chuẩn hóa E.164. Request Auth/S3 trong kiểm thử tích hợp được mô phỏng; không gửi lead/email thật lên cloud. Khi chạy lại kiểm thử short_lead_form cần fixture SQL mới để không kích hoạt chống lạm dụng do lặp cùng số điện thoại.

Đã promote deployment `dpl_D1LdJa3SvYtPZz8EurmJwN1tfMzF` lên `https://fpt-web-ten.vercel.app`, đọc lại production target khớp. Candidate có 7 kiểm tra cloud đạt, domain thật có 5 kiểm tra HTTP đạt. Chrome thật ở 390px xác nhận ba trường, không tự gán gói khi tư vấn chung, CTA nằm trong màn hình, không tràn ngang/pageerror. Ảnh tại `.local/qa/cloud-short-form.png`. Catalog cloud chưa có gói công bố, nên luồng chọn thẻ gói được xác minh trên fixture SQL qua browser và API; không tạo gói/lead giả trên cloud.
