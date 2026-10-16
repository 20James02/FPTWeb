# Vận hành Trung tâm đo lường

Ngày cập nhật: 16/10/2026. Đường dẫn: `/admin/measurement`.

## Điều gì thiết lập được từ Admin

| Phần | Thiết lập và hành vi |
|---|---|
| Kết nối | GA4 Measurement/Property/Stream ID, Google Ads tag/customer/manager ID, Meta pixel/ad-account/API version, tiền tệ, bật/tắt, phương thức trình duyệt/máy chủ |
| Khóa | Bộ khóa chỉ ghi, mã hóa phía server; OAuth Google, token Meta nhập thủ công; thời hạn và refresh lease chống dùng đồng thời refresh token |
| Kiểm tra | Đọc nhà cung cấp để xác nhận đúng ID, không suy ra đã kết nối chỉ từ việc nhập khóa |
| Cấu hình | Toàn website → domain → landing → chiến dịch; bản nháp, mô phỏng, kiểm tra, công bố, lịch sử, khôi phục |
| Hành vi | Danh sách sự kiện, bật/tắt GA4, tiêu đề/nội dung lựa chọn dữ liệu, chế độ basic/advanced, thời gian làm mới |
| Chuyển đổi | Form đã lưu / đủ điều kiện / đã chốt / đã lắp; kết nối, tên sự kiện, conversion label/action, giá trị mục tiêu, primary/secondary |
| Chiến dịch | Đấu nối chiến dịch đang có với tài khoản và Campaign ID nền tảng, trang đích, ghi chú, tạo tham số URL |
| Chi phí | Nhập tay có xem trước, cập nhật thay thế, chống cộng lại cùng bản nhập; đồng bộ từ API với phân biệt nguồn và cấp dữ liệu |
| Báo cáo | Form, chốt, lắp, chi phí, CPL, chi phí/chốt; phễu, khoảng Wilson, ngưỡng mẫu và độ chín, số phiên/thời lượng GA4 theo từng property |
| Công việc nền | Đồng bộ thủ công tối đa31 ngày; chu kỳ tự động0 hoặc15–1440 phút, nhìn lại1–31 ngày; trạng thái hàng đợi và sổ gửi chuyển đổi |
| Hàng loạt | Chọn tối đa50 kết nối để dừng hoặc cấu hình để công bố; từng mục giữ phiên bản riêng và trả lỗi riêng |

Đổi giao thức nhà cung cấp, thêm provider chưa có, SQL hay mã thực thi tùy ý không nằm trong cấu hình Admin. Khóa gốc mã hóa, service key Supabase và cấu hình hạ tầng vẫn ở biến môi trường server.

## Thiết lập lần đầu

1. Vào **Kết nối → Thêm kết nối**, chọn đúng môi trường. Website production chỉ dùng kết nối production. Nhập ID từ đúng tài khoản; không nhập tên tài khoản thay ID.
2. Lưu, mở **Quản lý khóa**. Nhập **đầy đủ bộ khóa muốn dùng**: lưu sẽ thay bộ khóa hiện tại, không hiển thị lại khóa cũ.
3. GA4/Ads có thể dùng **Kết nối Google OAuth**. Cần tạo OAuth Client trong Google Cloud và đăng ký chính xác redirect URI mà Admin trả về. GA4 cần quyền đọc property; Ads cần developer token và quyền tài khoản tương ứng. API server/data-manager có thể cần quyền/scope riêng. Không mặc định một lần kiểm tra đọc tài khoản đã chứng minh quyền gửi chuyển đổi.
4. Meta dùng token có quyền pixel/dataset và quảng cáo tương ứng, nhập phiên bản API được tài khoản hỗ trợ. Kiểm tra tài liệu hiện hành và Test Events trước khi chạy thực tế.
5. Bấm **Kiểm tra kết nối**. `connected` chỉ xác nhận phép đọc kiểm tra đó thành công.
6. Tạo cấu hình toàn website, chọn GA4; bật phương thức trên kết nối và thiết lập mục tiêu cần dùng. **Lưu bản nháp → Kiểm tra & công bố**.
7. Chỉ bật lịch tự đồng bộ khi đã có quyền đọc API. Lịch dùng quyền hiện tại của người lưu kết nối; mất quyền thì lịch không tiếp tục.

