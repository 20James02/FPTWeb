# Triển khai sau kiểm toán 10/10/2026

Đầu vào đã được duyệt: docs/reviews/2026-10-10-project-audit-data-algorithms-ux.md.
Giữ FastAPI/Jinja2; dữ liệu kiểm thử giả, database disposable. Không sửa migration đã triển khai hoặc các thay đổi cũ không liên quan.

## Công việc
1. Tối ưu scope danh sách; kiểm tra quyền toàn cục/chi nhánh/nhân viên và cursor. Benchmark lệch 100.000 và 1.000.000 lead.
2. SLA tiến qua batch 50/50/20, đổi hạn tạo chu kỳ mới, scheduler cạnh tranh không trùng.
3. Điểm rủi ro phân biệt thiếu bằng chứng; NLP phủ định, giả định và mâu thuẫn.
4. Đo impression/click thẻ gói speedtest; DOM động; giữ consent và chống gửi PII.
5. CI chạy toàn bộ JS contracts và browser smoke; kiểm thử hồi quy.
6. Bàn làm việc ưu tiên theo quyền, CTA hành động và dashboard mobile gọn.
7. Reviewer độc lập, sửa lỗi quan trọng, kiểm chứng và hướng dẫn phát hành.

## Review Focus
- Quyền kết hợp nhiều membership, global read nhưng chỉ branch all; nhân viên được gán khác chi nhánh.
- Cạnh tranh tick, khóa lead đang bận, thay đổi SLA và audit cũ.
- Phủ định tiếng Việt, mâu thuẫn, trạng thái chưa được xác nhận.
- Consent từ chối/thu hồi, thẻ thêm vào DOM, không đếm click/impression hai lần.
- Không gộp dữ liệu khách vào analytics hoặc cấp thêm quyền database.

## Nhật ký
- Baseline: 386 pytest; 22 JS contracts; audit 100.000 lead median RPC 4.807,687 ms; SLA audit 50/50/50.
- Ruling: Giữ các thay đổi mới ở workspace, chưa triển khai cloud — kiểm thử local trước khi tác động hệ thống đang dùng — production chỉ thay đổi sau bước phát hành riêng.

## Kết quả thực hiện
- Hoàn thành scope query có kiểm tra quyền cuối cùng; scheduler SLA có checkpoint theo deadline, khóa cạnh tranh; workbench theo quyền, CTA hồ sơ; risk evidence và NLP thận trọng; GA impression/click theo placement và trạng thái consent; CI chạy toàn bộ JS contracts và hai browser smoke.
- Reviewer độc lập: không có Critical; 4 Important đã có regression đỏ → sửa → xanh: backfill deadline cũ, phủ định hậu tố tiếng Việt, refresh workbench từ polling, hồ sơ unreachable quá hạn. Bổ sung regression câu hỏi tiếng Việt và impression sau chuyển consent.
- Ruling: Audit SLA cũ thiếu due_at không chứng minh đã cảnh báo deadline hiện hành; giữ audit cũ và đánh giá chu kỳ hiện tại một lần. Rollout có thể tăng audit SLA lần đầu; không bỏ sót deadline bị thay đổi.
- Ruling: Workbench tính overdue cho new/assigned/contacting/unreachable; báo cáo cohort cũ vẫn giữ định nghĩa 3 trạng thái. Số trên từng nhóm là số đang hiển thị, không giả làm tổng hệ thống.
- Ruling: Không suy ra Upload từ Download. Thêm upload_speed_mbps tùy chọn trong Admin/API; kế hoạch thẻ mới thay yêu cầu ảnh 30% trước đó bằng bố cục của ảnh mẫu mới nhất. Giữ dữ liệu giá, kỳ hạn, phụ kiện và nhãn Admin.
- Ruling: ML hiệu chỉnh bằng dữ liệu thật, cấu hình thuộc tính GA4/Ads từ xa và SLO hạ tầng production cần giai đoạn riêng. Auth/media fixture là dữ liệu giả, không chứng nhận dịch vụ cloud.
- Minor giữ lại: biểu đồ trong dashboard disclosure đóng khởi tạo với chiều rộng dự phòng; khi mở có thể cần resize để vẽ lại theo chiều rộng mới. Trang báo cáo riêng không bị điều kiện disclosure này. Chưa sửa trong vòng review này.
- Kiểm chứng: 399 pytest; 25/25 JS contracts; Ruff/mypy/architecture; wheel build và import/static/health smoke. Admin browser 12 viewport; thẻ mẫu 12 viewport cùng round-trip Upload Admin, kỳ hạn/phụ kiện, popup và form báo giá.
- Benchmark SQL local dữ liệu giả 1 triệu lead: branch median 3,9605 ms, global 3,398 ms, assigned 3,434 ms; mỗi scope 10 mẫu. Không phải số đo latency HTTP production.
- Chưa apply migration Supabase, commit/push hay deploy production. Báo cáo và bước phát hành: docs/reviews/2026-10-10-upgrade-verification.md.
