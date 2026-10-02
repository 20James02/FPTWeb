# Kế hoạch triển khai Giao diện Người dùng (Frontend UI/UX) PageFPT

> **Tài liệu tham chiếu:** `KE-HOACH-WEBSITE-CLIENT-ADMIN.md`, `KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md`, `docs/backend/2026-09-30-backend-design.md`.  
> **Kiến trúc:** Python/FastAPI + Jinja2, Vanilla HTML5 / Modern CSS, JavaScript gọn nhẹ (Client: Vanilla JS; Admin: Supabase JS SDK cho Auth/Realtime), Vercel + Supabase + Cloudflare R2.

---

## 1. Mục tiêu và Nguyên tắc Thiết kế

### Mục tiêu chính
1. **Khách hàng Mobile (Client):** Tối đa hóa tỷ lệ chuyển đổi (CRO) khách có nhu cầu thực đăng ký tư vấn lắp đặt Internet/Truyền hình/Camera FPT. Tốc độ mở trang cực nhanh (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1), trải nghiệm mượt mà trên màn hình nhỏ (360px – 430px), form đăng ký thuận tiện, không giật lag, hỗ trợ lưu nháp và gửi lại khi mạng yếu.
2. **Quản trị viên / Đội ngũ Bán hàng (Admin):** Xử lý lead trong 5–10 phút (SLA), nhận lead thời gian thực (Supabase Realtime) không cần tải lại trang, giao diện CRM trực quan (Kanban & Table), bảng phân tích Intelligence minh bạch (Contact Confidence, Purchase Intent, Service Fit, Automation Risk, GeoIP ước tính), quản lý giá và gói cước theo quy trình duyệt an toàn.

### Nguyên tắc thiết kế (Aesthetic & UX Excellence)
- **Bộ nhận diện thương hiệu:** Màu sắc công nghệ cao cấp kế thừa sắc thái FPT (Cam thương hiệu `#F26F21`, Xanh công nghệ `#0066B3` / `#0B192C`, Xanh lá cây tín nhiệm `#10B981`, Nền kính mờ Frosted Glass, Dark/Light mode cho Admin).
- **Typography:** Google Font `Be Vietnam Pro` (tối ưu hóa hiển thị tiếng Việt có dấu, sắc nét, hiện đại).
- **Mobile-first:** Một cột, cỡ chữ nội dung ≥ 16px (tránh zoom tự động trên iOS Safari), mục tiêu chạm 44–48px, sticky bottom bar (Tư vấn / Hotline / Zalo), bottom-sheet modal form mượt mà.
- **Minh bạch & Trung thực:** Đơn vị tư vấn dịch vụ Internet FPT độc lập; giá và tốc độ là tạm tính/ước tính cho đến khi nhân viên kỹ thuật khảo sát hạ tầng thực tế. Không bịa đặt số lượng người đang xem ảo hay đồng hồ đếm ngược giả.
- **Bảo mật & Quyền riêng tư:** Số điện thoại khách hàng trên Admin được che (`098***1234`), chỉ người có quyền mới được bấm "Hiện số" và hành động này được ghi audit log. Không lưu số điện thoại vào localStorage phía client.

---

## 2. Kiến trúc Thư mục Frontend