Kết nối đã từng công bố không được đổi danh tính đích. Kết nối đã sở hữu dữ liệu chi phí không được đổi tài khoản, môi trường, provider hay tiền tệ. Muốn đổi đích đo, tạo kết nối mới rồi công bố cấu hình mới. Nguồn tài khoản/property bị khóa khi đang đồng bộ hoặc đã có dữ liệu thuộc nguồn đó; tác vụ giữ snapshot định danh nguồn qua các bước fetch/stage/apply. Với chi phí của cùng một tài khoản, tiếp tục dùng kết nối đang sở hữu nguồn chi phí để tránh nhân đôi số tiền; kết nối cũ bị tắt vẫn giữ số liệu lịch sử.

## Chiến dịch, landing và URL

1. Tạo chiến dịch ở mục Marketing hiện có.
2. Trong **Chiến dịch & Link**, chọn kết nối đúng nền tảng, nhập Campaign ID ngoài nền tảng, trang đích và ghi chú.
3. Bấm tạo tham số. Google dùng ValueTrack; Meta dùng tham số động được Ads Manager thay khi khách nhấn quảng cáo. Giữ Campaign/Ad IDs dạng chuỗi để tránh mất chính xác với số lớn.
4. Muốn cấu hình riêng một chiến dịch: scope `campaign`, scope_key là **UUID chiến dịch nội bộ**, không phải Campaign ID ngoài nền tảng. Campaign ID từ URL/touch chỉ được ánh xạ khi có đúng một chiến dịch đã cấu hình, đúng provider/môi trường và kết nối bật. Nếu mơ hồ, hệ thống kế thừa cấu hình phía trên.
5. Giá, voucher, lead intake và quy tắc phân công vẫn dùng các module hiện có. Không ghi tên, điện thoại, địa chỉ, ghi chú, OTP hay token vào UTM.

Google Ads có thao tác **xem trước → áp dụng** cho `campaign.final_url_suffix`, đọc lại trước/sau và chặn phiên bản thay đổi. Không sửa ngân sách hay bật/tắt quảng cáo. Google và DB không có giao dịch chung: nếu thao tác báo chưa xác minh, đọc lại Ads Manager trước khi thử tiếp. Meta hiện xuất tham số để dán trong Ads Manager; không có capability ghi trực tiếp trong bản này.

## Quy tắc dữ liệu và chống đếm sai

