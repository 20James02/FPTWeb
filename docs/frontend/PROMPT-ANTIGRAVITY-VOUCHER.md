# Prompt cho Antigravity: thiết kế và đấu nối giao diện voucher

Sao chép phần dưới vào Antigravity đang mở repository PageFPT. Phạm vi là giao diện voucher và các điểm tích hợp trên client/CRM, không phải dựng lại toàn bộ backend.

---

Bạn là chuyên gia thiết kế sản phẩm, UI/UX và frontend của PageFPT. Hãy thiết kế lại chức năng voucher để người không chuyên dễ sử dụng, giao diện gọn, dữ liệu đọc rõ, chạy tốt trên mobile và desktop. Hoàn thiện cả trạng thái giao diện và đấu nối API hiện có, không chỉ tạo mockup đẹp.

Đọc trước khi sửa:

1. `AGENTS.md`, `KE-HOACH-WEBSITE-CLIENT-ADMIN.md`, `KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md`.
2. `docs/frontend/VOUCHER-LUONG-DU-LIEU-ANTIGRAVITY.md`: nguồn chính cho luồng, khoảng trống, response và semantics.
3. `docs/frontend/voucher-ui-contract.json`: request schema, route/method thật. Dùng code route/SQL làm nguồn cuối nếu có khác biệt.
4. `docs/admin/VOUCHER-KHU-VUC.md` và các file/templates/hooks được liệt kê trong tài liệu đấu nối.

