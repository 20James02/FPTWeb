# Tự gợi ý địa bàn và cập nhật bảng giá

Phạm vi được người dùng yêu cầu: tự điều chỉnh bảng giá khi phát hiện vị trí từ IP. IP chỉ là ước tính tỉnh/thành, không đủ xác nhận xã/phường hay địa chỉ lắp đặt. Tiếp tục dùng FastAPI/Jinja2 và luồng báo giá hiện có.

1. Kiểm thử rồi thêm GET `/api/v1/regions/location-suggestion`: chỉ tin proxy Vercel đã cấu hình; địa chỉ công cộng hợp lệ; ưu tiên metadata Vercel, dự phòng MMDB cục bộ. Không lấy IP từ body/query, không ghi sự kiện phân tích hay gọi Supabase, không cache dùng chung. Dữ liệu ISO được đối chiếu qua tên CLDR; không tự suy diễn tỉnh sau sáp nhập.
2. Kiểm thử rồi bổ sung luồng `regions.js`: đối chiếu duy nhất tỉnh đã công bố, cho phép bí danh Admin; tự cập nhật báo giá qua hàm sẵn có. Ưu tiên lựa chọn đã lưu/thủ công, chặn kết quả đến muộn, không tự chọn xã/phường từ IP, không tự gọi quyền GPS. Giá mặc định hiện có vẫn dùng được khi thiếu tín hiệu.
3. Thêm thông báo ngắn về vị trí ước tính trên trang chủ, landing và trang đo mạng; giữ quyền chọn tỉnh/xã của khách. Không tự lưu gợi ý IP thành lựa chọn được xác nhận.
4. Kiểm tra Python, hợp đồng JS, trình duyệt mobile/desktop với dữ liệu giả, tài liệu API. Chưa triển khai production trong yêu cầu này.

Các ca cần bảo vệ: metadata giả ở upstream không tin cậy; IP riêng/malformed; nước ngoài; mã ISO khác mã hành chính Việt Nam; nhiều địa bàn trùng bí danh; địa bàn chưa công bố; lỗi/timeout; lựa chọn thủ công trong khi đang tra; xã đã lưu; landing preview; không lấy tọa độ IP để chọn xã gần nhất.

Rà soát độc lập bổ sung: khôi phục lựa chọn khi Back/BFCache giữa lúc đang tải xã; giữ ý định xã đã lưu chưa tải xong, không chuyển gợi ý IP thành lựa chọn xác nhận. Hai lỗi đã được tái hiện bằng kiểm thử thất bại trước khi sửa và kiểm tra lại đạt. Bổ sung xã/phường cho landing dùng đúng luồng giá chung; thêm thông báo ước tính cho trang đo mạng.