- Form chỉ là chuyển đổi khi server đã lưu và cấp receipt. Retry cùng idempotency key không tạo thêm occurrence.
- Mỗi lead/stage có một occurrence; mỗi occurrence/kết nối có một delivery, lease token chặn worker trả kết quả muộn. Không gửi trực tiếp tới nền tảng trong request gửi form.
- Gateway chuyển đổi cũ vẫn dùng cho kết quả chưa có mục tiêu quản lý mới, nhưng cũng yêu cầu quyền quảng cáo tách riêng. Khi đã khai báo mục tiêu cho một kết quả, quyền gửi của kết quả đó chuyển sang các đích mới; khai báo đầy đủ các đích cần dùng vì không thể biết một gateway tùy ý đang chuyển tiếp tới tài khoản nào.
- GA4 `generate_lead` đi theo đường receipt gốc. Không cho thêm bản sao Measurement Protocol của cùng lead. CRM qua `server` hoặc GA4 `ga4_import` có outbox; việc import từ GA4 sang Ads vẫn phải cấu hình trong Google.
- Phiên đã đồng ý được giữ qua chuyển trang, xác minh lại với server khi khôi phục; thu hồi ở tab khác hạn chế ngay, tăng quyền vẫn cần server xác nhận. Cấu hình theo phiên không được CDN cache; receipt trả metadata đích công khai của snapshot đã lưu để chuyển đổi trình duyệt và máy chủ dùng cùng nguồn.
- Snapshot giữ phiên bản cấu hình, nguồn và mã nhận diện tại lúc nhận lead. Khách vào chiến dịch khác sau đó không thay mã nhận diện cho lần chuyển đổi cũ. Rút đồng ý/tắt kết nối vẫn được kiểm tra lại trước khi gửi.
- Quyền phân tích, nguồn tiếp thị, quảng cáo và cá nhân hóa là các lựa chọn riêng. Quyền tiếp thị cũ không tự trở thành quyền quảng cáo. Advanced chỉ là tín hiệu Google hạn chế; không làm cho khách từ chối trở thành khách đã đồng ý.
- Meta website CAPI yêu cầu URL nguồn đã bỏ query/fragment và User-Agent thật nhận từ request. Hai giá trị được mã hóa riêng trong snapshot khi có quyền quảng cáo; không dùng User-Agent hoặc định danh bịa. Pixel có thể khởi tạo để tạo cookie thật cho tuyến máy chủ khi cho phép phương thức trình duyệt; thiếu định danh thật vẫn báo thiếu dữ liệu, không giả thành công.
- Browser Pixel bị chặn trên URL/referrer có tham số ngoài danh sách đo lường được hỗ trợ; tắt autoConfig. Không bật automatic advanced matching. Đây không phải cam kết rằng thiết lập tự động trong tài khoản nền tảng đã được audit.
- Mã click/provider IDs được mã hóa, không phải dữ liệu vô danh. Không dùng GeoIP, đầu số, fingerprint hay dữ liệu bịa để tạo định danh quảng cáo.
- Thu hồi khi offline lưu riêng bằng chứng yêu cầu thu hồi trong vùng dữ liệu thiết yếu (tối đa90 ngày), gửi lại trước khi khôi phục đo lường và khi có mạng; chỉ xóa sau khi server xác nhận. Endpoint thu hồi chỉ được hạ quyền, kể cả proof đã hết hạn; proof hết hạn không được đọc phiên hay ghi tracking. Server chỉ có thể áp dụng yêu cầu sau khi thiết bị truyền được yêu cầu.
- Thu hồi đồng ý chặn lần gửi mới; dữ liệu đã được nền tảng nhận trước đó không tự bị xóa từ website.

## Đọc báo cáo chính xác

CRM là nguồn đếm form/chốt/lắp. `received` nghĩa là API/transport nhận yêu cầu, **không có nghĩa nền tảng đã phân bổ chuyển đổi**. `accepted` dựa vào trường phản hồi provider; `unknown` không tự gửi lại để tránh trùng. Không cộng Google và Meta để suy ra tổng khách duy nhất.

Chi phí dùng VND. API đồng bộ chỉ chấp nhận múi giờ UTC+7 được hỗ trợ (`Asia/Ho_Chi_Minh`, `Asia/Saigon`, `Asia/Bangkok`, `Asia/Jakarta`); múi giờ khác cần cơ chế chuẩn hóa riêng. Ngày nhập tay là ngày Việt Nam. GA4 giữ số liệu theo múi giờ property và hiển thị riêng từng kết nối, không cộng nhiều property thành khách duy nhất.

Một kỳ/chiến dịch chỉ có một cấp chi phí: tổng campaign **hoặc** các nhóm **hoặc** quảng cáo. Không cộng cùng nguồn API với nguồn nhập tay trên cùng nhóm dữ liệu. Số tiền nhập lại là bản thay thế; không phải khoản cộng thêm. Xem trước gắn actor, dữ liệu, phiên bản các dòng và kết nối; thay tài khoản sau xem trước bắt buộc kiểm tra lại.

`null`/“Chưa có dữ liệu” khác 0. Báo cáo CRM dùng cohort theo ngày nhận lead, không phải doanh thu thu tiền theo ngày chốt. Tỷ lệ xếp hạng dùng số mẫu đã đủ độ chín và cận dưới Wilson; chưa đủ mẫu thì không xếp hạng. Giá trị mục tiêu chuyển đổi không được gọi là doanh thu thực thu.

