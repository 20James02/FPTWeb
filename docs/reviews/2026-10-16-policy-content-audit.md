# Rà soát PageFPT theo 7 tiêu chí nội dung trong ảnh

Ngày: 16/10/2026, giờ Việt Nam. Website được người dùng xác nhận: https://fpt-vungtau.com.

Kết luận: chưa thể xác nhận website đáp ứng toàn bộ tiêu chí. Voucher vẫn đang hoạt động; bảng giá có dữ liệu bất thường đã tái hiện trên giao diện; mã nguồn còn nội dung “tặng 2 tháng” có thể được đưa trở lại trang công khai. Liên kết bảo mật có ở footer, nhưng bản live chưa có thay đổi sang URL FPT của lượt làm việc trước.

Đây là đối chiếu các tiêu chí trong ảnh người dùng cung cấp, không phải kết luận pháp lý hoặc xác nhận của FPT. Không sửa mã ứng dụng, dữ liệu cấu hình, bảng giá hoặc triển khai trong lượt rà soát này.

## Phạm vi và bằng chứng

- Crawl 9 trang công khai tìm được qua liên kết nội bộ và các route dịch vụ; cả 9 trả HTTP 200.
- Chromium: 9 trang × 2 chiều rộng 1440px và 390px, tổng 18 trạng thái. Kiểm tra thêm footer trước/sau đóng banner cookie, thẻ giá/chi tiết kỳ 12 tháng, popup từ link ưu đãi thực tế.
- 5 gói công khai × 3 tỉnh/thành: TP.HCM, Hà Nội, Cần Thơ. 15 yêu cầu báo giá, mỗi phản hồi có 3 lựa chọn kỳ 1/6/12, tổng 45 tổ hợp được quan sát. Đây là lấy mẫu giá theo địa bàn, không phải toàn bộ xã/phường.
- Xem trực quan banner ảnh đang hoạt động và 4 ảnh danh mục duy nhất của 5 gói; không chỉ dò chữ trong HTML.
- Rà mã template, nội dung mẫu của trình soạn landing, cơ chế giá và thời hạn banner.
- Chặn transport quảng cáo/analytics bên ngoài trong browser, không gửi form tư vấn hoặc tạo lead. Thao tác xem báo giá dùng API công khai thông thường: backend lưu snapshot báo giá. Mở một link ưu đãi thông thường có thể được hệ thống ghi nhận là lượt click; không giữ/dùng suất voucher.
- Chưa đăng nhập admin hoặc đọc trực tiếp database. Sitemap hiện rỗng, vì vậy không xác nhận được mọi trang rời không có liên kết, bản nháp và mọi chiến dịch không được công khai trong danh sách. Không có bảng giá/chính sách thương mại được FPT phê duyệt để xác nhận mức giá đúng cần thay thế.

Bằng chứng máy: [crawl](../../.local/qa/policy-audit-2026-10-16/crawl.json), [browser](../../.local/qa/policy-audit-2026-10-16/browser.json), [báo giá mẫu](../../.local/qa/policy-audit-2026-10-16/quotes-sample.json), [tái hiện giá trên browser](../../.local/qa/policy-audit-2026-10-16/pricing-browser-repro.json), [kiểm tra khả năng bấm footer](../../.local/qa/policy-audit-2026-10-16/footer-hit-test.json), [voucher live](../../.local/qa/policy-audit-2026-10-16/voucher-live.json). Các file `.local` là artifact QA trên máy, không được đưa vào Git.

## Đối chiếu 7 điểm trong ảnh

| STT | Tiêu chí | Kết quả quan sát |
| --- | --- | --- |
| 1 | Nội dung “Tặng 2 tháng” | Chưa thấy trong nội dung/ảnh công khai đã kiểm tra. Tuy nhiên vẫn có trong fallback của header, template khuyến mãi, các component demo và preset Mega Sale của admin. Chưa đạt nếu tiêu chí là loại bỏ hoàn toàn khỏi nguồn xuất bản. |
| 2 | Gói 180K / giá cũ | Chưa thấy chuỗi giá 180.000đ trên các trang và tổ hợp giá đã lấy mẫu. Phát hiện SKY kỳ 12 hiển thị **180đ**, F-Game kỳ 12 có cước **25.000đ**, tổng **300.001đ**. Cần xử lý dữ liệu trước khi coi mục giá là đạt. |
| 3 | Link bảo mật chỉ có trên mobile, thiếu footer desktop | Không có lỗi “chỉ ở menu mobile”: footer có link trên 9 trang, hiển thị và bấm được trên desktop. Mobile có link nhưng banner cookie ở lượt đầu che vùng bấm; đóng/từ chối banner thì bấm được. |
| 4 | Sao chép chính sách, còn tên miền `www.fpt.vn` | Không thấy dấu hiệu cụ thể nêu trong ảnh: trang nội bộ trình bày dữ liệu, IP, tracking, nhà cung cấp và liên hệ của website; không có `www.fpt.vn` hoặc `fpthotline.com`. Không thực hiện so khớp toàn văn để kết luận tính nguyên gốc. Footer live vẫn dẫn trang nội bộ, chưa dẫn URL FPT đã sửa ở workspace. |
| 5 | Voucher chưa gỡ hết | **Vẫn tồn tại**: nút nhập mã trên trang chủ và chiến dịch `DAYS9999` mở popup giảm **150.000đ**, thời hạn **15/11/2026**. Không tìm thấy nguyên văn câu “tặng thêm voucher giảm cước”, nhưng không thể đánh dấu đã gỡ voucher nếu đây là yêu cầu của ảnh. |
| 6 | Banner/bài viết sai thời gian | Chưa thấy lỗi tháng 1/08-2026/21 Th1. Banner hiện ghi áp dụng đến **31/10/2026**, còn trong hạn tại ngày kiểm tra. Cấu hình banner lại chưa có `end`, nên chưa tự ẩn theo hạn in trong ảnh. |
| 7 | Tiêu đề trang bị nối lặp 2 lần | Chưa phát hiện trên 9 trang: mỗi trang có đúng 1 thẻ `<title>`, 9 tiêu đề khác nhau, không có chuỗi tên site nối lặp như ảnh. Không suy rộng sang mọi trang rời hoặc cách Google viết lại tiêu đề kết quả tìm kiếm. |

