# Landing page theo mẫu FPT

Mở `/admin/landing-pages`, chọn **Tạo landing page**, nhập tên và đường dẫn, chỉnh nội dung, **Lưu bản nháp** rồi **Công bố** trong danh sách. URL riêng là `/{slug}`. Trang chủ hiện có tiếp tục dùng cấu hình Slide & giao diện. Trang đã công bố giữ bản công khai cũ khi đang chỉnh bản nháp; công bố lại để áp dụng. Xóa/ngừng rút trang khỏi URL công khai, vẫn giữ lịch sử.

Hero trên mobile và khung preview hẹp dùng chữ/icon theo chiều rộng màn hình: tiêu đề 23–28px, dòng nhấn 25–32px, icon32px. Nhóm điểm nổi bật xếp hai cột, sử dụng toàn bộ chiều rộng nội dung; không còn cột165px ép chữ. Hotline và CTA được thu gọn nhưng nút giữ vùng chạm tối thiểu44px; trường nhập form vẫn16px để tránh tự zoom trên iOS. Cấu hình desktop và khả năng phóng to của trình duyệt được giữ.

## Nội dung chỉnh được

| Phần | Cấu hình |
| --- | --- |
| Đầu trang | Tiêu đề, dòng nhấn mạnh, mô tả, nội dung/nút form, các điểm nổi bật, ảnh desktop và ảnh mobile riêng |
| Gói cước | Checkbox chọn gói đã công bố, thứ tự theo danh sách UUID, 3/4/5/6 cột hoặc tự động, kỳ mặc định 1/6/12 tháng, phụ đề, nhãn nổi bật, màu xanh/cam và danh sách quyền lợi cho từng thẻ |
| So sánh | Bật/tắt và tiêu đề; tốc độ, giá, thiết bị đọc từ gói/báo giá thực |
| Ưu đãi | Bật/tắt, tiêu đề, mô tả, ảnh và tối đa 4 mục minh họa |
| Lợi ích và số liệu | Bật/tắt, tiêu đề, nội dung, biểu tượng; số liệu do Admin nhập |
| Đánh giá | Tên, địa bàn, nội dung, số sao, ảnh tải trực tiếp; thêm/xóa/đổi thứ tự |
| FAQ | Câu hỏi/câu trả lời, thêm/xóa/đổi thứ tự, bật/tắt |
| Menu, CTA, footer | Danh sách liên kết, nhãn nút, ảnh logo, ảnh/nội dung cuối trang, mô tả và liên kết footer |

Tải JPEG/PNG/WebP trực tiếp, tối đa 10 MB, dùng luồng cấp URL tải R2 → xử lý/finalize → media sẵn sàng. Không nhập URL ảnh tùy ý. Hotline có thể đặt riêng cho từng landing; để trống dùng cấu hình chung. Zalo, Messenger, biểu tượng và nhãn popup liên hệ chỉnh riêng trong mục Liên hệ & footer.

Chọn 3 gói tạo 3 cột cân đối trên desktop; 4–6 gói tự chọn số cột tương ứng; nhiều hơn xuống hàng. Tối đa 24 gói. Mobile dùng thẻ trượt ngang có nút trước/sau và chỉ báo vị trí. Ảnh chiếm khoảng 30% chiều cao, nối liền viền thẻ; tên, tốc độ, giá/kỳ, phụ kiện, thiết bị và nút đăng ký dùng cùng cấu trúc với trang chủ. Bảng so sánh cuộn bên trong khung; các thẻ cùng kích thước trong từng bố cục. Nhãn tên dài được giới hạn hai dòng ở desktop, tên đầy đủ có trong popup chi tiết. Chọn số cột thủ công nếu muốn thẻ rộng hơn.