Báo cáo giới hạn93 ngày/lần. Đồng bộ là các trang công việc có giới hạn; khi một trang thất bại, dữ liệu đang hiển thị có thể chưa đầy đủ. Kiểm tra lịch sử công việc, thời điểm đồng bộ và lỗi quyền/rate limit trước khi so sánh chiến dịch. Không dùng dữ liệu URL khai báo để chứng minh quan hệ nhân quả hoặc danh tính khách.

## Hiệu suất, lưu trữ và vận hành

- Cấu hình công khai có ETag, CDN TTL30 giây, client làm mới30–300 giây. Không chặn form nếu tải cấu hình đo lường lỗi.
- Provider HTTP dùng pool dùng lại, timeout và host cố định. Credential refresh dùng lease ở DB, không dựa vào bộ nhớ một Vercel instance.
- Intake tạo occurrence/outbox trong cùng giao dịch; worker xử lý sau. Thao tác hàng loạt tối đa50 mục, tối đa4 tác vụ API nội bộ đồng thời.
- Mỗi trang chi phí được lưu thành các lô bền vững tối đa50 dòng; mỗi job chỉ áp dụng một lô, tiếp tục từ DB và không tải lại trang khi còn lô chờ. Một đợt đồng bộ bị chặn sau1000 lô, không quét vô hạn.
- Lịch nền xét tối đa10 kết nối đã tới hạn mỗi tick, bỏ qua kết nối đang có công việc hoặc chưa tới chu kỳ. Cần scheduler `/internal/jobs/process` của hạ tầng hiện có hoạt động.
- Retention dữ liệu đo thô1–90 ngày, theo global config của từng môi trường. Tick xóa từng lô tối đa200 touches/events/mã nhận diện snapshot; không xóa nghiệp vụ CRM hay tổng chi phí. Cửa sổ nguồn hiệu lực không vượt retention. Dữ liệu lịch sử chưa được gắn môi trường được coi production khi dọn.
- Thay ngưỡng retention không làm dữ liệu đã xóa xuất hiện lại. Mã nhận diện hết hạn không được dùng cho lần gửi mới ngay cả khi tick dọn chưa chạy.
- Chưa có bằng chứng benchmark triệu lead hoặc kiểm tra tải tài khoản quảng cáo thật. Không suy diễn tốc độ/quota thực tế từ fixture local.

## Phân quyền

| Quyền | Phạm vi |
|---|---|
| measurement.read | Xem trung tâm/cấu hình/báo cáo/lịch sử |
| measurement.configure | Sửa bản nháp/kết nối, kiểm tra, nhập chi phí, đồng bộ |
| measurement.publish | Công bố/khôi phục/dừng; đổi kết nối đang được cấu hình active tham chiếu cũng cần quyền này |
| measurement.credentials | Quản lý bộ khóa/OAuth |
| measurement.replay | Thử lại delivery thuộc nhóm được phép; không tự thử lại unknown |
| measurement.external_write | Bước áp dụng tham số URL Google Ads |

Các quyền này yêu cầu membership toàn website. Thao tác nhạy cảm yêu cầu MFA, kiểm tra cùng origin và CSRF khi dùng cookie. Màn hình chỉ ẩn nút để tiện dùng; API và SQL mới là nơi kiểm tra quyền. Nhân viên xử lý lead không mặc định được đọc khóa. Công cụ chiến dịch còn cần `marketing.write`; OAuth/ghi bên ngoài cần thêm các quyền đọc/cấu hình phù hợp cho màn hình và kiểm tra kết nối.

## Kiểm chứng và triển khai

Các kiểm thử provider sử dụng HTTP giả lập với dữ liệu tổng hợp; browser fixture chặn transport ra ngoài. Không tạo đơn giả, gửi Telegram hoặc gửi conversion vào tài khoản thật để thử tự động.

Trước khi chạy thật: migrations mới đã áp dụng, origin/callback Google chính xác, scheduler hoạt động, account permissions/API version đúng; sau đó dùng chế độ kiểm tra của provider để xác nhận quyền gửi/nhận. Lưu bộ khóa ở Admin, không đưa qua chat hoặc Git. Kết quả kiểm tra tự động và trạng thái triển khai thực tế được ghi riêng trong báo cáo QA của đợt thay đổi.