## Các vấn đề cần ưu tiên

### F1 — Giá công khai bất thường ở kỳ 12 tháng

- Nhóm: Content Quality & E-E-A-T. Mức độ: Cao. Độ tin cậy: Cao đối với giá trị quan sát; chưa xác nhận bảng giá thương mại đúng.
- Bằng chứng: tại trang chủ, chọn TP.HCM, gói SKY, kỳ 12 tháng → thẻ hiển thị `180đ`, tổng ban đầu `2.340.000đ`. API đã trả `display_monthly_vnd=180`, `monthly_vnd=195000`, `service_months=13`; không phải trình duyệt rút gọn `180.000` thành `180`.
- F-Game kỳ 12 hiển thị giá bình quân `230.000đ` trong khi popup cho cước thực `25.000đ`, cước cả kỳ `300.000đ`, phí thiết bị `1đ`, tổng ban đầu `300.001đ`. META kỳ 12 cũng có phí thiết bị `1đ`, tổng `3.000.001đ`; mức phí 1đ cần xác nhận, chưa tự kết luận sai nếu có chương trình hợp lệ.
- Các giá trị SKY/F-Game bất thường lặp lại ở cả 3 tỉnh/thành được lấy mẫu.
- Tác động: khách có thể quyết định dựa trên mức giá thấp bất thường hoặc báo giá mâu thuẫn; số tiền sai đã đi vào báo giá được backend xác nhận.
- Truy vết: `pricing/engine.py` truyền `display_monthly_vnd` từ nguồn giá; `client/accessories.js` dùng trực tiếp trường này. `PriceInput` chỉ giới hạn số không âm, chưa phát hiện được trường hợp nhập sai đơn vị. Chưa kiểm tra trực tiếp phiên bản giá/admin hoặc lịch sử người nhập, nên chưa xác định nguồn thao tác gây ra dữ liệu.
- Lưu ý thiết kế: giá bình quân được nhập độc lập là yêu cầu đã chốt trong `docs/plans/2026-10-15-three-period-pricing.md`. Không coi việc hai trường khác nhau tự thân là lỗi; các số cực nhỏ và điều kiện công bố mới là phần cần xác nhận.
- Đề xuất: đối chiếu từng kỳ với bảng giá đã duyệt, xác nhận đơn vị VND, tổng tiền và điều kiện ưu đãi; cần cảnh báo trước công bố khi giá bất thường. Không tự thay bằng mức giá phỏng đoán.
- [Ảnh SKY 180đ](../../.local/qa/policy-audit-2026-10-16/sky-12-months-price.png), [ảnh chi tiết F-Game](../../.local/qa/policy-audit-2026-10-16/fgame-12-months-details.png).

### F2 — Voucher vẫn công khai nếu yêu cầu là gỡ toàn bộ

- Nhóm: Content Quality & E-E-A-T. Mức độ: Cao nếu áp dụng yêu cầu gỡ voucher trong ảnh; cần đối chiếu phạm vi chính sách. Độ tin cậy: Cao.
- Bằng chứng: https://fpt-vungtau.com/s/days9999 chuyển tới trang chủ, tự mở popup “Ưu Đãi Ngày Vàng”, mã `DAYS9999`, giảm `150.000đ` cho thanh toán ban đầu, có thời hạn và điều kiện.
- Tác động: bỏ riêng chữ 100K/200K hoặc câu quảng cáo cũ chưa loại bỏ hoạt động ưu đãi đang công khai.
- Đề xuất: xác nhận yêu cầu là gỡ câu cụ thể hay toàn bộ ưu đãi; nếu là toàn bộ, cần ngừng cả chiến dịch/link và các điểm mở popup/nhập mã, không chỉ sửa nhãn chữ.
- [Ảnh popup thực tế](../../.local/qa/policy-audit-2026-10-16/voucher-live.png).

