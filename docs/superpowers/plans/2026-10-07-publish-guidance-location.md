# Hướng dẫn công bố giá và vị trí khi đo mạng

Yêu cầu: xác định lỗi không công bố gói/giá; xin quyền vị trí để gợi ý địa bàn và gói cước khi đo mạng, từ chối vẫn đo.

Chẩn đoán: production có GiGa draft, 34+ bản giá draft liên kết; lỗi INVALID_PLAN khi công bố giá là quy tắc gói phải published trước. Auth detailed user có TOTP verified; không thay quyền, không tự công bố nội dung của khách. Danh sách Auth users không trả factors đầy đủ, phải kiểm tra detailed user.

Thiết kế: giá draft thuộc gói draft có nút “Công bố gói trước” chuyển đúng tab/gói; lỗi API giữ code và có hành động phục hồi. API vẫn kiểm tra published/MFA/CAS như cũ.

Speedtest: native geolocation chỉ gọi sau nút bắt đầu, không đợi quyết định để đo. Từ chối/timeout/unsupported không ảnh hưởng phép đo. Coordinates chỉ trong bộ nhớ; gọi BigDataCloud client reverse-geocode trực tiếp sau đo hoàn tất để không làm nhiễu ping; không lưu/backend/analytics. Nguồn chỉ gợi ý, đối sánh tên duy nhất với danh mục tỉnh/xã published, không fuzzy hoặc tự bịa ID. Chỉ áp dụng sau khách xác nhận “Dùng địa bàn gợi ý”, dùng quote/CTA hiện có. Không ghi đè lựa chọn thủ công. Hủy/rời/ẩn tab/offline fence response trễ.

Nguồn hiện tại đã kiểm tra: MDN getCurrentPosition, BigDataCloud free client reverse geocode/Fair Use, Supabase MFA. BigDataCloud không cần key, chỉ browser và current device coordinates theo standard Geolocation; không gọi bằng fake coordinates ra dịch vụ thật. Fixture browser intercept external API.

- [x] Browser red/green giá draft → nút hướng dẫn → công bố gói → công bố giá → quote xác nhận; không thay production state.
- [x] Contract red/green đối sánh tỉnh/xã, ambiguous/unknown/outside VN, thiếu chính xác giữ lựa chọn thủ công.
- [x] Browser red/green xin quyền chỉ sau start; denied/timeout vẫn đo, granted → gợi ý → apply → giá/đúng gói; reverse lookup sau phép đo, stale/cancel không hồi sinh.
- [x] Full Python/JS, lint/type, mobile và hồi quy speedtest; documentation; Vercel candidate/live/auth/hash/denied-mode browser.

## Yêu cầu tiếp: kiểm tra trang con navbar

Chẩn đoán bằng mã và browser: liên kết doanh nghiệp đang mở trang gia đình; trang dịch vụ lấy gói đầu tiên, và CTA khi catalog rỗng mất ngữ cảnh camera/combo. Slug không tồn tại trả trang Internet (200).

Thiết kế giữ Python/Jinja2: năm trang dịch vụ Internet gia đình, doanh nghiệp, FPT Play, combo, Camera; liên kết nội dung có anchor thật, giữ placeholder quản trị. Mỗi trang hiển thị tất cả gói published đúng loại, địa bàn và quote hiện có; CTA tư vấn chung không tự chọn gói, CTA gói giữ ID; form dùng đúng loại dịch vụ kể cả CTA dùng chung. Không tạo giá/gói production. CSS route-only, cùng tokens, ảnh minh họa đã có, kích thước mobile và focus/nhãn. Slug lạ trả 404. Kiểm tra Khuyến mãi, Smart Home, FAQ và speedtest cùng navbar.

- [x] Kiểm thử red/green route/type/catalog/404, toàn bộ liên kết/anchor navbar, 5 viewport, CTA/mobile/giá và screenshot review.

Kiểm chứng hiện tại: 302 Python; 14 JS contract files; 53 kiểm thử giao diện cuối; navbar 22 internal links/40 viewport checks; 4 native permission scenarios và 3 lifecycle contract cases; publish workflow SQL cô lập; hồi quy speedtest hai motion modes và navigation. Review cuối không còn finding đáng kể. Vercel attempt đầu Not authorized; retry sau kiểm tra phiên owner đã được chấp nhận tạo candidate, đang build/kiểm tra. Không thay schema hoặc dữ liệu kinh doanh.

Release hoàn tất: candidate dpl_62Yv1VJzAkoEpWRrVsUdjJCGeGyT READY, 35 candidate checks; promote thành công, inspect domain đúng ID/READY; 37 live HTTP/auth/SHA checks, Chrome live 22 links/10 viewports/5 service contexts và một phép đo Cloudflare native-denied hoàn tất, không geocode, không lỗi JS.
