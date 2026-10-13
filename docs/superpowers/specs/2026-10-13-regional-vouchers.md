# Voucher theo khu vực và link chia sẻ

Thiết kế được người dùng chấp nhận ngày 13/10/2026. Triển khai trực tiếp trong dự án hiện có.

- Campaign công khai có bản nháp/công bố, mã duy nhất, tên/nhãn/điều kiện, ngày hiệu lực, gói/danh mục dịch vụ, kỳ 1/6/12 tháng, quy tắc mặc định/tỉnh/xã. Vùng loại trừ thắng; xã thắng tỉnh thắng mặc định.
- Benefit: giảm cố định hoặc phần trăm có trần; tính theo tháng hoặc lần thanh toán ban đầu; giảm phí hòa mạng/thiết bị hoặc tặng phụ kiện một lần. Mặc định không cộng ưu đãi khác; có tùy chọn cho phép cộng. Chỉ một voucher/lead.
- Hạn mức chiến dịch, từng quy tắc khu vực, khách hàng, ngân sách; tồn kho thiết bị quà dùng chung. Hạn mức dựa trên suất đang giữ chưa hết hạn + đã dùng, ngân sách dựa trên chi phí snapshot. Không dùng lượt mở link để giữ suất.
- Link /s/{slug} do admin tạo, nguồn/kênh/nhân viên, đích nội bộ kiểm soát, 302. Cookie ký phục vụ yêu cầu ưu đãi, HttpOnly/SameSite, không chứa PII. Tắt link/campaign có thể thu hồi; không redirect ra bên ngoài.
- Báo giá server đánh giá điều kiện theo địa bàn khách chọn, bản công bố hiện tại và phụ kiện. Snapshot voucher không bảo đảm suất còn khi khách gửi form.
- Form vẫn tên/số/địa chỉ; yêu cầu voucher được ghi nguyên tử cùng lead + queue, idempotency như hiện tại. Mã sai/hết hạn không làm mất lead.
- CRM xác nhận địa chỉ trước khi giữ suất. Giữ suất cần trạng thái quoted/closed/installed và báo giá mới đúng gói/kỳ/địa chỉ. Dùng sau installed (mặc định) hoặc closed (admin lựa chọn); thao tác dùng/hủy cần lý do và audit. Hết hạn trả suất; đã dùng không hoàn lại tự động. Sửa địa chỉ/gói/phụ kiện phải hủy suất cũ trước. Khoá campaign + inventory + lead để chống oversell, snapshot đã giữ không thay đổi theo bản công bố mới.
- Admin marketing.write quản lý; pricing.publish + MFA công bố/tồn kho; lead.write theo scope/assignment thao tác CRM. Không lộ contact_id/PII trong báo cáo public. RLS private, chỉ backend service_role gọi RPC.
- Admin có form cấu trúc, checkbox gói/kỳ/vùng, preview, danh sách sắp xếp/chọn hàng loạt tạm dừng; link sao chép; báo cáo funnel theo kênh/nhân viên/khu vực. QR có thể dùng thư viện sẵn có hoặc cài dependency đã ghim nếu cần.
- Client có thanh ưu đãi gọn, xem điều kiện, bỏ mã/nhập mã; giá và tổng kỳ luôn phân biệt. Analytics chỉ sau đồng ý, không chứa PII/mã cá nhân. Không bịa tồn kho/countdown.
- Voucher cá nhân/referral là giai đoạn sau, không thuộc module campaign công khai đã đề xuất ưu tiên.
