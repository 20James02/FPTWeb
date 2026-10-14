# Link voucher → popup → form — 14/10/2026

Luồng khách: bấm `/s/ten-link` → chuyển đúng trang đích đã thiết lập → popup thông tin voucher → **Sử dụng ngay** → form Tên, Số điện thoại, Địa chỉ → thông báo tiếp nhận có mã thật. Mã voucher và nguồn link đi cùng hồ sơ để nhân viên xác nhận địa bàn, gói, kỳ thanh toán và giữ suất theo quy trình CRM.

## Thiết lập trong Admin

1. Vào **Voucher & Link chia sẻ**, tạo voucher, nhập tên/nhãn, điều kiện, thời gian, khoản giảm và quà theo khu vực.
2. Lưu bản nháp, kiểm tra, bấm **Công bố** bằng tài khoản có `pricing.publish`/`marketing.write` và MFA khi yêu cầu. Tạo link không tự công bố voucher.
3. Phần Link chia sẻ: đặt slug, chọn đích `/`, `/khuyen-mai`, `/do-toc-do` hoặc landing page đã công bố `/<slug>`, kênh/nhân viên và bật link.
4. Chia sẻ link hoặc QR. Khách không phải nhập mã lại. Popup và form sử dụng dữ liệu đã công bố; sửa nháp phải công bố lại để thay quyền lợi live.

Link bật khác với voucher đã công bố. Admin hiển thị cảnh báo nếu voucher chưa công bố hoặc ngoài lịch và khóa sao chép tin nhắn nhận ưu đãi khi chưa sẵn sàng. Vẫn cho sao chép URL để chuẩn bị chiến dịch.

## Trạng thái và trải nghiệm

| Tình huống | Hành vi |
|---|---|
| Đã công bố, đúng thời gian, còn quyền lợi | Popup chúc mừng; tên, mã, khoản giảm/quà, địa bàn, hạn dd/mm/yyyy, điều kiện. Sử dụng ngay mở form với mã có sẵn. |
| Voucher nháp/tạm dừng/chưa bắt đầu/hết hạn/hết suất | Known active link vẫn tới đích công khai; popup không hứa ưu đãi, CTA nhận tư vấn. Không áp dụng quyền lợi bản nháp. |
| Link tắt/không tồn tại/đích không công khai | Không redirect sang đích bất hợp lệ; vẫn404. |
| Đang mở quiz/so sánh/form hoặc native dialog | Đợi cửa sổ đó đóng rồi mới mở popup; không chồng focus trap. |
| Khách đóng hoặc bấm Xem các gói trước | Vẫn lướt trang; nút nhắc ưu đãi có thể mở lại. Không ép mở lại liên tục. |
| Form đã commit thành công | Popup/nút nhắc dừng; hiện mã tiếp nhận. Không dùng việc bấm nút làm bằng chứng chuyển đổi. |
| Admin preview | Không popup chiến dịch hoặc đo nguồn/hành trình. |

Popup chỉ giới thiệu ưu đãi, không tạo reservation/giữ suất. Khoản giảm cố định hiển thị theo trần `min(amount,cap_vnd)`; quyền lợi cuối cùng còn phụ thuộc giá/gói/địa bàn/kỳ thanh toán. Không bịa số người đang xem, lịch đếm ngược, số suất hoặc tuyên bố thắng quà. Hạn dùng lấy từ voucher thật. Thời gian tương tác/analytics vẫn tuân theo lựa chọn cookie hiện hành.

## Đấu nối frontend

- `/s` redirect kèm `pf_offer=<slug>`: marker mở popup, không phải chứng nhận quyền lợi. Quyền lợi lấy từ `GET /api/v1/vouchers/context`; phải khớp `voucher.link.slug` và kiểm tra status/date/stock. SDK bỏ marker khỏi URL hiện tại.
- Live dùng cookie voucher HttpOnly đã ký. Non-live xóa context cookie cũ, truyền signed `pf_link_source` cho nguồn form tư vấn; không áp dụng voucher cũ nhầm sang link mới. Chỉ enabled known link và đích công khai được dùng fallback.
- Context public thêm `benefits` (region_name,discount_kind,amount,basis,cap_vnd,sold_out,gift_name), services,billing_months. Không có giá vốn, ngân sách, quota nội bộ hay PII.
- Shared component `client/components/voucher_acquisition.html`; `voucher-acquisition.css`; `client/voucher_acquisition.js`. Client base và standalone telecom landing đều có đủ assets + link_tracking SDK.
- `PageFPTVoucher.current()` cung cấp context đọc; event `pagefpt-voucher-change` đồng bộ popup và summary. `PageFPTVoucherAcquisition.open/refresh` dùng mở lại/cập nhật. Preview phải giữ guard.
- `PageFPTVoucher.leadContext()` và helper submit cũ gắn voucher_code/voucher_link, signed source; giữ idempotency key/body khi retry. Form summary `form-voucher-summary` không yêu cầu nhập mã.
- Event `pagefpt:lead-accepted` chỉ chạy sau receipt/event_id thật; tắt reminder. Admin voucher/source attribution vẫn qua transaction backend.

Migration bổ trợ `20261014054834_voucher_acquisition_flow.sql` forward-compatible, không sửa migration đã áp dụng. RPC `voucher_landing` chỉ expose đích và registry source của enabled known link; private functions không cho anon/authenticated gọi.
