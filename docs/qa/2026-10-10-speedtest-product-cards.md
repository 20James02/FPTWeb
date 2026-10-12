# Thẻ gói tại trang đo tốc độ — UI/UX và chuyển đổi

Ngày kiểm tra: 10/10/2026, Asia/Ho_Chi_Minh.

## Mục tiêu và phạm vi

Thiết kế lại thẻ gói đề xuất trên `/do-toc-do` để khách đọc nhanh, hiểu giá và mở tư vấn theo đúng gói. Giữ engine đo, thuật toán xếp hạng, báo giá theo địa bàn và luồng xác nhận form. Áp dụng UI UX Pro Max và page-cro cho nhu cầu thực tế của PageFPT; không chuyển framework, không thêm thư viện.

## Đánh giá cấu trúc chuyển đổi

Điểm chẩn đoán theo rubric page-cro, giới hạn ở khu vực thẻ gói đề xuất. Đây là nhận định thiết kế, không phải tỷ lệ chuyển đổi hoặc cam kết tăng doanh số.

| Tiêu chí | Trước | Sau | Tối đa |
|---|---:|---:|---:|
| Giá trị/lợi ích rõ ràng | 17 | 22 | 25 |
| Mục tiêu chuyển đổi | 14 | 18 | 20 |
| Nội dung khớp ý định đo mạng | 11 | 13 | 15 |
| Thông tin có cơ sở, tạo tin cậy | 10 | 12 | 15 |
| Giảm khó thao tác và đọc trên mobile | 9 | 13 | 15 |
| Giải thích giá/thiết bị/điều kiện | 6 | 8 | 10 |
| Tổng | 67 | 86 | 100 |

Trước: thiếu ảnh dự phòng, nhãn cấu hình Admin chưa được dùng, giá và kỳ/tổng dồn trong đoạn dài; danh sách một/hai gói vẫn dành ba cột desktop. Sau: phân cấp rõ ảnh → tên/nhu cầu → tốc độ/giá → lý do tham khảo → thiết bị → CTA; danh sách ít gói căn giữa.

Hook theo dịch vụ: gia đình/học tập/làm việc, nhiều nhu cầu kết nối, kết nối kinh doanh. Sau đo, tiêu đề “Đo xong. Chọn gói dễ hơn.” và badge download nối việc đo với bước chọn gói. Thẻ đầu của xếp hạng có nhãn “Gợi ý từ kết quả đo”, không gọi là tốt nhất hoặc hứa bảo đảm tốc độ.

## Giao diện và cấu hình

- Thẻ cao 700px, vùng ảnh 30%, full khung; ảnh không méo. Thiếu ảnh dùng minh họa thiết bị Internet.
- Desktop ba cột; tablet hai; mobile một. Một/hai gói desktop có chiều rộng tối đa 440/840px và căn giữa. Điều kiện công bố/địa bàn tiếp tục quyết định gói nào hiển thị.
- Nền sáng, viền xanh; thẻ gợi ý theo phép đo được nhấn cam. CTA tương phản rõ; thao tác tối thiểu 44px; không dịch vị trí CTA khi hover. Tôn trọng reduced motion.
- Tên dài hiển thị hai dòng, popup đọc đầy đủ. Thiết bị dài cuộn riêng, có focus bàn phím; popup có mô tả và toàn bộ thiết bị.
- Nhãn badge/speed/equipment/register/details lấy từ `card_labels` của gói đã công bố. Giữ ảnh và thông tin do Admin quản lý.
- Giá tách số tiền, đơn vị, loại giá và ghi chú VAT/kỳ/tổng ban đầu. Trang này tiếp tục dùng báo giá kỳ 6 tháng như trước; không thêm lựa chọn kỳ mới trong yêu cầu này.
- Giá tháng không xác định không biến thành 0đ trong popup. Quote không hợp lệ/hết hạn không hiển thị như giá xác nhận. Đổi địa bàn bỏ giá cũ.
- Quote xác nhận được chia sẻ với lớp quote hiện có để popup khớp thông tin giá. Đăng ký vẫn giữ mã gói và xác nhận lại quote qua backend.
- Không thêm ưu đãi, số người xem, số lượng còn lại hoặc bằng chứng khách hàng không có dữ liệu.

