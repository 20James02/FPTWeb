# Prompt Antigravity — thiết kế lại landing PageFPT

Sao chép nội dung từ dòng “Bạn là…” đến hết tài liệu vào Antigravity, mở workspace PageFPT và gửi kèm ảnh tham chiếu nếu có.

---

Bạn là chuyên gia Product Design, UI/UX, conversion marketing và kỹ sư frontend/full-stack cấp cao. Hãy thiết kế lại landing page chiến dịch của dự án PageFPT và trình quản lý landing trong Admin: chuyên nghiệp, gọn, rõ ràng, đồng bộ trên điện thoại và máy tính; mọi thành phần quan trọng đều tùy chỉnh được bằng giao diện dễ dùng.

## 1. Mục tiêu và giới hạn

Mục tiêu chính là khách để lại thông tin liên hệ hợp lệ để nhân viên tư vấn/chốt gói Internet, truyền hình hoặc camera. Tối ưu số lead có thể liên hệ và phù hợp nhu cầu, không chỉ tối ưu số lượt nhấn nút.

Tôi đặc biệt coi trọng bố cục ngăn nắp: thẳng hàng, khoảng cách nhất quán, thẻ cùng kích thước, nội dung dễ quét mắt. Mobile không bị ép chữ, mất chữ, kéo dài quá mức hoặc có nhiều thanh nổi chồng nhau. Thiết kế mới phải có dấu ấn thương hiệu nhưng phục vụ việc đọc giá và đăng ký.

- Giữ Python/FastAPI + Jinja2 + HTML/CSS/JavaScript nhẹ; triển khai theo Vercel, Supabase, Cloudflare R2. Không chuyển sang Next.js/React/backend Node.
- Giữ dữ liệu và cấu hình landing cũ, API nghiệp vụ, phân quyền, MFA, CSRF, chống ghi đè và luồng gửi lead hiện có.
- Không tự bịa giá, đánh giá khách, số người truy cập, số suất quà hoặc tuyên bố đại lý chính thức. Không lấy IP làm bằng chứng địa chỉ chính xác.
- Thực hiện thiết kế và triển khai trong workspace, tạo bản xem trước có thể đánh giá. Không tự triển khai production, sửa dữ liệu khách thật hoặc gửi tin nhắn ra ngoài.
- Workspace có nhiều thay đổi đang làm: kiểm tra git trước khi sửa, giữ thay đổi không thuộc phạm vi, không reset hoặc commit toàn bộ.

## 2. Đọc dự án và dùng skills đúng mục đích

Trước khi thay đổi, đọc `AGENTS.md`, `KE-HOACH-WEBSITE-CLIENT-ADMIN.md`, `KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md`, `SKILLS-DU-AN.md`.

Đọc tài liệu và code thực tế:
- `docs/frontend/TELECOM-LANDING.md`, `GIA-THEO-DIA-BAN.md`, `GOOGLE-ANALYTICS.md`.
- `docs/backend/api-contract.md`, `docs/backend/openapi.json`.
- `src/pagefpt/modules/content/landing_settings.py`, `schemas.py`, `routes.py`.
- `src/pagefpt/templates/client/telecom_landing.html` và các component thẻ gói/chi tiết gói dùng chung với trang chủ.
- `src/pagefpt/static/css/telecom-landing.css`, CSS thẻ dùng chung; JS client landing, catalog, regions, quotes, bottom sheet, analytics/consent.
- `src/pagefpt/templates/admin/landing_pages.html`, `src/pagefpt/static/js/admin/landing_editor.js`, CSS Admin landing và luồng tải ảnh.
- Tests liên quan landing, campaign, thẻ, phụ kiện, báo giá, địa bàn và gửi lead. Khám phá thêm đường dẫn bằng `rg`; không giả định tên file hoặc API chưa tồn tại.

Skills đã cài tại `/home/thannv3/.codex/skills`. Đọc `SKILL.md` của các skill phù hợp, ưu tiên:
- `brainstorming`: xác định mục tiêu, ràng buộc và thiết kế.
- `ui-ux-pro-max`: design system, hierarchy, responsive, typography, tương tác.
- `page-cro`, `form-cro`: dẫn dắt quyết định và giảm ma sát form.
- `fixing-accessibility`, `web-performance-optimization`: khả năng thao tác và tốc độ.
- `analytics-tracking`: chỉ khi thay đổi đo lường.
- `systematic-debugging`, `test-driven-development`, `verification-before-completion`: sửa lỗi và kiểm chứng.
- `api-security-best-practices`, `supabase`, `supabase-postgres-best-practices`: khi mở rộng schema/API/database.

