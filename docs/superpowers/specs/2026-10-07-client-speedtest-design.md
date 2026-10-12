# Công cụ đo tốc độ client

Yêu cầu: công cụ tương tự trải nghiệm đồng hồ Ookla, có đầy đủ chỉ số có thể đo, hiệu ứng mượt, mở từ navbar, danh sách gói đề xuất ở bên dưới. Giữ FastAPI/Jinja2; không dùng thương hiệu Ookla hoặc ngụ ý dùng hạ tầng của Ookla.

Trang `/do-toc-do` dùng header/footer/form tư vấn hiện có. Đồng hồ tối màu với vòng cung cyan khi download, violet khi upload, CTA màu thương hiệu; mẫu tốc độ vẽ SVG, bảng ping/jitter và độ trễ khi tải. Chỉ số chưa đo dùng dấu gạch và giải thích, không số giả. Hiệu ứng chỉ nội suy giữa các mẫu thật, tắt chuyển động không thiết yếu khi reduced motion.

Dùng `@cloudflare/speedtest` 1.14.1 MIT, vendor cục bộ và lazy import sau bấm bắt đầu. Cloudflare công bố hai endpoint __down/__up và Timing-Allow-Origin; đã kiểm tra CORS cho origin website. Auto start tắt, result logging tắt; chỉ truyền dữ liệu thử, không gửi số điện thoại/địa chỉ khách. Trước nút có nội dung cho biết dữ liệu đo đi tới Cloudflare và lượng truyền khoảng 60 MB tối đa trong lượt đo thông thường; máy chủ vẫn nhìn thấy IP. Không lưu kết quả/IP ở server, localStorage hoặc quảng cáo.

Đo 12 ping rồi download và upload ramp 100 KB → 1 MB → 10 MB: download 2/3/3 mẫu, upload 2/3/2 mẫu; tổng payload thông thường tối đa56.4 MB. Threshold dừng sớm1000 ms; timeout mỗi bandwidth request10 giây, tổng lượt60 giây. Có hủy, retry bằng lượt mới, dừng khi rời trang/offline/ẩn tab. Dùng phase callback SDK để cập nhật tiến trình; không bịa phần trăm thời gian. Kết quả download/upload Mbps, median ping, jitter và loaded ping/jitter do SDK tính; thêm min/max ping, số mẫu, thời gian, dung lượng thử từ mẫu SDK. Không đo packet loss khi chưa có TURN; hiển thị lý do thay cho0%.

Metadata lấy sau tương tác qua hai request nhỏ, chỉ hiển thị header công khai có sẵn (IP, ASN, colo, quốc gia/thành phố); thiếu dữ liệu ghi không xác định. Không suy ASN thành tên nhà mạng hiện tại; vị trí IP là ước tính. Không lấy GPS hoặc thu thập dấu vân tay.

Gói đề xuất lấy catalog đang công khai, chỉ internet/combo/business và lọc phạm vi tỉnh/xã khách chọn. Chọn tối đa3 gói: nếu có kết quả hoàn chỉnh, ưu tiên băng thông niêm yết cao hơn download đo15%, sau đó các gói khác; sắp xếp tốc độ tăng và tên/mã ổn định. Nếu thiếu kết quả, hiển thị gói tham khảo tốc độ tăng. Giá qua `/api/v1/quotes` hiện có, chọn vùng→tỉnh→xã theo nguồn geography hiện có; thiếu/không có giá giữ cần tư vấn. Gói không cung cấp tại địa bàn không được đề xuất. CTA mở form với đúng plan_id; không kết luận nhà mạng hiện tại kém hoặc cam kết tốc độ thực đạt băng thông niêm yết.

Màn hình360/390/768/1024/1440; phóng chữ, bàn phím, dark panel có tương phản, nút tối thiểu44px. Không tải SDK/network đo khi chỉ mở trang/home. Kiểm thử số học/model, trang SSR, real SDK qua network fixtures, hủy/lỗi/stale response/offline, geo/quotes/CTA, responsive và một lượt Cloudflare thực trong browser.

Nguồn: [Cloudflare SDK](https://github.com/cloudflare/speedtest), README/types/source trong package1.14.1 đã kiểm tra; backend giữ nguyên Vercel/Supabase/R2.