Giá chuẩn và phụ kiện chỉnh trong **Gói cước & bảng giá** / **Sản phẩm & phụ kiện**. Mỗi landing có thể nhập giá riêng mỗi tháng cho từng kỳ 1/6/12 trong **Gói & giá → Tùy chỉnh thẻ & giá riêng**. Để trống kỳ nào dùng giá và ưu đãi chuẩn của kỳ đó. Giá riêng không tự cộng ưu đãi tiền chung; bật lựa chọn tương ứng nếu cần. Không sửa giá của trang chủ khi chỉnh landing. Giá chính là giá mỗi tháng theo kỳ: giá gốc × hệ số; tổng ban đầu tính cả kỳ, phí và phụ kiện một lần/theo tháng. Gói không có báo giá dùng trạng thái tư vấn. Các khối số liệu/đánh giá/FAQ trống được ẩn; không tự sinh bằng chứng khách hàng.

## Xem trước và đăng ký

Preview desktop 1440, mobile 390/320, tablet 768 dùng cùng renderer với bản công khai. Bản đang nhập được cập nhật sau 500 ms; không lưu vào database. Khi nội dung không hợp lệ, giữ preview hợp lệ gần nhất và hiển thị lỗi. Tải ảnh cũ, phản hồi preview cũ hoặc phản hồi lưu cũ không được thay nội dung của trang khác. Thay đổi nhập thêm trong lúc lưu vẫn báo chưa lưu.

Form đầu/cuối trang điền trước tên, số điện thoại, địa chỉ và gói vào form xác nhận hiện có. Khách xác nhận chính sách trước khi gửi. Lead giữ UUID gói, phụ kiện, địa bàn, báo giá đã ký và kỳ quan tâm. Khi không lấy được báo giá, kỳ quan tâm vẫn nằm trong ghi chú được bảo vệ cùng thông tin khách. Preview chặn thao tác gửi lead.

## Kết nối

- `GET /admin/landing-pages`: tài khoản có `content.write`.
- `POST /api/v1/admin/landing-preview`: body `PageInput`, `template="telecom"`, cấu hình `landing: LandingSettings`; trả HTML. Yêu cầu phiên Admin, quyền `content.write`, CSRF và cùng origin khi dùng cookie. `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`.
- CRUD/công bố/ngừng vẫn dùng `/api/v1/admin/pages` và các route `/{id}`, `/{id}/publish`, `/{id}/retire`; PUT gửi `expected_version` để tránh ghi đè. Công bố giữ yêu cầu phân quyền và MFA của CMS.
- `GET /admin/pages/{id}/preview`: xem trước bản đã lưu, có kiểm tra quyền.
- `GET /{slug}` và `/api/v1/pages/{slug}`: chỉ bản đã công bố.
- Giá/địa bàn/phụ kiện/lead dùng `/api/v1/quotes`, `/regions`, `/regions/hierarchy`, `/accessories`, `/leads` như client hiện tại.

`template="blocks"` là mặc định cho trang CMS cũ. Cấu hình landing nằm trong JSON resource page hiện có. Nâng cấp chiến dịch cần migration `supabase/migrations/20261009030713_landing_campaign_activity.sql` cho kiểm tra báo giá, phân quyền công bố theo lịch và đếm phiên ẩn danh. Frontend contract và OpenAPI đã xuất lại để phản ánh `PageInput` và schema nội dung mới.


## Thiết lập chiến dịch nhanh