```text
src/pagefpt/
├── application.py                  # Mount static files & include web routers
├── web/                            # Web routers render Jinja2 templates
│   ├── client_routes.py            # Routes cho khách: /, /san-pham/{slug}, /khuyen-mai
│   └── admin_routes.py             # Routes cho admin: /admin/login, /admin/dashboard, /admin/leads...
├── templates/
│   ├── layouts/
│   │   ├── client_base.html        # Khung giao diện Client (SEO, Header, Sticky Bar, Bottom-Sheet)
│   │   └── admin_base.html         # Khung giao diện Admin (Sidebar, Topbar, Supabase Realtime Listener)
│   ├── client/
│   │   ├── home.html               # Trang chủ Client (Hero, Chọn vùng, Gói cước, Quiz, So sánh, FAQ, Form)
│   │   ├── product_detail.html     # Chi tiết nhóm sản phẩm (Internet, Combo TV, Camera, Wi-Fi 6 Mesh)
│   │   ├── landing_page.html       # Mẫu Landing page chuyên biệt cho quảng cáo Google/FB/TikTok
│   │   └── components/
│   │       ├── header.html         # Header gọn gàng với hotline & logo
│   │       ├── footer.html         # Footer pháp lý, chính sách dữ liệu, kênh liên hệ
│   │       ├── sticky_cta_bar.html # Thanh cố định chân trang trên mobile (Call, Zalo, Tư vấn)
│   │       ├── bottom_sheet_form.html # Form trượt bottom-sheet thông minh
│   │       ├── quiz_modal.html     # Modal câu hỏi 3 bước gợi ý gói
│   │       ├── compare_modal.html  # Modal so sánh thẻ xếp dọc
│   │       └── confirmation_modal.html # Modal xác nhận sau khi gửi kèm mã Receipt
│   └── admin/
│       ├── login.html              # Trang đăng nhập Supabase Auth & xác thực MFA
│       ├── dashboard.html          # Tổng quan chỉ số KPI, biểu đồ Funnel, nguồn quảng cáo
│       ├── leads/
│       │   ├── index.html          # Danh sách Lead (Chế độ xem Bảng Table & Kanban Pipeline)
│       │   └── detail.html         # Chi tiết Lead: PII Masking, Intelligence Drawer, Timeline, Call Log
│       ├── pricing/
│       │   └── index.html          # Quản lý Gói cước, Bảng giá vùng miền, Duyệt & Xuất bản (Publish)
│       └── reports/
│           └── index.html          # Báo cáo hiệu quả kinh doanh, SLA nhân viên, tỷ lệ chuyển đổi
└── static/
    ├── css/
    │   ├── variables.css           # Design tokens: màu sắc, typography, spacing, shadows, safe-areas
    │   ├── client.css              # Stylesheet tối ưu cho Client & Mobile
    │   ├── admin.css               # Stylesheet chuyên nghiệp cho Admin Dashboard
    │   └── animations.css          # Keyframes: slide-up bottom sheet, pulse beacon, skeleton loader
    └── js/
        ├── client/
        │   ├── api.js              # Gọi API backend (/quotes, /leads với UUID Idempotency-Key, offline retry)
        │   ├── bottom_sheet.js     # Điều khiển vuốt mở/đóng bottom-sheet, trap focus, phím Back
        │   ├── quiz.js             # Logic 3 câu hỏi tư vấn gói cước phù hợp
        │   ├── compare.js          # Logic chọn và so sánh tối đa 3 gói
        │   └── analytics.js        # Đo lường hành vi tuân thủ consent (view_plan, start_form, batch events)
        └── admin/
            ├── auth.js             # Quản lý phiên Supabase Auth (Login, Token Refresh, MFA, Logout)
            ├── realtime.js         # Lắng nghe Supabase Realtime channel, hiển thị toast & cập nhật live
            ├── crm.js              # Xử lý Kanban kéo thả, bộ lọc trạng thái, ghi chú, reveal PII
            └── charts.js           # Biểu đồ lightweight vẽ SVG trực tiếp (Funnel, Doanh thu, SLA)
```

---

## 3. Các Giai đoạn Triển khai Chi tiết

### Giai đoạn 1: Nền tảng Design System, Core CSS & Templates Base
- [ ] **Task 1.1: Xây dựng Design Tokens (`variables.css`)**
  - Bảng màu: Brand Orange (`#F26F21`, `#FF7A29`), Tech Navy (`#0B192C`, `#1E293B`), Emerald Green (`#10B981`), Danger Red (`#EF4444`), Slate Gray (`#64748B`, `#F8FAFC`).
  - Font: `Be Vietnam Pro` từ Google Fonts (weights: 400, 500, 600, 700).
  - Spacing scale, border-radius (8px, 12px, 16px, 24px), shadows (soft layered elevation), safe-area insets (`env(safe-area-inset-bottom)` cho iPhone).
