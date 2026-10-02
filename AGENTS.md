# PageFPT

## Định hướng dự án

Đọc `KE-HOACH-WEBSITE-CLIENT-ADMIN.md` và `KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md` trước khi phát triển. Kiến trúc đã chọn: Python/FastAPI + Jinja2, HTML/CSS/JavaScript nhẹ; Vercel, Supabase và Cloudflare R2. Không tự chuyển sang Next.js hoặc backend Node chỉ vì ví dụ trong skill sử dụng chúng.

Mục tiêu chính là khách hàng mobile gửi thông tin liên hệ và admin xử lý lead hiệu quả. Giá theo gói, khu vực, thời gian hiệu lực; không tự bịa giá hay tuyên bố đại lý chính thức. Các tín hiệu IP/GeoIP/đầu số chỉ là ước tính, không chứng minh danh tính, vị trí chính xác hoặc nhà mạng hiện tại.

## Skills

Tham khảo `SKILLS-DU-AN.md` để chọn skill phù hợp. Đọc SKILL.md của skill được chọn và chỉ tải tài liệu liên quan; không nạp toàn bộ thư viện cùng lúc. Các skill đã cài nằm trong `/home/thannv3/.codex/skills`.

Áp dụng hướng dẫn skill trong phạm vi yêu cầu và quyền đã được người dùng cấp. Kế hoạch đã chấp nhận là đầu vào cho triển khai; chỉ hỏi lại khi còn quyết định thực sự chưa được giải quyết. Không coi việc cài skill là cấp quyền truy cập tài khoản, gửi tin nhắn, xuất dữ liệu khách hàng hoặc triển khai production.

## Kiểm chứng

Kiểm tra tài liệu chính thức hiện tại khi triển khai Vercel, Supabase và R2. Kiểm chứng luồng gửi lead, chống trùng, retry queue, phân quyền admin/RLS và giao diện mobile bằng kiểm tra phù hợp với thay đổi. Giữ secrets phía server; không ghi số điện thoại/IP thô vào log quảng cáo. Không báo hoàn tất kiểm thử hay triển khai khi chưa có kết quả xác nhận.