## Kiểm chứng

- Python toàn bộ: **377 passed**, 99.61s. Sau chỉnh cuối phần HTML danh sách: 3 kiểm thử trang đo tốc độ đạt. Log `.local/qa/speed-cards-pytest-full.txt`, `speed-cards-targeted-final.txt`.
- Node toàn bộ: **34 passed**, 0 failed. Có giá 0 hợp lệ, null tháng/tổng trả trước, giá âm/sai kiểu/hết hạn, nhãn gợi ý chỉ sau đo và hồi quy popup không hiển thị null thành 0đ. Log `.local/qa/speed-cards-node-final.txt`.
- Red/green được quan sát cho nhãn/ảnh dự phòng, helper giá, popup null tháng và bố cục một/hai gói.
- Chromium và WebKit: **320, 375, 390, 768, 1024, 1440px**. Ba thẻ cùng cao/rộng trong mỗi bố cục; ảnh 30%; CTA thẳng hàng desktop; không tràn ngang. Tên dài, ảnh có/thiếu, giá tháng/trả trước, popup và lựa chọn gói đạt. Một/hai gói căn giữa và không để cột rỗng. Dữ liệu SQL và transport báo giá trong QA là tổng hợp.
- Hồi quy speedtest Chromium với cấu hình production đầy đủ, payload tối đa 10MB: đạt; engine, mẫu đo, metadata, báo giá, CTA, hủy/lỗi/retry/đổi địa bàn/history/chuyển tab, responsive. Transport Cloudflare/RIPE được mô phỏng, không phải đo mạng khách thật.
- Ruff và Prettier các file liên quan đạt.

## Production

- Website: https://fpt-vungtau.com/do-toc-do.
- Deployment: `dpl_CYDcfnBwnAkBUi6MV42abWzbGzzL`, Ready; domain xác nhận đúng deployment.
- Candidate https://fpt-kaxmyz0fl-pettravel.vercel.app: **71 kiểm tra** đạt trước promote.
- Domain sau promote: **73 kiểm tra** đạt, SHA256 tài nguyên JS/CSS cập nhật khớp source.
- Chromium domain thật: ảnh/nhãn đã công bố, bố cục 320/390/768/1440px, popup và mở form đúng gói đạt. Catalog hiện có một gói phù hợp loại dịch vụ; danh sách một thẻ căn giữa.
- Kiểm tra live không gửi lead, không chạy truyền tải speedtest và chặn Google transport. Địa bàn được bỏ chọn cục bộ trong phiên QA để kiểm tra trạng thái chưa xác nhận giá, không đổi cấu hình Admin hoặc dữ liệu hệ thống.
- Bằng chứng `.local/qa/speed-cards/live-report.json`; screenshot QA/live trong `.local/qa/speed-cards`. Các file .local và test fixtures không đưa lên Vercel.
- Không thay đổi Supabase schema; không push cây Git đang có nhiều thay đổi từ các yêu cầu trước.

## Theo dõi hiệu quả

Giả thuyết: tách giá/đơn vị và làm rõ lý do gợi ý giúp khách mở form đúng gói dễ hơn; popup giảm câu hỏi về giá, kỳ và thiết bị. Dùng `form_open`, `form_start`, `generate_lead` sẵn có để xem tỷ lệ mở form/gửi lead trên `/do-toc-do` khi khách đồng ý đo lường. Đối chiếu chất lượng lead trong Admin trước khi kết luận hiệu quả kinh doanh. Chưa có baseline hoặc thử nghiệm thực địa đủ để khẳng định tăng tỷ lệ chuyển đổi; chưa triển khai A/B.
