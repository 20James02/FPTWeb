# Hiệu quả link content và chuyển đổi — 14/10/2026

Vào **Phân tích & báo cáo → Hiệu quả link content** (`/admin/link-performance`). Cần quyền `marketing.write` trên toàn hệ thống. Tài khoản nhân viên xử lý lead không mặc nhiên được xem dữ liệu chiến dịch toàn bộ.

1. Bấm **Tạo link content**; đặt tên dễ nhớ, slug, trang đích, nền tảng, mã chiến dịch/mã content và ghi chú bài viết. Người tạo, ngày tạo do server ghi nhận, không nhập tay. Mỗi bài/phiên bản nội dung nên có link riêng để so sánh.
2. Sao chép `/r/slug` để đăng bài/quảng cáo. Link voucher `/s/slug` đã tạo cũng được đưa vào cùng báo cáo. Đích/channel voucher chỉnh trong mục Voucher; tên và note có thể chỉnh tại đây.
3. Chọn thời gian (dd/mm/yyyy), nền tảng, người tạo, loại link hoặc tìm tên/note. Nhấn tên cột để sắp xếp hai chiều. Checkbox dùng tạm dừng/bật hàng loạt; kết quả từng link được báo riêng khi dữ liệu đã đổi phiên bản.
4. Bấm **Xem chuyển đổi** để xem số form, khách chốt, đã lắp, tỷ lệ, nhân viên thực sự chốt và thời gian từ form tới chốt. Người tạo link và người chốt là hai vai trò riêng.
5. Xuất CSV **trang đang xem** để đối chiếu content. Không chứa số điện thoại, IP hay địa chỉ khách.

| Chỉ số | Cách tính và cách đọc |
|---|---|
| Click sau lọc bot | GET qua link; không đếm HEAD, tách các bot xem trước nhận diện được. Đây là lượt request, không phải số người duy nhất. |
| Form đã lưu | Backend lưu một lead có nguồn hợp lệ. Gửi lại cùng idempotency key không cộng lần hai. Đây là ý nghĩa “form được xác nhận” đã chọn. |
| Đơn chốt thành công | Lead hiện có trạng thái `closed` hoặc `installed`. Chuyển closed→installed vẫn một đơn; hủy/đánh sai/trùng sẽ giảm chốt hiện tại. Lưu gói/ghi chú chưa phải chốt. |
| Đã lắp đặt | Phần đơn hiện ở `installed`, nằm trong số chốt. Không đồng nghĩa đã thu tiền. |
| Form/click, chốt/click | Tỷ số số lượng nghiệp vụ/request, dùng so sánh nguồn; không phải xác suất một người duy nhất chuyển đổi. |
| Chốt/form | Đơn chốt còn hiệu lực ÷ form đã lưu. Mẫu số 0 hiển thị chưa có tỷ lệ. |
| Thời gian tương tác TB | Tổng thời gian có checkpoint ÷ phiên có checkpoint; chỉ phiên đồng ý phân tích, trang đang hiện/có hoạt động. Phiên chưa có checkpoint là chưa đo, không gán 0. |
| Xếp hạng thận trọng | Cận dưới Wilson 95% của outcome chốt nhị phân/phiên đo, tối thiểu 30 phiên bắt đầu từ ≥7 ngày trước. Thiếu mẫu hiển thị chưa đủ dữ liệu. |

Click/form/chốt nghiệp vụ được nhóm theo ngày nhận nguồn. Phiên đo trưởng thành tính từ ngày bắt đầu phiên đo, kể cả khách đồng ý muộn. Đổi channel của voucher không viết lại lịch sử nguồn; phiên đo khác phiên bản nguồn được tách. Quá trình nhân viên chốt muộn có thể làm tăng kết quả của ngày nguồn cũ.

Báo cáo cập nhật khi bấm **Làm mới**, không tự poll liên tục. Backend cập nhật form/chốt trong cùng giao dịch CRM nên không phụ thuộc Google Analytics hoặc việc callback quảng cáo đã chạy. Thời gian tương tác gửi mỗi 15 giây khi có dữ liệu mới; có thể mất một phần cuối khi trình duyệt/điện thoại đóng đột ngột.

Dữ liệu click/thời gian trước khi bật cơ chế không thể khôi phục. Form voucher cũ có nguồn còn lưu được backfill; tên người tạo/chốt không xác minh được hiển thị không xác định. Xóa PII giữ tổng vô danh cuối cùng nhưng bỏ khả năng đối chiếu hồ sơ/người chốt. Đồng ý phân tích là điều kiện để giữ hành trình và đo thời gian; nguồn công khai phục vụ form được truyền trong URL nội bộ, không tạo cookie tracking trước đồng ý.

## Nâng cấp thuật toán khi đủ dữ liệu

- Ghi chi phí thực tế riêng từng link hoặc một quy tắc phân bổ rõ ràng để tính CPL và chi phí/đơn chốt. Chỉ dùng tiền đã thu để tính doanh thu/ROAS; giá gói hoặc dự kiến hợp đồng chưa phải doanh thu.
- Thêm nhóm content (hook, format, đối tượng) để phân tích cùng nền tảng/địa bàn. So sánh cohort đã đủ thời gian và tách thời gian nhân viên phản hồi để phân biệt lỗi content với lỗi xử lý lead.
- Dùng Beta–Binomial theo nhóm cho nguồn ít mẫu khi có dữ liệu lịch sử đủ tốt; kiểm định hiệu chỉnh/out-of-time trước khi dùng tự động phân bổ ngân sách. Wilson hiện tại không chứng minh hiệu quả nhân quả hoặc khắc phục thiên lệch đồng ý cookie.
- A/B có phân bổ ngẫu nhiên và ghi exposure; xem chốt trên cohort trưởng thành, không chọn thắng bằng vài click hoặc tỷ lệ sớm.
- EWMA cảnh báo click tăng nhưng form giảm, nguồn trùng/bot tăng, hoặc thời gian phản hồi nhân viên vượt SLA. Cần baseline theo ngày/giờ và ngưỡng mẫu để tránh báo động từ nhiễu.