Không coi việc đọc skill là đã áp dụng. Nêu quyết định cụ thể dựa trên skill và điều chỉnh theo thương hiệu/stack thực tế. Không cài ngẫu nhiên skill hoặc thư viện nặng. Nếu skill thiếu, báo rõ và dùng quy trình tương đương; không tuyên bố đã dùng skill không tồn tại.

## 3. Rà soát trước khi thiết kế

Mở landing hiện có và Admin editor, kiểm tra ở 320/375/390/430/768/1024/1440 px. Chụp ảnh và chỉ ra lỗi quan sát được, không chấm điểm bằng cảm tính.

Lập bảng mức sẵn sàng chuyển đổi theo `page-cro`: thông điệp 25, mục tiêu CTA 20, khớp chiến dịch 15, tin cậy 15, ma sát UX 15, giải đáp băn khoăn 10. Lập bảng ma sát form theo `form-cro`. Mỗi nhận xét phải có vị trí/ảnh/code làm bằng chứng; thiếu dữ liệu hành vi thì ghi chưa có dữ liệu, không suy đoán tỷ lệ chuyển đổi.

Đề xuất hai hướng thiết kế ngắn, chọn hướng phù hợp nhất với nhu cầu này và giải thích lý do. Viết design brief, component map, luồng khách và luồng Admin trước khi code. Yêu cầu trong prompt này là đầu vào phạm vi; chỉ hỏi nếu có quyết định thực sự ảnh hưởng dữ liệu, nghiệp vụ hoặc quyền mà chưa được giải quyết.

## 4. Hướng thiết kế ưu tiên

Landing dịch vụ viễn thông hiện đại, nền sáng, nội dung rõ ràng, màu xanh tạo tin cậy và cam nhấn CTA theo thương hiệu FPT. Dùng logo/tài sản đã được cung cấp trong dự án, một hệ icon SVG thống nhất, font hỗ trợ tiếng Việt. Không chồng nhiều gradient, glow, hiệu ứng 3D hoặc viết toàn bộ nội dung bằng chữ HOA.

Tạo design tokens cho màu, chữ, spacing, radius, shadow, container, motion, z-index. Dùng scale khoảng cách nhất quán. Ưu tiên body 16 px, input ít nhất 16 px, vùng bấm tối thiểu 44×44 px, tương phản chữ thường tối thiểu 4,5:1. Tiêu đề mobile dùng `clamp` và ngắt dòng tự nhiên; không thu nhỏ toàn trang bằng `transform: scale`, viewport giả hoặc disable zoom để sửa overflow.

Desktop dùng container khoảng 1200–1280 px và tự điều chỉnh theo thẻ. Mobile padding 16–20 px; ở 320 px có thể giảm khoảng cách hợp lý. Không che lỗi bằng `overflow-x:hidden` ở body; sửa đúng grid/flex, `min-width:0`, width, ảnh và text wrapping.

Animation ngắn, nhẹ, có mục đích; tôn trọng `prefers-reduced-motion`. Thiết kế đầy đủ trạng thái loading, empty, error, disabled, success và nội dung rất dài.

## 5. Bố cục landing và hành trình quyết định

Thứ tự mặc định:
1. Header gọn: logo, điều hướng cần thiết và CTA.
2. Hero: giá trị chính, hình ảnh sản phẩm, ưu đãi có điều kiện rõ và form ngắn.
3. Chọn địa bàn + danh mục/thẻ gói.
4. Khối ưu đãi chiến dịch và điều kiện.
5. So sánh gói, nếu bật.
6. Lợi ích phù hợp từng nhu cầu và quy trình đăng ký dễ hiểu.
7. Bằng chứng/đánh giá thật, nếu có.
8. FAQ giải đáp chi phí, thiết bị, kỳ thanh toán, hạ tầng và lịch lắp.
9. CTA cuối, footer gọn và các liên kết cần thiết.

Admin có thể ẩn và đổi thứ tự các khối tùy chiến dịch. Khối thiếu dữ liệu được ẩn gọn; menu không còn trỏ tới khối đã ẩn. Không render hàng loạt section mẫu với dữ liệu giả.

