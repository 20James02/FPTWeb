# Quản lý giá trực tiếp ba kỳ — kế hoạch triển khai

Yêu cầu đã chốt: người dùng yêu cầu tạo quản lý ba kỳ 1/6/12 cùng lúc thay hệ số, sau khi chọn giá bình quân hiển thị nhập độc lập. Triển khai trong workspace hiện tại, giữ các thay đổi khác đang có. Không deploy, push hoặc đổi secrets.

1. Viết và chạy kiểm thử thất bại cho API lưu nhiều kỳ, giá bình quân và thiết bị theo kỳ; rollback khi một kỳ sai/version cũ; phân quyền và MFA.
2. Thêm trường nullable `display_monthly_vnd`, `equipment` vào PriceInput và bảng giá. API `/admin/prices/matrix` ghi tạo/sửa/thay thế nhiều kỳ trong một transaction qua dispatch hiện có. Giá trực tiếp dùng hệ số 1, không đổi cách đọc giá cũ.
3. Thay form giá bằng ba khối kỳ; nhập cước tháng trực tiếp dùng tính tiền, giá bình quân hiển thị, phí, tháng tặng, VAT, thiết bị riêng/kế thừa. Tải các bản giá liên quan theo thời điểm khi sửa; không tự chọn nếu có nhiều bản cùng kỳ. Lưu chung và báo lỗi nguyên tử. Bỏ chọn một kỳ nghĩa là không sửa kỳ đó, không tự ngừng cung cấp.
4. Quote trả cả giá bình quân và thiết bị theo kỳ, snapshot giữ nguyên; trang khách/chi tiết/so sánh dùng giá bình quân cho trình bày, cước thực tế vẫn dùng tính tổng. Giá chiến dịch không giữ giá bình quân cũ; voucher ưu đãi tháng cập nhật bình quân tương ứng.
5. Kiểm tra API/PostgreSQL, hồi quy giá/lead/voucher, browser Chromium/WebKit 390px/1280px: tạo ba kỳ, mở lại/sửa, công bố/thay thế, chọn kỳ phía khách. Kiểm tra cú pháp, Ruff, định dạng; review diff và ghi kết quả.

Bảo toàn: giá cũ có hệ số được quy đổi thành cước thực tế khi điền form và chỉ trở thành hệ số 1 ở bản được lưu mới. Lịch sử báo giá và phiên bản giá cũ giữ nguyên. Công bố và thay thế vẫn kiểm tra quyền/MFA; anon không được gọi RPC ghi.
