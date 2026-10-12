# Quản trị tài khoản và phân tích — kế hoạch triển khai

Mục tiêu: hoàn thiện các luồng hiện có bằng Python/FastAPI, Supabase Auth và giao diện Jinja/JS nhẹ. Thực hiện trực tiếp theo yêu cầu tiếp tục của người dùng; giữ toàn bộ thay đổi trước đó.

1. Tài khoản cá nhân: trang cho mọi nhân viên đang hoạt động; xem email, mức xác thực; đăng ký TOTP bằng QR/mã nhập tay, xác minh sáu số, thêm thiết bị dự phòng, hủy đăng ký chưa xác minh và chỉ xóa thiết bị đã xác minh khi còn thiết bị dự phòng. Nâng AAL2 phải lưu token mã hóa qua lease phiên hiện có. Đổi mật khẩu yêu cầu xác thực mật khẩu hiện tại, giữ MFA, thu hồi các phiên khác.
2. Nhân viên: quản trị có identity.manage và AAL2 tạo tài khoản bằng email/mật khẩu ban đầu, tên/chi nhánh/vai trò; không gửi email hoặc Telegram tự động. Quyền được kiểm tra trước thao tác Auth và trong transaction SQL. Sửa quyền/ca làm/công suất/kích hoạt sử dụng API membership hiện có; bổ sung mẫu quyền tiếng Việt và thông tin email. Bảo vệ chủ hệ thống cuối cùng bằng khóa transaction, kiểm tra mọi target; thu hồi phiên khi quyền bị thay đổi.
3. Phân tích: API tổng hợp theo cohort ngày tiếp nhận ở Asia/Ho_Chi_Minh, giới hạn 93 ngày, theo chi nhánh/campaign. Trả chuỗi ngày đầy đủ, số lượng theo trạng thái/nguồn/gói/chi nhánh, SLA tồn và phễu. Không trả điện thoại/IP. Biểu đồ SVG thời gian, thanh phân bố và phễu có số liệu, chú giải, bảng thay thế; bộ lọc dùng chung cho tất cả biểu đồ. Chi phí vẫn dùng báo cáo campaign hiện có; phân biệt thiếu chi phí với bằng 0.
4. Client: chờ giải thích placeholder; mặc định giữ mẫu trong Admin và client chỉ hiện nội dung đã công bố.
5. Kiểm chứng: test SQL thật cho phạm vi branch/last-owner/revoke, HTTP fixture cho MFA/CSRF/token và tài khoản; browser desktop/mobile/dark/empty/error/keyboard; ruff/mypy và hồi quy toàn bộ. Sau kiểm chứng mới áp dụng migration cloud, kiểm tra RLS/advisors, triển khai candidate và xác nhận domain.

Không bật MFA hay thay mật khẩu tài khoản thật thay người dùng; chủ tài khoản phải quét QR bằng thiết bị của mình. Không tạo nhân viên thật khi chưa có dữ liệu đầu vào.
