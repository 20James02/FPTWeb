# Thuộc tính đo lường GA4 của PageFPT

Ngày đối chiếu: 10/10/2026. Đây là bộ cấu hình cần lưu trên GA4, **chưa phải xác nhận đã lưu**. Cấu hình máy đọc được nằm ở `ga4-measurement-config.json`; không thể nhập trực tiếp file JSON này vào giao diện GA4.

## Đúng tài khoản và nguồn dữ liệu

- Property: **FPT James**, ID **558213081**.
- Web stream: **FPT**, ID **16093213879**.
- Measurement ID: **G-D0J0XLJ891**.
- Hostname: **fpt-vungtau.com**.

Windsor.ai đã đọc được các giá trị trên từ dữ liệu GA4. `list_actions` của `googleanalytics4` trả danh sách rỗng: kết nối này không có công cụ sửa Custom definitions, Key events hoặc Enhanced measurement. Google Ads chưa có account được chọn trong Windsor. Không suy ra trạng thái liên kết GA4–Ads từ trạng thái connector Windsor.

## Thuộc tính cần đăng ký

Trong **Admin → Data display → Custom definitions**, kiểm tra danh sách đang có trước khi tạo. Giữ nguyên dimension cùng parameter và scope; không tạo bản trùng, không archive cấu hình có sẵn. Tất cả dimension bên dưới có **Scope = Event**, không phải User. Tên hiển thị có thể đổi; parameter phải khớp chính xác.

| Tên hiển thị | Event parameter | Giá trị do website gửi | Dùng để trả lời |
|---|---|---|---|
| Gói cước | `plan_id` | UUID của gói trong danh mục | Khách quan tâm và đăng ký gói nào? |
| Kỳ thanh toán | `billing_months` | 1, 6 hoặc 12 | Khách chọn kỳ nào? |
| Phụ kiện | `accessory_id` | UUID phụ kiện | Thiết bị nào được chọn? |
| Trạng thái chọn phụ kiện | `selected` | true / false | Thêm hay bỏ thiết bị? |
| Vị trí form | `form_location` | consultation, landing_hero, landing_footer, landing_direct | Form nào tạo yêu cầu? |
| Landing page | `landing_slug` | Slug trang chiến dịch | Chiến dịch nào có hiệu quả? |
| Biến thể thử nghiệm | `variant` | Mã biến thể cố định | Nội dung nào tạo nhiều yêu cầu hơn? |
| Vị trí thẻ gói | `placement` | home, landing, speedtest, product | Thẻ ở đâu tạo lượt chọn gói? |
| Chế độ đo lường | `measurement_mode` | limited, consented | Phân biệt đo hạn chế và đo đã đồng ý |

UUID gói/phụ kiện là mã danh mục công khai, không phải mã khách. Đối chiếu tên bằng danh mục Admin; không thay giá trị bằng thông tin khách. Chưa đăng ký `region_id` theo xã/phường mặc định vì cần kiểm soát số giá trị khác nhau; báo cáo địa bàn chi tiết dùng CRM. Các tham số chuẩn như thiết bị, nguồn/medium, hostname, đường dẫn trang đã có dimension của GA4, không tạo thêm bản tùy chỉnh.

**Custom metrics → Create custom metric**: tên **Số phụ kiện đã chọn**, parameter **accessory_count**, Scope **Event**, Unit **Standard**. Số nguyên 0–100 từ yêu cầu được máy chủ tiếp nhận; không phải doanh thu. Chỉ đọc metric này trong báo cáo đã lọc `event_name = generate_lead`. Tổng metric là tổng lượng phụ kiện trên các sự kiện được ghi nhận, không phải số khách hay tồn kho. Không tạo metric `value`/doanh thu cho một form tư vấn.

## Chuyển đổi và phễu

- Đánh dấu **`generate_lead`** là Key event. Cách đếm **Once per event**, vì chỉ phát sau phản hồi máy chủ có event ID hợp lệ; chống lặp trong trang theo receipt. Nếu cần số khách duy nhất hoặc lead hợp lệ, đối chiếu CRM, không đổi tên chỉ số GA thành “khách hàng”.
- Không đánh dấu `form_open`, `form_start`, `select_plan` hoặc `click_call`/`click_zalo`/`click_messenger` là chuyển đổi lead. Một lượt bấm không chứng minh đã gọi hay gửi tin.
- Không xóa/đổi các Key event khác đang có. Các sự kiện CRM `qualify_lead`, `close_convert_lead` chỉ sử dụng khi triển khai đường gửi CRM riêng có consent, retry và chống trùng.
- Phễu chính: `page_view → form_open → form_start → generate_lead`. Phễu chọn gói thêm `view_plan → select_plan` trước bước mở form; giữ nhánh tư vấn chung để không bỏ khách chưa chọn gói.
- Mã local đã kiểm thử hợp đồng thẻ chung `data-analytics-plan-id` và `data-analytics-action`, cả speedtest và DOM động. Chưa xác nhận bản này đã triển khai hoặc GA4 nhận dữ liệu thật.
- Khi tính CTR theo gói, lọc `measurement_mode = consented` và cùng `placement`. Impression hạn chế trước lựa chọn không có mã gói; sau khi đồng ý, thẻ đang hiện được quan sát lại với mã danh mục. Hai mức đo được đánh dấu riêng, không cộng chúng làm hai impression đã đồng ý.