- [ ] **Task 1.2: Thiết lập Layout Base (`client_base.html` & `admin_base.html`)**
  - `client_base.html`: HTML5 ngữ nghĩa, thẻ Meta SEO chuẩn, Viewport chống tràn, Container cho Toasts và Modal/Bottom-Sheet.
  - `admin_base.html`: Layout 2 cột (Sidebar co giãn + Topbar thông tin phiên + Content area), hỗ trợ Dark/Light mode toggle.
- [ ] **Task 1.3: Cấu hình FastAPI Jinja2 & Static Assets Mounting**
  - Mount thư mục `/static` trong `application.py`.
  - Khởi tạo router web (`web/client_routes.py`, `web/admin_routes.py`) trả về Jinja2 templates.

---

### Giai đoạn 2: Giao diện Khách hàng Mobile-First (Client Web)
- [ ] **Task 2.1: Trang chủ Client (`client/home.html`)**
  - **Màn hình đầu (Hero Section):** Thông điệp rõ ràng "Lắp Mạng FPT Tốc Độ Cao — Wi-Fi 6 Thế Hệ Mới", 3 lợi ích cốt lõi (Lắp đặt trong 24h, Trang bị Modem Wi-Fi 6 2 băng tần, Hỗ trợ kỹ thuật 24/7), nút CTA nổi bật "Nhận tư vấn gói phù hợp".
  - **Bộ chọn khu vực (Region Selector):** Dropdown chọn Tỉnh/Thành phố hoặc Quận/Huyện; hiển thị ngay mức giá tham khảo theo khu vực được chọn, ghi chú rõ "Giá tham khảo tại khu vực của bạn".
  - **3 Nhóm nhu cầu chính:** Tab/Card lọc nhanh:
    1. *Cá nhân & Sinh viên* (Gói Giga, chi phí tiết kiệm).
    2. *Gia đình & Nhà nhiều tầng* (Gói Sky, Meta trang bị thêm Wi-Fi Mesh).
    3. *Combo Giải trí & Camera* (Internet + FPT Play 4K + FPT Camera an ninh).
  - **Danh sách gói cước (Plan Cards):** Thẻ gói cước hiện đại, badge "Bán chạy nhất" / "Đề xuất cho gia đình", thông số Download/Upload đối xứng (150Mbps - 1000Mbps), liệt kê thiết bị đi kèm, cước tháng và tổng trả ban đầu rõ ràng.
  - **Quy trình 4 bước:** Đăng ký tư vấn → Kỹ thuật khảo sát → Ký hợp đồng & Lắp đặt → Bàn giao nghiệm thu.
  - **Bảng tính chi phí ban đầu (Cost Estimator):** Minh bạch cước tháng, cước trả trước 6/12 tháng tặng kèm tháng cước, phí hòa mạng niêm yết.
  - **Đánh giá thực tế & FAQ:** Trích dẫn phản hồi khách hàng có kiểm chứng, danh sách câu hỏi thường gặp (thủ tục cần gì, thời gian lắp đặt bao lâu, chuyển địa điểm thế nào).
- [ ] **Task 2.2: Công cụ tương tác giữ chân khách**
  - **Quiz 3 bước chọn gói (`quiz_modal.html`, `quiz.js`):**
    * Bước 1: Mục đích chính (Học tập/Lướt web cơ bản, Xem phim 4K/Livestream, Chơi game/Làm việc online, Nhà thông minh/Nhiều camera).
    * Bước 2: Diện tích & Số tầng (Căn hộ < 70m², Nhà phố 2-3 tầng, Nhà nhiều tầng/Biệt thự rộng).
    * Bước 3: Số thiết bị kết nối đồng thời (< 5 thiết bị, 5-10 thiết bị, > 10 thiết bị).
    * Kết quả: Đề xuất ngay 1 gói tối ưu nhất kèm giải thích lý do, nút "Đăng ký gói này ngay".
  - **Công cụ so sánh gói (`compare_modal.html`, `compare.js`):**
    * Cho phép chọn tối đa 3 gói để so sánh.
    * Giao diện dạng card xếp dọc (không tràn ngang) phù hợp hoàn hảo với màn hình điện thoại.

