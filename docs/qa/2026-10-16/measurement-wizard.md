# Form đo lường theo bước, liên kết sự kiện và chẩn đoán kết nối

Ngày: 16/10/2026. Baseline `128d301`.

## Phạm vi và hành vi

- Form kết nối gồm 3 bước; form cấu hình gồm 4 bước. Kiểm tra ô bắt buộc, cho quay lại, tóm tắt trước khi lưu. ID được giải thích tại chỗ, nhập token riêng phía máy chủ.
- Liên kết 16 hành vi website và 4 kết quả CRM (20 nguồn); tối đa 100 đích/sự kiện. Preset GA4 tạo 17 liên kết browser còn thiếu, không thêm trùng hoặc tự công bố.
- Danh sách kế thừa được thu gọn/ẩn để tránh hiểu rằng ô chưa đánh dấu là đã tắt. Dòng liên kết mở/thu gọn; trường Ads label/action chỉ hiện theo đích/phương thức.
- Hành vi không được dùng tuyến server, primary, giá trị doanh thu hoặc đổi tên thành các sự kiện form/CRM dành riêng. Form phải có receipt thật; CRM phải có chuyển trạng thái thật.
- GA4 đổi tên hành vi thay vì gửi thêm bản sao. Ads/Meta có bridge cho các hành vi được bật, dùng lựa chọn dữ liệu hiện có. Page view quảng cáo giữ ID riêng trong một trang, thử khi quyền quảng cáo được cấp và chống trùng với lần observer/config refresh.
- Chẩn đoán trả từng lớp cấu hình, token, nguồn và báo cáo. Đọc API có timeout/host cố định; lỗi được chuẩn hóa, không trả token hoặc phản hồi provider thô. Không gửi conversion giả để thử.
- Mô phỏng dùng đúng môi trường/phạm vi, sự kiện, consent, phương thức và trạng thái GA4; phân biệt tín hiệu hạn chế của Advanced. Công bố chỉ bật sau mô phỏng thành công, thay đầu vào thì yêu cầu chạy lại. Backend vẫn kiểm tra quyền/phiên bản/cấu hình.
- Không đổi schema Supabase hoặc tự sửa các bản công bố/tài khoản quảng cáo thật. JSON rules, RPC và RLS hiện có tiếp tục được sử dụng.

## Kiểm chứng

- Toàn bộ Python: **632 passed** trong 272,91 giây. Sau đó thêm guard không cho đổi tên hành vi thành `generate_lead` và kiểm tra riêng toàn bộ nhóm setup: **13 passed**.
- Bộ integration đo lường trước bổ sung ca Advanced: **64 passed**. Các ca mới kiểm tra đọc GA4 Admin/Data API riêng, API thiếu quyền, thiếu token không giả connected, quyền truy cập, behavior không tạo occurrence CRM và mô phỏng đúng native GA4.
- JavaScript: **31/32** nhóm contract thành công; nhóm mới `measurement_behavior` và các ca GA4 alias/consent thành công. Lỗi duy nhất là `speed_cards_details.mjs` trên baseline người dùng đã thay popup gói cước; source/test gói cước không thuộc thay đổi này, không sửa kỳ vọng để che lỗi.
- E2E đo lường hiện có: tạo/sửa kết nối/cấu hình, mô phỏng/công bố/khôi phục, chi phí/báo cáo, hàng loạt và 4 viewport thành công.
- E2E wizard mới: kiểm tra bước bắt buộc, cảnh báo API thật từ fixture, preset 17 sự kiện không trùng, Meta Zalo/CRM, bỏ kế thừa không bị rule ẩn cản, gate mô phỏng và 19 đích được công bố đúng. **5 kích thước** 360/390/430/768/1440 × **2 theme**; không tràn ngang, không có lỗi JS. Đã xem ảnh mobile sáng và desktop tối.
- E2E GA4 client: kiểm tra 9 route, loại Admin, gửi một conversion theo receipt thật của fixture; transport ra ngoài bị chặn trong QA.
- Ruff, mypy 128 file, architecture 128 module, Node syntax check và `git diff --check` thành công. Xuất lại hợp đồng frontend sau thêm endpoint/enum.
- Review độc lập phát hiện page view sau consent và mô phỏng Advanced; đã tái hiện bằng test thất bại, sửa, kiểm tra lại. Ca rule kế thừa bị ẩn cũng có hồi quy browser; review xác nhận không còn phát hiện quan trọng.
- Bản Vercel thử `https://fpt-9hqevuvy3-pettravel.vercel.app`: build READY; 6 asset wizard/runtime khớp, health thành công, Admin và diagnostics vẫn yêu cầu xác thực, GA4 production đang công bố giữ nguyên.

## Giới hạn kết luận

Kiểm tra đọc tài khoản hoặc metadata không chứng minh đã nhận/phân bổ conversion. `delivery_verified` của chẩn đoán luôn false. Cần dùng GA4/Tag Assistant/Meta Test Events và tài khoản thật để xác nhận nhận sự kiện. Chưa thực hiện gửi chuyển đổi thử hay tạo lead giả trên production.

Evidence nội bộ không đưa lên Git: `.local/qa/measurement-wizard-20261016/`. Hướng dẫn vận hành: `docs/operations/TRUNG-TAM-DO-LUONG.md`.