Header mobile giữ một hàng logo, nút đăng ký, menu; ẩn hotline dạng văn bản. Chiều cao mục tiêu khoảng 56–64 px. Sticky contact chỉ một thanh gồm Đăng ký / Zalo / Gọi, có safe-area và padding bù; không che nội dung, form hay cookie banner. Popup liên hệ không tự mở gây cản trở.

Hero desktop có hình ảnh và form cân đối. Mobile xếp dọc, thông điệp/CTA nhìn thấy sớm; ảnh riêng mobile, không crop mất sản phẩm hoặc chồng chữ lên vùng khó đọc. Nếu có slide/media thì cho cấu hình chế độ chỉ ảnh/video + link; không ép hiển thị title/CTA phủ lên mọi ảnh. Video có poster, play/pause, fallback; không tự phát âm thanh hoặc tải video nặng ngay.

Giữ chức năng đo mạng ở vị trí tùy chọn dạng CTA phụ, không bắt khách đo trước khi xem gói hoặc gửi form. Không tự xin quyền vị trí khi vừa vào landing.

## 6. Thẻ gói cước: đồng bộ với trang chủ

Dùng cùng component/macro và behavior với thẻ trang chủ, không tạo bản sao giao diện có logic báo giá riêng. Cấu trúc mặc định:
- Ảnh full chiều ngang, nối liền viền trên và bo góc của thẻ; khoảng 30–36% chiều cao thẻ, tỷ lệ nhất quán.
- Tên gói và nhãn nổi bật cấu hình riêng cho landing.
- Giá lớn dạng `220.000đ`, bên cạnh lựa chọn 1/6/12 tháng; nhãn ngắn cho biết đây là giá mỗi tháng theo kỳ. Không hiển thị giá thiếu dữ liệu thành 0đ.
- Khung Download/Upload rõ đơn vị Mbps/Gbps, không chế chỉ số.
- Quyền lợi ngắn, thiết bị, checkbox phụ kiện/ưu đãi với tên – giá gốc – giá ưu đãi.
- Nút chính Đăng ký ngay và nút phụ Xem chi tiết. Popup chi tiết có toàn bộ mô tả, giá, kỳ, phí, thiết bị và điều kiện.

Các thẻ cùng kích thước trong mỗi chế độ hiển thị; ảnh, khung tốc độ, giá và hàng CTA thẳng hàng khi nội dung khác nhau. Dùng grid/flex với vùng nội dung hợp lý. Khi chữ phóng to hoặc nội dung dài, cho chiều cao tăng đồng bộ; không cắt mất tên, quyền lợi hay điều kiện để giữ chiều cao cứng. Nội dung phụ có thể “Xem thêm”; không tạo scroll lồng quá dài trong thẻ.

Desktop: 3 gói thành 3 cột cân đối; 4–6 gói chọn số cột theo độ rộng đủ đọc, không ép 6 thẻ hẹp vào mọi màn hình; nhiều gói xuống hàng/phân danh mục. Mobile mặc định thẻ trượt scroll-snap căn giữa, rộng khoảng 85–92% vùng nội dung, thấy một phần thẻ tiếp; có nút trước/sau và chỉ báo. Admin có thể chọn danh sách một cột. Khách không cần biết thao tác vuốt mới tiếp cận được gói khác; tránh lật 3D làm giấu giá hoặc CTA.

Thanh danh mục căn giữa, tối đa 3 mục trực tiếp trong một hàng trên mobile; mục còn lại qua nút “Thêm”. Cho chọn danh mục và gói trong danh mục; nhãn dài không bị mất nghĩa. Khối so sánh có container cuộn riêng và cột tiêu chí dễ đọc, không làm tràn toàn trang.

## 7. Giữ đúng nghiệp vụ giá, phụ kiện và lead