## Tránh đếm trùng và lộ dữ liệu

Trong Web stream **Enhanced measurement**, giữ Scrolls; tắt **Form interactions**, **Outbound clicks**, **Site search** và **Page changes based on browser history**. Website đã có `form_start`, các sự kiện bấm liên hệ và page_view thủ công với URL làm sạch. Kiểm tra Video engagement/File downloads theo nội dung thực trước khi dùng.

Trong **Redact data**, bật che email; thêm query parameters: `phone,email,name,address,token,code,access_token,refresh_token`. Không gửi tên, điện thoại, địa chỉ cụ thể, nội dung ghi chú, IP, tọa độ, mã tiếp nhận hoặc token phiên thành custom dimensions, User ID hay UTM. Không bật quyền quảng cáo hay Google Signals chỉ để hoàn thành thiết lập thuộc tính.

Giữ Advanced Consent Mode hiện hành: trước lựa chọn/từ chối chỉ tín hiệu hạn chế với storage denied; sau khi đồng ý mới có các thuộc tính danh mục. Vì vậy `(not set)` ở một số dòng là kết quả dự kiến, không phải lý do bật thu thập đầy đủ khi khách từ chối. Admin và bản preview không đo Google.

## Kiểm chứng sau khi lưu

1. Xác nhận đang ở property 558213081 và stream 16093213879, không chỉ theo tên.
2. Mở lại danh sách Custom definitions: đúng 9 parameter Event phía trên và metric accessory_count; nếu đã có thì tái sử dụng.
3. Xác nhận generate_lead được đánh dấu Key event và Once per event, không thêm điều kiện tự tạo event mới cùng tên.
4. Xác nhận Form interactions đã tắt; form lựa chọn cookie không tạo form_start tự động.
5. Trên client có đồng ý phân tích: thử đổi kỳ 1/6/12 và chọn/bỏ phụ kiện. Dùng Tag Assistant/DebugView; gửi form thật chỉ khi muốn tạo yêu cầu thực trong CRM. Lỗi form không được tạo generate_lead.
6. Dùng QA fixture và chặn transport Google khi kiểm thử tự động; không gửi lead giả vào property production.
7. Báo cáo custom definitions thường cần 24–48 giờ sau khi tạo và thu thập dữ liệu. Không áp dụng ngược cho dữ liệu trước khi đăng ký. Key event không biến các lượt bấm trước đây thành yêu cầu đã tiếp nhận.

## Trạng thái xác minh hiện tại

Đã đọc stream và các sự kiện hiện có qua Windsor: page_view, user_engagement, session_start, first_visit, view_plan, scroll, select_region, form_start trong khoảng 01/10/2026–10/10/2026. Báo cáo này có thể gồm hoạt động QA và dữ liệu cache; không dùng làm số khách thật. Không có generate_lead trong kết quả truy vấn đã đọc, nhưng điều đó không chứng minh event chưa được cấu hình hay chưa từng có trên toàn bộ dữ liệu.

Chưa đọc được cấu hình Custom definitions/Enhanced measurement trực tiếp. Chrome đang chạy, tiện ích Browser được cài và bật, native host hợp lệ; hai lần gọi điều khiển tab lỗi timeout/transport. Chưa thực hiện thay đổi trên tài khoản Google. Đang chờ người quản trị kết nối lại tiện ích và mở GA4.

## Tài liệu chính thức

- [Tạo custom dimensions phạm vi Event](https://support.google.com/analytics/answer/14239696).
- [Enhanced measurement](https://support.google.com/analytics/answer/9216061).
- [Tạo custom metric](https://support.google.com/analytics/answer/14239619).
- [Key events](https://support.google.com/analytics/answer/9267568).
- [Cách đếm Key events](https://support.google.com/analytics/answer/13366706).
- [Sự kiện generate_lead](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#generate_lead).