---

### Giai đoạn 3: Form Tư vấn Bottom-Sheet & Luồng Gửi Lead Chống Rớt Mạng
- [ ] **Task 3.1: Form Bottom-Sheet trên Mobile (`bottom_sheet_form.html`, `bottom_sheet.js`)**
  - Vuốt mượt mà từ đáy màn hình lên khi ấn CTA "Nhận tư vấn", có thanh gạt (drag handle) để kéo xuống đóng.
  - Chỉ yêu cầu trường cốt lõi trước: Số điện thoại (bắt buộc, tự động mở bàn phím số `inputmode="tel"`), Tên khách hàng (tùy chọn), Khu vực lắp đặt (tự động điền theo lựa chọn ngoài trang chủ).
  - Phần mở rộng (tùy chọn): Địa chỉ chi tiết, Khung giờ tiện liên hệ (Giờ hành chính, Buổi tối, Cuối tuần).
  - Tự động đính kèm gói cước khách đang quan tâm và Quote Proposal đang có.
  - Giải thích mục đích sử dụng thông tin và checkbox chính sách quyền riêng tư minh bạch cạnh nút Gửi.
- [ ] **Task 3.2: Tích hợp API Lead & Khả năng chịu lỗi (`client/api.js`)**
  - Khi mở form: Gọi ngầm `/api/v1/quotes` để lấy token giá xác nhận (Quote Token).
  - Khi bấm gửi: Tạo `Idempotency-Key` (UUIDv4) ngẫu nhiên cho mỗi lượt gửi để chống tạo trùng khi khách bấm nhiều lần.
  - Xử lý mạng yếu: Nếu mất kết nối, hiển thị trạng thái "Đang thử gửi lại...", lưu dữ liệu form vào bộ nhớ tạm trong phiên (không lưu số điện thoại vào localStorage vĩnh viễn), tự động retry.
  - Honeypot chống bot tự động mà không bắt người thật phải gõ captcha khó chịu.
- [ ] **Task 3.3: Màn hình Tiếp nhận Thành công (`confirmation_modal.html`)**
  - Hiển thị Mã yêu cầu (Receipt ID).
  - Cam kết thời gian phản hồi: "Nhân viên FPT sẽ liên hệ trong 5–10 phút (trong giờ làm việc)".
  - Hai nút hành động hỗ trợ nhanh: "Gọi hotline ngay" và "Chat Zalo với nhân viên tư vấn".
- [ ] **Task 3.4: Đo lường Analytics & Consent (`client/analytics.js`)**
  - Thu thập các sự kiện hành vi: `view_plan`, `select_region`, `compare_plans`, `start_form`.
  - Gửi gộp (batch) về backend `/api/v1/events/batch` định kỳ, không làm chậm thao tác người dùng.

---

### Giai đoạn 4: Cổng Quản trị Admin — Dashboard & Quản lý Lead CRM
- [ ] **Task 4.1: Đăng nhập Admin (`admin/login.html`, `admin/auth.js`)**
  - Giao diện đăng nhập hiện đại, an toàn kết nối Supabase Auth.
  - Hỗ trợ đăng nhập Email/Password, Magic Link, và bước nhập mã xác thực 2 lớp (MFA AAL2 OTP) khi tài khoản yêu cầu.
  - Lưu phiên bảo mật, tự động refresh token khi sắp hết hạn, tự động chuyển về trang login khi hết phiên.
