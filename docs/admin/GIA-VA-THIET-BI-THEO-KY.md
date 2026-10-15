# Đề xuất giá và thiết bị theo kỳ 1/6/12 tháng

Ngày: 15/10/2026. Trạng thái: đề xuất để duyệt, chưa triển khai mô hình và giao diện mới.

## Ý định đã xác nhận

Admin cần quản lý giá, hệ số, phí hòa mạng, phí thiết bị và thiết bị đi kèm riêng cho từng kỳ trả trước 1, 6, 12 tháng. Người dùng chọn nhập giá hiển thị độc lập và xác nhận đây là giá bình quân mỗi tháng.

Diễn giải trong đề xuất: giá bình quân là thông tin trình bày bằng VND/tháng; không lấy giá này nhân số tháng để thu tiền. Cước thực tế và tổng trả trước vẫn phải được thể hiện rõ, có căn cứ giá.

## Hiện trạng đã kiểm tra

- `PriceInput` và `private.prices` đã có `billing_months`, `monthly_vnd`, `monthly_coefficient`, `setup_vnd`, `equipment_vnd`, `gift_months`, VAT và thời gian hiệu lực.
- Khóa chống chồng giá phân biệt kỳ thanh toán. Hệ số không phải thiết lập dùng chung cho mọi kỳ.
- Form Admin hiện chỉ chỉnh một bản ghi/kỳ mỗi lần. Không có màn hình đặt ba kỳ cạnh nhau.
- Thiết bị đi kèm nằm ở `PlanInput.equipment`, đang dùng chung cho các kỳ. Phí thiết bị đã thuộc từng bản ghi giá.
- Landing có `campaign_prices` nhập riêng theo kỳ; khi áp dụng, cước chiến dịch thay cước tháng và đặt hệ số về 1. Đây là quy tắc hiện có, cần giải thích khi quản lý giá.
- Kiểm thử local xác nhận có thể tạo, sửa hệ số và báo giá độc lập cho cả ba kỳ; chưa có bằng chứng lỗi hệ số ở tầng tính toán hoặc lưu dữ liệu.

## Giao diện đề xuất

Chọn chung gói cước, địa bàn, thời gian hiệu lực và nguồn xác nhận giá. Phía dưới có ba khối 1/6/12 tháng; trên mobile xếp dọc. Mỗi kỳ có thể bật hoặc không cung cấp.

| Trường theo từng kỳ | Ý nghĩa |
| --- | --- |
| Giá gốc/tháng | Căn cứ tính cước thực tế, số nguyên VND |
| Hệ số cước | Điều chỉnh cước tính tiền riêng cho kỳ đó |
| Giá bình quân hiển thị/tháng | Nhập độc lập, số nguyên VND; ghi rõ là bình quân |
| Phí hòa mạng | Thu một lần cho kỳ đã chọn |
| Phí thiết bị | Thu một lần cho kỳ đã chọn |
| Thiết bị đi kèm | Danh sách riêng; cho phép kế thừa gói hoặc chủ động chọn không có |
| Tháng tặng | Chỉ tăng thời gian sử dụng |
| VAT | Giữ quy tắc đã gồm/chưa gồm như hiện tại |

Mỗi khối có bản xem trước: cước sau hệ số, tiền cước trả trước, thời gian sử dụng, các phí và tổng ban đầu. Có gợi ý bình quân từ tiền cước chia thời gian sử dụng để đối chiếu giá nhập; không tự ghi đè giá bình quân Admin đã nhập.

## Công thức và nhãn

1. Cước tháng tính tiền = làm tròn VND theo HALF_UP(giá gốc × hệ số).
2. Cước trả trước = cước tháng tính tiền × số tháng trả trước.
3. Thời gian sử dụng = số tháng trả trước + tháng tặng.
4. Bình quân tham chiếu = cước trả trước / thời gian sử dụng, làm tròn VND. Không gộp phí một lần vào cước bình quân trong đề xuất này.
5. Tổng ban đầu giữ thuật toán hiện tại: cước trả trước + phí hòa mạng + phí thiết bị, xử lý VAT, phụ kiện và giảm giá theo quy tắc đang áp dụng.

Giá bình quân nhập tay chỉ thay nhãn giá trình bày, không thay dòng cước hoặc tổng tính tiền. Khi giá nhập khác bình quân tham chiếu, Admin cần thấy cảnh báo đối chiếu; phía khách luôn thấy kỳ trả trước, tháng tặng và tổng chi phí. Không mô tả một giá thấp tùy ý thành giá thực thu.

## Thay đổi dữ liệu và tương thích

- Bổ sung vào phiên bản giá trường bình quân hiển thị nullable và danh sách thiết bị theo kỳ nullable. `null` nghĩa là kế thừa; danh sách rỗng nghĩa là không có thiết bị đi kèm.
- Giữ nguyên ý nghĩa và dữ liệu cũ của `monthly_vnd` và `monthly_coefficient`. Khi chưa có giá bình quân riêng, giữ cách hiển thị hiện hành để không tự đổi nội dung giá đã công bố.
- Quote và snapshot của lead lưu cả cước thực tế, giá bình quân, thiết bị và kỳ được chọn. Đổi kỳ phải cập nhật tất cả các mục này trên thẻ/chi tiết/báo giá.
- Giá chiến dịch là cước có hiệu lực ưu tiên theo quy tắc hiện có. Khi chiến dịch đổi tiền cước, không dùng lại giá bình quân nhập tay của bảng giá cơ sở nếu chưa được đối chiếu; cần giá bình quân riêng của chiến dịch hoặc giá bình quân tính từ cước chiến dịch.
- Tạo nhiều kỳ có thể dùng API bulk hiện có trong một transaction, tuân thủ giới hạn 500 dòng. Sửa/công bố giá đang tồn tại vẫn theo từng phiên bản và `expected_version`; không hứa lưu nguyên tử nhiều giá thay thế khi chưa có API hỗ trợ.
- Giữ phân quyền, MFA khi công bố, lịch sử giá và quy tắc địa bàn → nhóm → mặc định.

## Kiểm chứng khi triển khai

Kiểm tra tạo/sửa/nhân bản/công bố/thay thế các kỳ có giá và thiết bị khác nhau; giá bình quân không bị nhân lần nữa vào tổng. Kiểm tra VAT, tháng tặng, phụ kiện, landing chiến dịch, quote snapshot, chống chồng hiệu lực, xung đột phiên bản và giới hạn bulk. Kiểm tra chọn kỳ trên trang khách và form Admin ở mobile, bao gồm Safari/WebKit.

Trước thay đổi Supabase cần đối chiếu tài liệu chính thức hiện hành và tạo migration tương thích. Không triển khai production trong phạm vi kiểm tra và đề xuất này.