1. Chọn **Tạo landing page**, nhập tên và slug dễ nhớ; tải ảnh desktop/mobile bằng nút tải ảnh. Có mẫu nội dung Camera; mẫu không tự tạo giá, số suất hay thời hạn.
2. Trong **Gói & giá**, tích các gói và nhập giá mỗi tháng của từng kỳ nếu cần. Ví dụ nhập 180.000 cho kỳ 6 tháng: tiền gói của kỳ là 1.080.000, cộng VAT/phí/phụ kiện theo bảng giá. Mô tả ngắn, nhãn, màu, tên nút và nội dung thiết bị tùy chỉnh riêng. Có thể ẩn nhãn nổi bật.
3. Trong **Ưu đãi**, bật chiến dịch có thời hạn; nhập ngày kết thúc, điều kiện và quà. Ngày bắt đầu không bắt buộc. Định dạng ngày giờ giao diện là dd/mm/yyyy HH:mm, server lưu thời điểm có múi giờ.
4. Số suất tổng/còn lại chỉ nhập khi có dữ liệu vận hành. **Không tự trừ suất khi khách gửi form**. Khách thấy rõ quà được xác nhận khi chốt lắp đặt. Hết thời hạn/chưa bắt đầu/hết suất: dừng giá chiến dịch và dùng giá chuẩn.
5. Trong **Liên hệ & footer**, đặt hotline riêng, link Zalo/Messenger HTTPS, icon popup, các nhóm liên kết footer. Thêm/xóa/đổi thứ tự nhóm và liên kết.
6. Xem trước Mobile 320/390 và Desktop. Preview dùng bản đang nhập, chưa lưu; giá vẫn theo danh mục. **Lưu bản nháp → Công bố** để áp dụng giá riêng công khai. Giá riêng cần `pricing.write` khi lưu và `pricing.publish` khi công bố, ngoài quyền CMS và MFA hiện có; lịch công bố cũng kiểm tra quyền này.

Giá riêng khi tắt khối thời hạn vẫn là giá landing cố định. Để xóa giá riêng, xóa các ô tiền hoặc dùng **Khôi phục nhãn & giá trang chủ**. Trang đã công bố giữ bản cũ trong khi chỉnh bản nháp. Gửi lead luôn lưu slug landing trong ghi chú được bảo vệ, kể cả khi chưa có báo giá; báo giá hợp lệ kèm UUID/version chiến dịch và hạn sử dụng.

## Hoạt động thực và riêng tư

Tùy chọn **Hiển thị hoạt động thực** mặc định tắt. Khi bật, chỉ đếm các session đã đồng ý analytics, có sự kiện xem đúng landing trong 5 phút gần nhất. Dưới 3 phiên ẩn con số. Nhãn là “N phiên quan tâm trong 5 phút qua”, không diễn giải thành số người đang trực tuyến. Cache tối đa 60 giây; tab ẩn ngừng polling. Lỗi API thì ẩn nhãn, không tạo số giả.

- `POST /api/v1/quotes`: thêm `landing_slug`; không gửi giá từ client. Server xác minh bản công bố, gói được chọn, giá khu vực và thời gian.
- `GET /api/v1/landing/{slug}/activity`: trả `{sessions, window_seconds:300}`, không trả thông tin cá nhân.
- Tracking opt-in: `view_landing` với `landing_slug` đã kiểm tra định dạng; không gửi phone/IP vào event này.

Khi đang tải ảnh, các nút thay cấu trúc/danh sách tạm báo chờ tải xong, tránh làm mất ảnh. Vẫn sửa được văn bản; mở trang khác không bị phản hồi tải ảnh cũ ghi đè.

## Cập nhật 09/10: header, form và Zalo

Mobile header dùng một hàng logo, nút đăng ký và nút menu; hotline ẩn ở header. Chiều cao mặc định 56px; menu mở vẫn đủ không gian cho điều hướng. Hero form còn tên, điện thoại và địa chỉ văn bản; bộ chọn tỉnh/thành chuyển xuống trước danh sách gói. Form chuyển thông tin sang popup để xác nhận, giữ nguyên bước đồng ý được liên hệ. Nhấn đăng ký từ thẻ vẫn mang theo gói, kỳ, phụ kiện và báo giá.

Thanh dưới mobile có đăng ký, Zalo, gọi ngay trên một hàng. Zalo riêng cấu hình ở Admin → Landing → Liên hệ, menu & footer; để trống sẽ tự dùng hotline landing hoặc hotline chung. Footer, popup liên hệ và popup xác nhận dùng cùng liên kết. Hotline chung hiện là 0868.247.625, tương ứng https://zalo.me/0868247625.

GA4 dùng mã chung với trang chủ, không hoạt động trong preview. Hướng dẫn thiết lập và danh sách sự kiện tại [GOOGLE-ANALYTICS.md](GOOGLE-ANALYTICS.md).