- Giá mỗi tháng theo kỳ = giá gốc × hệ số đã cấu hình; tổng kỳ nhân số tháng. Giá riêng landing được xác thực ở server; không gửi giá client để server tin trực tiếp.
- Checkbox phụ kiện cập nhật tức thì bằng luồng quote hiện có; tách phí một lần và phí theo tháng. Hiển thị giá tháng và tổng thanh toán ban đầu rõ ràng, không gộp phí một lần thành cước tháng. Nếu cần chờ quote, hiển thị trạng thái và xử lý thao tác đổi liên tiếp.
- Gói không có giá hợp lệ: “Cần tư vấn”. Địa bàn/gói không áp dụng có thông báo rõ. Gói đã ngừng không xuất hiện như gói đăng ký được.
- Tỉnh/xã đã chọn có ưu tiên. Gợi ý IP chỉ là ước tính tỉnh; không tự xác nhận xã/phường và không ghi đè thao tác của khách. Khi chọn xã dùng quote cụ thể nhất.
- Form chỉ có tên, số điện thoại, địa chỉ văn bản. Giữ quy định bắt buộc của schema hiện tại; không bắt buộc tên/địa chỉ chỉ để đủ giao diện. Nhãn hiển thị rõ, bàn phím điện thoại, autocomplete, lỗi gần trường, giữ dữ liệu khi lỗi.
- Nút trên thẻ mở form đúng gói/kỳ/phụ kiện/địa bàn/landing. Hero và CTA chung mở tư vấn không ép chọn gói. Không bắt nhập lại thông tin đã điền ở hero.
- Giữ Idempotency-Key cho retry, chống double-submit, chỉ báo thành công sau commit server. 409/422/429/503 có cách xử lý cụ thể; không biến lỗi thành thông báo thành công.
- Giữ đồng ý được liên hệ và consent phân tích đúng cơ chế đã cấu hình, tách hai mục đích. Không tự bật analytics khi khách từ chối.

## 8. Customize đầy đủ bằng Admin

Thiết kế editor chuyên nghiệp: danh sách các khối ở trái, cấu hình khối đang chọn ở giữa, preview ở phải; tablet/mobile chuyển tab “Chỉnh sửa / Xem trước”. Không bày toàn bộ hàng trăm trường trên một trang dài.

Tách “Nội dung” và “Giao diện”; nhóm cơ bản luôn thấy, nâng cao gấp gọn. Nhãn và hướng dẫn tiếng Việt. Không yêu cầu Admin biết UUID, JSON, HTML, CSS hay mã màu để tạo trang cơ bản.

Mỗi khối có: bật/tắt, thêm/sửa/xóa, nhân bản nếu phù hợp, đổi thứ tự, undo/redo bản đang sửa, khôi phục mặc định theo khối. Kéo thả phải có nút lên/xuống thay thế dùng được bằng bàn phím. Xóa phải có xác nhận; không xóa dữ liệu dùng chung của trang chủ.

Ma trận tùy chỉnh phải bao gồm:
- Toàn trang: preset màu, font tiếng Việt, spacing, max-width, density, radius, button style và motion.
- Header/menu: logo, mục/nhãn/link/thứ tự, kiểu hiển thị mobile, CTA.
- Hero/slide: nội dung, ẩn/hiện overlay, ảnh desktop/mobile, video/poster nếu có, focal point, fit/fill, link, bố cục, chiều cao trong giới hạn an toàn.
- Form: title, subtitle, nhãn/placeholder/help text cho ba trường, CTA, thông báo thành công, vị trí. Thay đổi required hoặc schema phải theo backend, không chỉ thay bằng CSS.
- Gói: chọn/tìm gói, danh mục, thứ tự, gói nổi bật, kiểu grid/carousel/list, cột desktop, kỳ mặc định; nhãn, CTA, accent, quyền lợi, ảnh override nếu hỗ trợ, chọn kế thừa hoặc override giá theo kỳ.
- Phụ kiện: chọn từ danh mục thật, thứ tự, cách hiển thị ưu đãi; mặc định khách chưa chọn phụ kiện thu phí. Không tạo phụ kiện/giá giả trong editor landing.
- Chiến dịch: quà, điều kiện, lịch, countdown, số suất, hoạt động thực; state chưa bắt đầu/đang chạy/hết hạn/hết suất.
- Lợi ích/quy trình: icon, ảnh minh họa, title, mô tả, thứ tự, CTA.
- So sánh: bật/tắt, title, chọn tiêu chí và cách hiển thị; giá/tốc độ lấy dữ liệu thật.
- Bằng chứng/đánh giá/FAQ: thêm/sửa/xóa/đổi thứ tự, ảnh, rating, nội dung, bật/tắt.
- Liên hệ: hotline riêng landing, Zalo, Messenger, icon/nhãn popup, nút thanh dưới, kế thừa mặc định. Hotline chung đang dùng `0868.247.625`; không hardcode vào mọi landing.
- Footer: logo, mô tả ngắn, nhóm cột/link/thứ tự, thông tin liên hệ; mobile hai cột/accordion gọn, giữ link chính sách cần thiết.
- SEO: title, description, canonical hợp lệ, ảnh chia sẻ và trạng thái index theo schema/quy tắc hiện tại.