### F3 — Nội dung “tặng 2 tháng” còn trong nguồn tạo trang

- Nhóm: Content Quality & E-E-A-T. Mức độ: Trung bình, nguy cơ xuất bản lại. Độ tin cậy: Cao về mã nguồn; chưa quan sát xuất hiện công khai trong lượt này.
- Bằng chứng: `src/pagefpt/static/js/admin/landing_editor.js:582` và FAQ tại dòng 599; fallback `src/pagefpt/templates/client/components/header.html:90`; fallback tiêu đề/meta trong `client/landing_page.html:4` và dòng 15. Các component `hero_carousel`, `promotions_section`, `floating_promo`, `ribbon_banner` cũng còn câu tương tự.
- Tác động: để trống runline hoặc dùng mẫu Mega Sale có thể đưa tuyên bố trở lại. Một số component chỉ được include ở development/test, không phải tất cả kết quả tìm mã đều là lỗi live.
- Đề xuất: rà và chỉnh nguồn mặc định/preset theo nội dung thương mại đã được xác nhận; kiểm tra các trang đã tạo từ mẫu khi có danh sách admin.

### F4 — Liên kết bảo mật live chưa cập nhật và bị che trên mobile

- Nhóm: Authority & Trust Signals / Technical Foundations. Mức độ: Trung bình. Độ tin cậy: Cao.
- Bằng chứng: footer của 9 trang live vẫn là `href="/chinh-sach-bao-mat"`; workspace đã đổi liên kết mang nhãn “Chính sách bảo mật” sang URL FPT nhưng chưa deploy. Ở 390px, khi banner cookie đang hiện, phép thử `elementFromPoint` tại giữa link footer trả về nút “Tùy chỉnh”; sau từ chối banner trả về chính link.
- Tác động: thay đổi người dùng yêu cầu chưa đến khách; khách mobile lần đầu phải xử lý banner để bấm link mang nhãn chính sách tại footer. Liên kết “Chi tiết” trong banner vẫn mở được trang thông tin dữ liệu nội bộ.
- Đề xuất: xử lý khoảng trống/footer khi banner mở, sau đó kiểm tra live sau lần triển khai được cấp quyền. Cần xác minh URL đích FPT dùng được trước phát hành: trong lượt kiểm tra này `https://fpt.vn/ho-tro` chuyển tới `/ho-tro/huong-dan-su-dung` rồi trả HTTP 500. Đây có thể là lỗi tạm thời của phía FPT; chưa xác nhận được nó là trang chính sách bảo mật trực tiếp.
- [Footer mobile bị che](../../.local/qa/policy-audit-2026-10-16/footer-390.png), [footer sau từ chối cookie](../../.local/qa/policy-audit-2026-10-16/footer-390-after-deny.png).

### F5 — Banner có ngày hết hạn trong ảnh nhưng chưa cấu hình kết thúc

- Nhóm: Content Quality & E-E-A-T. Mức độ: Thấp tại ngày kiểm tra, nguy cơ nội dung quá hạn. Độ tin cậy: Cao.
- Bằng chứng: ảnh hero ghi đến `31/10/2026`; `/api/v1/system/display-settings` trả slide đang bật với `end=null`. `active_slides` chỉ tự loại khi trường `end` có giá trị và đã qua hạn.
- Tác động: nếu không can thiệp, banner có thể tiếp tục hiện sau hạn trong ảnh.
- Đề xuất: đồng bộ lịch hiển thị với ngày hết hạn đã được duyệt; xác minh trạng thái sau mốc hết hạn.
- [Ảnh banner](../../.local/qa/policy-audit-2026-10-16/banner-1440.png).

## Quan sát thêm về phạm vi SEO

`/sitemap.xml` trả HTTP 200 nhưng không có URL; `/robots.txt` không khai báo sitemap. Đây không tự chứng minh các trang chưa được Google lập chỉ mục, nhưng làm giảm độ đầy đủ của nguồn khám phá URL khi audit. Chín trang đã kiểm tra đều không tràn ngang tại hai chiều rộng được chọn. Không có dữ liệu Search Console để xác nhận chỉ mục hoặc hiệu quả tìm kiếm.

## Thứ tự xử lý đề xuất

1. Xác nhận/sửa dữ liệu SKY, F-Game và kiểm tra các phí 1đ với nguồn giá được duyệt; kiểm chứng lại thẻ giá, popup và báo giá theo kỳ.
2. Quyết định áp dụng yêu cầu gỡ voucher trong ảnh ở mức nào, sau đó đối chiếu chiến dịch/link đang công khai.
3. Xử lý nguồn nội dung “tặng 2 tháng” có thể tái xuất bản; kiểm tra các trang rời từ admin khi có quyền/danh sách.
4. Kiểm tra URL chính sách FPT, triển khai thay đổi đã chuẩn bị khi được yêu cầu; xử lý banner cookie che footer mobile.
5. Cấu hình hạn kết thúc của banner và bổ sung sitemap cho các trang công khai phù hợp.

Không thực hiện các đề xuất sửa hoặc triển khai trong báo cáo này.