Áp dụng skills đã cài nếu có: `using-superpowers`, `ui-ux-pro-max`, `fixing-accessibility`, `form-cro`, `page-cro`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`. Skill chỉ hướng dẫn quy trình, không cấp quyền production/tài khoản/gửi tin nhắn. Không cần cài thêm một framework để làm giao diện này.

## Mục tiêu và giới hạn

- Giữ Python/FastAPI + Jinja2 + HTML/CSS/JavaScript nhẹ. Không chuyển Next.js, React SPA hay backend Node.
- Giữ design tokens, font và nhận diện hiện có; ưu tiên khoảng cách nhất quán, phân cấp rõ, đường viền nhẹ, ít chữ. Không thay branding hoặc bịa chính sách FPT.
- Nâng giao diện với các API hiện có trước. Các phần tài liệu ghi “Cần BE” chỉ được thiết kế riêng trong prototype có nhãn “Cần API bổ sung”; không gắn nút giả báo thành công trong sản phẩm.
- Không sửa cơ chế tiền, quota, contact, RLS, quyền/MFA, snapshot hoặc cookie để phục vụ hiệu ứng giao diện.
- Không push/deploy/apply migration, truy cập dữ liệu khách thật hoặc gửi thông báo ra ngoài nếu chưa có yêu cầu riêng.

## A. Trang Admin Voucher & Link chia sẻ

Tổ chức thành bốn vùng dễ đọc: tổng quan, danh sách, thiết lập, link/tồn kho/báo cáo. Ưu tiên thao tác đang dùng; phần nâng cao mở khi cần.

### Danh sách

- Thanh tiêu đề + Tạo voucher, tìm mã/tên, bộ lọc UI trên dữ liệu đã tải, nút tải thêm và số mục đã tải.
- Cột mã, tên, trạng thái, ngày kết thúc, thao tác; checkbox và sort hai chiều có aria-sort. Phân biệt draft/published/paused với trạng thái thời gian từ start/end. Không gọi sort/filter toàn bộ khi backend chỉ trả 50 mục.
- Chọn hàng loạt → Tạm dừng → kết quả từng mục; dùng pause endpoint từng ID/version. Không tự tạo API bulk voucher.
- Chỉnh sửa/nhân bản rõ ràng. Nhân bản tạo bản nháp bằng POST hiện có, bắt nhập mã mới, không sao chép live/history.
- Bảng tự quản phải giữ `data-managed-list="true"` để enhancer không phá checkbox/sort.

### Wizard ba bước

1. **Ưu đãi**: mã, tên, nhãn, điều kiện; kiểu giảm/quà. Giải thích một lần/tháng và phần trăm có trần bằng văn bản ngắn. Giá trị ban đầu là trống hoặc mẫu cấu trúc, không điền khuyến mại thương mại giả.
2. **Gói & địa bàn**: checkbox gói/kỳ/dịch vụ, tìm tỉnh/xã, quy tắc mặc định, loại trừ. Cho biết xã thắng tỉnh và loại trừ thắng tất cả; thêm nhiều vùng không làm mất rule đã sửa.
3. **Thời hạn & kiểm tra**: dd/mm/yyyy theo giờ Việt Nam, quota, ngân sách; advanced chứa contact limit, giữ suất, stacking, redeem_at. Tổng hợp trước lưu/công bố.

- Cùng một draft state qua các bước. Full PUT giữ đủ fields dù advanced bị đóng.
- Desktop có preview nội dung bên cạnh, mobile mở bằng nút Xem trước. Gắn “Bản nháp”; preview không phải quote server.
- Mỗi field có label, help khi cần, lỗi inline + error summary focus được. Cảnh báo trần phần trăm 0 và điều kiện không đem lại lợi ích, nhưng không âm thầm đổi config đang có.
- Lưu và Công bố là hai bước riêng; công bố khóa khi dirty, thiếu quyền hoặc thiếu MFA. Mutation phải dùng record/version mới từ response. Giữ bản nhập khi lỗi/conflict, không tự ghi đè.

### Link và quà

- Link có target, channel, employee, slug, trạng thái; copy URL, tải QR, sửa và bật/tắt dùng API thật.
- Target kiểm tra trang công khai bằng GET pages/{slug} nếu là landing. Nêu rõ đây là kiểm tra UI; backend validation tồn tại cần bổ sung sau. Không mở trang hệ thống hoặc URL ngoài.
- Link không có trường version hiện tại; đừng tự gửi expected_version vào DTO LinkInput. Không có delete link, dùng active=false.
- Nhân viên gắn link là nguồn giới thiệu, không tự gán người phụ trách lead.
- Tồn kho: chọn phụ kiện one_time hợp lệ, tự điền stock/cost/version từ GET inventory nếu đã có. Nhãn “Tổng tồn kho”, không “Còn lại”. Không dùng giá bán làm giá vốn.
- Voucher chưa có image field. Dùng ảnh gói/phụ kiện từ nguồn public; nếu muốn ảnh voucher riêng thì ghi yêu cầu BE, không gửi image_id ngoài schema.

## B. Báo cáo trực quan

- Render sáu KPI hiện có và bar chart/bảng theo chiến dịch, kênh/nhân viên, địa bàn.
- **Không vẽ phễu requested → eligible → held → redeemed → installed**: held là stock hiện tại, installed không bắt buộc redeemed. Dữ liệu này không tạo thành phễu giảm dần.
- Ghi định nghĩa KPI ngắn qua tooltip/popover truy cập bằng keyboard. Số lượng từ report thật; cost chỉ là chi phí voucher đã dùng.
- Report chưa có query thời gian/series/revenue: không dựng filter 7 ngày hoạt động giả, line chart giả hoặc ROI từ cost. Có thể prototype riêng ghi rõ yêu cầu API.
- Skeleton/error/retry/empty có thiết kế; biểu đồ có label, đơn vị và bảng thay thế. CSV aggregate client-side chỉ lấy dataset đang tải, không giả export chi tiết/PII.

## C. Client và landing page

- Ưu đãi tự nhận qua link; chưa có mã thì chỉ hiển thị mục “Có mã ưu đãi?” gọn. Có mã thì nhãn benefit, điều kiện rút gọn, hạn thật và Bỏ mã.
- Giữ cấu trúc thẻ gói hiện có: ảnh, tên, tốc độ, giá/tháng, kỳ 1/6/12, quyền lợi/thiết bị, CTA đăng ký, chi tiết. Thẻ trong cùng nhóm đồng bộ kích thước; ảnh không méo; CTA không bị nội dung dài đẩy mất.
- Tách cước/tháng, phụ kiện một lần/theo tháng, tổng kỳ và giảm voucher. `monthly_vnd`/`initial_total_vnd` từ main quote; không tự tính lại ưu đãi rồi cộng/trừ lần hai.
- Đổi địa bàn/kỳ/phụ kiện/mã phải refresh quote server và bỏ response cũ. `billing_options` là preview không có token, đã gồm phụ kiện và kiểm tra quà trùng thiết bị; khi đổi kỳ phải lấy main quote mới trước dùng tổng tiền/token.
- `voucher.status=eligible` là ưu đãi dự kiến; không ghi “Đã giữ quà” khi khách chỉ mở link. Gift trùng thiết bị trả phí cần người dùng bỏ chọn rõ ràng, không tự xóa phụ kiện.
- Form chỉ Tên/Số/Địa chỉ cụ thể, thông tin gói được giữ từ CTA; consent theo luồng sẵn có. Không bắt nhập mã hoặc chọn xã trước khi gửi.
- LeadRequest **không có billing_months**. Dùng quote_token/notes hiện có và `submitLeadToBackend`; retry giữ body/key, chỉ báo thành công sau receipt/event_id thật.
- POST context có thể 200 nhưng voucher=null. DELETE context là 204: không parse JSON. Paused/expired có thể has_context=true và phải bỏ mã được.
- Không đọc cookie HttpOnly, không lưu PII/tokens vào localStorage, không đưa PII vào analytics. Không bật tracking khi khách từ chối.
- Không bịa số người xem, stock, giá hay countdown. Countdown chỉ từ end thật, mô tả đúng trạng thái và không thay server eligibility.

## D. Hồ sơ khách và nhân viên

- Voucher panel ngắn: mã/ưu đãi/quà, kỳ/tổng, trạng thái/hạn giữ; điều kiện chi tiết trong popup.
- Checklist trước giữ: quyền/scope → địa chỉ xác nhận → profile và deal khớp → quoted/closed/installed → giữ. Link mở đúng form profile/billing/trạng thái hiện có.
- Địa chỉ dùng province_code/ward_code dạng integer; voucher rule dùng UUID region_id. Không suy ra xã từ IP và không đổi phone.
- Reserve dùng lead.version. Redeem/release dùng redemption.version + reason. Billing PUT dùng deal.version, không lead.version. Inventory PUT dùng inventory.version (0 nếu mới).
- Snapshot đang held: release trước sửa địa chỉ/gói/phụ kiện/kỳ hoặc confirm quote khác. Redeemed không có API undo; không dựng nút hoàn suất.
- Reload detail một lần sau success; panel trong initLeadDetail; khóa controls lúc lưu, giữ input khi lỗi, fence theo lead ID/generation.

## E. Chất lượng và nghiệm thu

- Responsive 320/360/390/430/768/1024/1440px và landscape; không scale cả trang để ép vừa màn hình. Mobile các thanh action gọn, không che nội dung/focus.
- Controls ưu tiên 44px, input rõ, focus ring, label thật, contrast; Tab/Enter/Space/Escape, screen-reader announcements, reduced-motion.
- Thiết kế đủ loading/empty/error/retry/permission/MFA/version-conflict/quote-stale/paused/expired/sold-out/gift-unavailable/no-benefit/invalid-link-target.
- Giữ helper adminFetch và CSRF, helpers quyền/Auth, PageFPTDates, PageFPTVoucher, PageFPTAccessories, region/quote/form hooks. Nếu đổi selector phải cập nhật code và tests toàn bộ; không có hai submit listeners hoặc hai banner.
- Smoke không gửi notification/conversion QA ra production. Dùng fixtures. Lệnh/tests và runtime xem workflow hiện có; không tự cài package chỉ để sửa hình thức.
- Chạy kiểm tra phù hợp: voucher Python tests, JS contracts, browser vouchers/reference_cards/landing_studio/home_mobile/admin_list_tools khi phần liên quan thay đổi. Báo đúng exit code và hạn chế Safari/mobile thật chưa kiểm chứng.

Đầu ra cần bàn giao: giao diện hoạt động với API hiện có; bảng component → endpoint → payload → response/error; ảnh desktop/mobile; danh sách yêu cầu BE riêng cho tính năng chưa có; kết quả kiểm thử. Không báo “10/10” chỉ vì màn hình đẹp hoặc mockup đã hoàn thành.

---

Các phần cần BE đã nêu rõ trong tài liệu luồng. Nếu phát hiện khác biệt mã nguồn, cập nhật tài liệu/contract và báo cụ thể trước khi dùng dữ liệu giả để lấp khoảng trống.