Với mỗi tùy chỉnh, lập bảng `component → trường cấu hình → default → override landing → validation → renderer → test`. Chỉ đưa control vào Admin khi nó thực sự được lưu và có tác dụng ở bản công khai.

Phân biệt khả năng hiện có và cần bổ sung: landing hiện đã có ảnh desktop/mobile, cấu hình văn bản, plan_ids/plan_presentations, giá riêng 1/6/12, accent xanh/cam, nhãn thẻ, toggle section, campaign, liên hệ riêng, footer_groups và preview. Theme tokens, thứ tự section, một số layout/media/per-component overrides cần kiểm tra và bổ sung schema nếu chưa có. Không giả vờ các trường mới đã được backend hỗ trợ.

Ưu tiên config có schema/allowlist, default an toàn, migration tương thích cấu hình cũ. Hạn chế range/style để người dùng không dễ làm hỏng bố cục. Không cho tùy ý chèn script/raw HTML/CSS từ editor.

Upload ảnh trực tiếp qua luồng R2 đã có, thư viện ảnh, progress/error/retry, đổi/bỏ ảnh, alt, crop/focal point nếu triển khai; chỉ lưu media ready. Không nhúng key R2/service-role vào trình duyệt. Preview dùng cùng renderer, có desktop/tablet/mobile và cập nhật sau debounce; form/analytics/conversion thật tắt trong preview.

Lưu nháp, lưu thay đổi, công bố, ngừng công bố, mở trang công khai cần trạng thái rõ. Bản công khai cũ không bị thay bởi autosave draft. Autosave nếu thêm phải kiểm tra version, không tự publish; undo/redo không sửa lịch sử công khai. Có dirty indicator, cảnh báo rời trang chưa lưu và xử lý phản hồi cũ khi chuyển landing.

## 9. Dẫn dắt chiến dịch bán hàng có căn cứ

Hero phải trả lời nhanh: dịch vụ gì, phù hợp ai, quyền lợi chính, áp dụng ở đâu, bước tiếp theo. CTA chính thống nhất; gọi/Zalo là lựa chọn phụ. Có thể tạo preset Gia đình / Combo TV / Camera, nhưng preset không tự tạo giá, stock hoặc lời hứa chưa được xác nhận.

Ưu đãi giới hạn cần ngày bắt đầu/kết thúc có múi giờ, điều kiện theo gói/địa bàn/kỳ, số suất thật nếu được vận hành cung cấp. Countdown lấy thời điểm server, không tự reset khi reload. Hết hạn/hết suất chuyển thông báo và quote chuẩn theo chính sách server; không giữ giá hết hạn trong form.

Hoạt động truy cập chỉ lấy endpoint thật và dùng đúng nhãn về cửa sổ thời gian. Hiện hệ thống có “N phiên quan tâm trong 5 phút qua” của session đồng ý analytics; không đổi thành “N người đang xem”, không dùng số ngẫu nhiên. Lỗi/thiếu dữ liệu thì ẩn. Stock nhập tay không được diễn giải là tồn kho realtime; không tự trừ suất khi vừa gửi form.

Giải đáp gần CTA: phí ban đầu, thiết bị kèm theo, thanh toán theo kỳ, giá theo địa bàn và xác nhận sau khảo sát. Không ép khách quyết định bằng popup dồn dập. Chỉ hiển thị đánh giá/số liệu có căn cứ và được Admin cung cấp.

## 10. Đo lường và hiệu năng

Tận dụng tracking/consent hiện có, tránh nạp GA4 hai lần. Đọc contract sự kiện trước khi thêm. Nếu thiếu, đề xuất và triển khai event tối thiểu cho xem landing/gói, chọn kỳ/phụ kiện, mở form, lỗi form, gửi lead thành công, nhấn gọi/Zalo; đính kèm slug/ID/loại thao tác trong allowlist, không gửi tên/phone/địa chỉ/IP hoặc nội dung tự do lên GA/Ads. Chỉ ghi conversion sau kết quả server, chống gửi trùng.