- [ ] **Task 4.2: Admin Dashboard (`admin/dashboard.html`)**
  - Các thẻ chỉ số then chốt (KPI Cards):
    * Tổng lead hôm nay (kèm tỷ lệ tăng giảm so với hôm qua).
    * Lead mới chưa xử lý (nhấp nháy cảnh báo đỏ nếu quá 10 phút chưa nhận).
    * Lead đủ điều kiện (Qualified leads).
    * Tỷ lệ liên hệ thành công (Contact rate %).
    * Hợp đồng đã lắp đặt hoàn tất.
  - Biểu đồ phễu chuyển đổi (Lead Funnel): Mới → Đang liên hệ → Đủ điều kiện → Khảo sát/Báo giá → Đã lắp đặt.
  - Biểu đồ phân bổ nguồn tiếp cận: Google Search, Facebook, TikTok, Zalo, Giới thiệu.
- [ ] **Task 4.3: CRM Quản lý Lead (`admin/leads/index.html`, `admin/crm.js`)**
  - **Chế độ xem kép (Dual View):**
    * *Table View:* Bảng dữ liệu phân trang cursor-based, lọc theo Trạng thái, Chi nhánh, Nhân viên, Ngày tạo, Nguồn UTM.
    * *Kanban Pipeline View:* Các cột tương ứng quy trình (Mới → Đã phân công → Đang liên hệ → Đã liên hệ → Đủ điều kiện → Khảo sát hạ tầng → Đã chốt → Đã lắp đặt; Cột riêng cho Lead thất bại: Sai số, Trùng, Không hạ tầng, Khách từ chối).
  - **Tích hợp Supabase Realtime (`admin/realtime.js`):**
    * Lắng nghe kênh thông báo lead mới.
    * Rung chuông âm thanh nhẹ + hiển thị Toast thông báo góc màn hình "Có lead mới từ Hà Nội - Gói Sky".
    * Tự động chèn thẻ lead mới vào đầu danh sách mà không cần F5 trình duyệt.
  - **Thao tác nhanh trên danh sách:**
    * Bấm gọi nhanh (mở ứng dụng gọi trên điện thoại/máy tính).
    * Phân công nhanh nhân viên phụ trách.
    * Đổi trạng thái 1 click.

---

### Giai đoạn 5: Hồ sơ Chi tiết Lead & Bảng Phân tích Intelligence
- [ ] **Task 5.1: Chi tiết Lead (`admin/leads/detail.html`)**
  - **Thông tin liên hệ & Quyền riêng tư (PII Masking):** Số điện thoại hiển thị dạng che `098***5678`. Nút "Hiện số đầy đủ" chỉ khả dụng cho nhân viên có quyền (`crm.reveal_phone`); khi bấm sẽ gọi API và ghi nhận audit log lý do xem.
  - **Thông tin nhu cầu:** Gói cước khách chọn, địa chỉ lắp đặt tự khai, khung giờ hẹn gọi, ghi chú.
  - **Quote Snapshot đã chốt:** Xem lại chính xác bảng giá, chi phí trả trước, phí hòa mạng, ưu đãi mà khách đã nhìn thấy lúc bấm gửi form (đảm bảo nhân viên tư vấn báo đúng giá không bị lệch).
- [ ] **Task 5.2: Bảng phân tích Trí tuệ (Intelligence Profile Panel)**
  - Hiển thị 4 thanh điểm trực quan theo thiết kế thuật toán của dự án:
    1. **Contact Confidence (0–100):** Thanh đo kèm các mốc xác thực (+20 cú pháp số chuẩn VN, +30 đã liên hệ thành công, +20 khách xác nhận địa chỉ).
    2. **Purchase Intent (0–100):** Đo lường mức độ quan tâm dựa trên tín hiệu hành vi (+25 đã chọn gói cụ thể, +20 đã làm quiz so sánh, +25 chọn giờ cần lắp gấp).
    3. **Service Fit (Yes / No / Unknown):** Tình trạng phù hợp về Nhu cầu, Khu vực phục vụ và Khảo sát hạ tầng kèm thanh hoàn thiện dữ liệu (Data Completeness).
    4. **Automation Risk (0–100):** Mức độ rủi ro spam/bot (cảnh báo nếu dính honeypot, gửi quá nhanh bất thường).
  - **Dữ liệu mạng & Địa lý:**
    * Tỉnh/thành ước tính theo GeoIP (ghi rõ nhãn "Ước tính từ IP mạng").
    * ASN & Tên mạng kết nối (ví dụ: Viettel 4G, VNPT, FPT Telecom).
    * Nhãn minh bạch: "Mạng truy cập chỉ phản ánh kết nối lúc gửi form, không khẳng định mạng internet đang dùng tại nhà".
