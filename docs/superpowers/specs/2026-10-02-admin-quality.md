# Nâng cấp chất lượng Admin

Mục tiêu: đạt đủ tiêu chí nghiệm thu cho CRM, giá/địa bàn, báo cáo, marketing/vận hành, quyền và mobile. Điểm 10 là mục tiêu đánh giá; không tự cấp điểm khi chưa có chứng cứ cloud và người vận hành.

Giữ Python/FastAPI/Jinja2, API hiện có, CAS, scope chi nhánh, MFA, PII mã hóa và migration thêm mới. Không triển khai production hoặc gửi quảng cáo/tin nhắn thật. Không tạo giá thương mại, tên nhân viên, KPI hoặc trạng thái kết nối giả.

Nghiệm thu:
- A01/A05: cấu hình SLA/chuông có API và version; SLA áp dụng thực; profile/capabilities lấy dữ liệu thật; không toast thành công khi chưa lưu.
- A02/A03: mọi trạng thái xuất hiện trong Kanban; tìm/lọc server; polling giữ bộ lọc và số trang, có trạng thái lỗi và cập nhật đúng màn.
- A04: HTML Admin có auth/permission ở mọi môi trường; public preview vẫn giữ gate.
- A06/A07/A09: tên gói/địa bàn/nhân sự trong DTO scoped, quote chi tiết, lý do score có trọng số và nguồn, điểm/100, card mobile và vùng bấm >=44px.
- A08: daily metrics chung với worker, ngày Việt Nam; báo cáo theo kỳ/campaign/chi nhánh và chi phí/CPL có định nghĩa.
- A10: màn campaign/experiment/integration/promotion/page/media; jobs/retry/export/audit/membership có API, quyền và lỗi rõ ràng.
- Giá/địa bàn: giữ publish/hiệu lực/VAT/bulk/import API; hỗ trợ nhân bản nháp và xem trước quote.
- Kiểm thử: SQL PostgreSQL thật; API scope/CAS/filter/cursor; JS regression; browser mobile; nguồn hợp đồng cập nhật.

Gate ngoài local: hosted Auth/MFA, R2 upload/export, Vercel deploy, worker lịch chạy, số liệu campaign và khảo sát nhân viên. Chỉ đánh dấu đã xác minh khi có kết quả thật.