Không cam kết nâng conversion bằng phần trăm khi chưa có baseline. A/B test chỉ khi hạ tầng và lưu lượng đủ; nếu chưa đủ, ghi giả thuyết và sửa lỗi nền trước.

Ảnh responsive có kích thước/aspect-ratio, WebP/AVIF khi phù hợp, hero ưu tiên tải, ảnh dưới fold lazy-load, video tải theo tương tác. Không dùng ảnh lớn cố định cho mọi mobile. Tái sử dụng cache/batch/concurrency giới hạn của quote; không tạo N+1 request hoặc polling cho từng thẻ. Dừng timer/polling khi tab ẩn nếu phù hợp.

Mục tiêu đánh giá: LCP ≤2,5 giây, CLS ≤0,1, INP ≤200 ms ở điều kiện đo được công bố. Đây là mục tiêu, không phải kết quả mặc định. Lab không thay thế dữ liệu người dùng thật; thiếu field metrics ghi rõ chưa có.

## 11. Kiểm thử và điều kiện nghiệm thu

Không dừng ở mockup hoặc preview tĩnh. Chạy ứng dụng, kiểm tra API thực với dữ liệu test và các luồng sau:
- 1, 3, 6, 12, 24 gói; tên dài; thiếu ảnh/giá; nhiều phụ kiện; mô tả dài; zoom 200%; mobile landscape.
- Đổi kỳ/địa bàn/phụ kiện liên tiếp; kết quả cũ không ghi đè; giá landing không làm đổi giá trang chủ; gửi lead giữ đúng snapshot/gói/kỳ/phụ kiện.
- Campaign chưa bắt đầu/hết hạn/hết suất; reload countdown; metadata IP sai/không có; lựa chọn thủ công vẫn ưu tiên.
- Edit/load/save/publish/retire với đúng quyền và expected_version; không mất dữ liệu khi lỗi, mở trang khác hay phản hồi upload cũ đến muộn.
- Thêm/sửa/xóa/đổi thứ tự/toggle/override/reset từng component; nháp/public/preview thống nhất về cấu hình theo chính sách nghiệp vụ. Các control đã hiển thị phải có hiệu lực.
- Gửi form hợp lệ, 422/409/429/503, retry chống trùng, success sau commit; preview không tạo lead thật.
- Header/sticky bar/cookie banner/modal/menu khi bàn phím mobile mở; không che focus/CTA; dialog có Escape, focus trap/restore, label rõ; carousel không chỉ thao tác bằng vuốt.
- Không overflow ngang ở mọi viewport, không cắt tên/giá/nhãn, thẻ thẳng hàng, media không méo.

Thêm hoặc sửa test có ý nghĩa cho behavior thay đổi; dùng bộ pytest/JS contracts/browser smoke đã có. Chụp before/after desktop/mobile, kiểm tra Chromium và WebKit nếu runtime hỗ trợ; không gọi mô phỏng WebKit là test iPhone thật. Báo rõ các kiểm tra không chạy được.

## 12. Kết quả cần bàn giao

1. Audit có bằng chứng, design brief, hierarchy và lý do CRO cho những thay đổi chính.
2. Landing hoàn chỉnh chạy được + Admin editor tùy chỉnh tương ứng; dùng đúng component và dữ liệu dự án.
3. Ma trận customization đầy đủ; danh sách trường mới, tương thích cấu hình cũ và migration nếu thực sự cần.
4. Ảnh trước/sau 320, 390, 768, 1440 px; demo thao tác Admin tạo landing và đổi nội dung/ảnh/gói/giá/liên hệ/footer.
5. Kết quả test/build/performance đã chạy, file thay đổi, vấn đề còn lại và cách mở preview local.
6. Hướng dẫn tiếng Việt ngắn: tạo landing → chọn preset → chỉnh nội dung → chọn gói/giá → thiết lập chiến dịch/liên hệ → xem trước → lưu nháp → công bố theo quyền.

Tự rà soát và sửa lỗi trong phạm vi cho đến khi đạt điều kiện nghiệm thu. Ưu tiên chất lượng thao tác, tính nhất quán và độ đúng dữ liệu. Nếu không thể kiểm chứng điểm nào, nêu chính xác giới hạn; không tuyên bố “pixel perfect”, “10/10” hoặc đã triển khai khi chưa có bằng chứng.