- [ ] **Task 5.3: Nhật ký hoạt động & Đặt lịch hẹn (Timeline & Activity Log)**
  - Thêm ghi chú cuộc gọi: Kết quả trao đổi với khách, hạ tầng có sẵn port không.
  - Đặt lịch hẹn: Hẹn gọi lại vào giờ cụ thể, hẹn kỹ thuật đến nhà khảo sát hạ tầng; có cảnh báo khi sắp đến giờ hẹn.
  - Lịch sử thay đổi (Audit trail): Ai đã nhận lead, ai đã chuyển trạng thái, vào thời điểm nào.

---

### Giai đoạn 6: Quản trị Danh mục Gói cước & Bảng giá (Catalog & Pricing UI)
- [ ] **Task 6.1: Quản lý Gói cước (`admin/pricing/index.html`)**
  - Danh sách gói cước (Giga, Sky, Meta, Lux 500, Lux 800, F-Game, Combo Flex...).
  - Tạo mới và chỉnh sửa thông số kỹ thuật (Băng thông Download/Upload, Thiết bị Wi-Fi 6, Số lượng thiết bị tối đa).
- [ ] **Task 6.2: Ma trận Giá theo Khu vực & Quy trình Duyệt Giá**
  - Thiết lập bảng giá theo từng tỉnh/thành phố hoặc nhóm khu vực (Hà Nội, TP.HCM, Miền Bắc, Miền Trung, Miền Nam).
  - Đặt thời hạn hiệu lực `[ngày bắt đầu, ngày kết thúc)`.
  - Quy trình 3 bước: Soạn thảo (Draft) → Kiểm tra trùng lặp (Review) → Xuất bản (Publish với xác thực MFA AAL2).
  - Lịch sử các phiên bản giá và khả năng khôi phục giá cũ khi cần.

---

### Giai đoạn 7: Kiểm thử Giao diện, Tối ưu Tốc độ & Nghiệm thu
- [ ] **Task 7.1: Kiểm thử Responsive & Khả năng hiển thị thực tế**
  - Dùng `browser_subagent` kiểm tra trên nhiều độ phân giải: Mobile hẹp (360px), Mobile phổ biến (375px - 414px), Tablet (768px), Desktop (1280px+).
  - Kiểm tra form trên bàn phím ảo (bảo đảm ô nhập liệu không bị bàn phím che khuất, sticky bar ẩn khéo léo khi mở bàn phím).
- [ ] **Task 7.2: Kiểm thử Luồng nghiệp vụ Toàn diện (E2E Integration)**
  - Khách vào trang chủ → Chọn khu vực Đà Nẵng → Làm quiz gợi ý gói → Bấm "Nhận tư vấn" → Form bottom-sheet hiện lên → Điền số điện thoại → Gửi form.
  - Kiểm tra Admin: Màn hình Admin nhận được Toast thông báo lead mới ngay lập tức qua Supabase Realtime, thẻ lead xuất hiện ở cột "Mới", bấm vào xem chi tiết hiển thị đúng gói và bảng điểm Intelligence.
- [ ] **Task 7.3: Tối ưu Web Vitals & Accessibility**
  - Đo lường và tối ưu LCP (Largest Contentful Paint) ≤ 2.5s bằng cách render tĩnh khối Hero, tối ưu kích thước ảnh WebP/SVG.
  - Ngăn ngừa CLS (Cumulative Layout Shift) = 0 bằng cách khai báo kích thước cố định cho hình ảnh và card.
  - Đảm bảo độ tương phản màu chữ ≥ 4.5:1 đạt chuẩn WCAG AA.
