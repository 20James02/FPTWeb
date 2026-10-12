# Thẻ gói, ưu đãi phụ kiện và khu vực giao diện Admin

**Mục tiêu:** Giá mỗi tháng = giá gốc × hệ số của kỳ 1/6/12; tổng kỳ nhân số tháng. Giữ giá theo địa bàn, thời gian, VAT và báo giá ký phía server.
**Kiến trúc:** Hệ số trên mỗi bản ghi bảng giá (mặc định 1 cho dữ liệu cũ). API quotes đọc ba kỳ trong một truy vấn và trả billing_options để UI đổi giá tức thời; chỉ kỳ được yêu cầu được lưu/ký. Phụ kiện giữ price_vnd là tiền thực thu, thêm original_price_vnd và offer_label. card_labels trên gói được kiểm tra kiểu/độ dài, xuất bản cùng gói.
**Thiết kế:** Ảnh 195/650 px, liền viền; phần thân chứa tên, tốc độ, tiền + chọn kỳ, ưu đãi, thiết bị, hai nút. Mô tả đầy đủ trong dialog. Slide & giao diện và Menu điều hướng là trang riêng, tái sử dụng cấu hình hiện có và kiểm tra quyền.

- [x] Backend RED→GREEN: schema, làm tròn Decimal, hệ số theo địa bàn/kỳ, bảng lựa chọn, snapshot phụ kiện, dữ liệu cũ, invalid inputs, quotes cũ.
- [x] Admin: giá gốc/ưu đãi phụ kiện, hệ số và xem trước giá, nhãn gói; trang riêng giao diện/menu giữ version và phân quyền.
- [x] Client: thẻ đồng kích thước, ảnh 30%, period tức thời và thiết bị cộng dồn, popup đầy đủ/keyboard; giữ lựa chọn khi đăng ký.
- [x] Kiểm thử DB thật + Chromium/WebKit mobile 320/390/430 + lỗi API/quyền/quotes hết hạn, full regression; tài liệu hợp đồng.
- [x] Migration remote và Vercel production sau kiểm chứng, smoke read-only. Không tự tạo giá/ưu đãi kinh doanh.
