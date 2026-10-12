# Sửa phân công lead đang xử lý — 07/10/2026

## Nguyên nhân và thay đổi

Kiểm tra chỉ đọc Supabase xác nhận hồ sơ gặp lỗi ở trạng thái `contacted`. Hàm SQL cũ chỉ cho phân công `new`/`assigned`, trả `INVALID_TRANSITION`; UI vẫn mở chọn nhân viên và dùng thông báo chuyển trạng thái chung nhắc lý do/nghiệm thu.

Migration `20261007045037_active_lead_reassignment.sql` cho bàn giao mười trạng thái còn đang xử lý, giữ tiến độ, SLA và payload. Chỉ hồ sơ mới chuyển `assigned`. Bốn trạng thái kết thúc vẫn bị chặn bằng `ASSIGNMENT_NOT_ALLOWED`. Quyền, chi nhánh, ca làm việc, sức chứa, khóa giao dịch, version và audit được giữ. Bộ đếm giảm cho người cũ/tăng cho người mới; chọn lại người hiện tại không tăng bộ đếm.

UI dùng cùng tập trạng thái cho danh sách/checkbox, dialog và hồ sơ. Tự phân công vẫn giới hạn `new`/`assigned`; kết quả tự phân công không tìm được người không ghi đè dữ liệu hồ sơ đang hiển thị.

## Kiểm chứng

- Red phase: 12 kiểm thử SQL mới thất bại đúng vì hàm cũ trả `INVALID_TRANSITION`; JS contract thất bại vì thiếu helper xác định trạng thái.
- Sau sửa: 40 kiểm thử CRM/phân công đạt; toàn bộ Python **267 passed, 57.06 giây**. Ruff, format (144 file), mypy (93 source files) đạt.
- 12 file JS contracts đạt. Browser thao tác thật với Auth fixture và PostgreSQL disposable: desktop1440/mobile360, chuyển lead `contacted`, giữ trạng thái, cân bằng bộ đếm, chọn lại khi người hiện tại đủ sức chứa, chặn hồ sơ kết thúc, không pageerror/overflow.
- Review độc lập: 13 kiểm thử SQL phân công và bulk rollback đạt; không phát hiện hồi quy cần sửa.
- Supabase migration áp dụng thành công; đọc lại hàm xác nhận hỗ trợ `contacted`, giữ nguyên trạng thái, mã lỗi riêng; anon/authenticated không có quyền execute, service_role có quyền. Advisor bảo mật không có cảnh báo mới do migration.

Dữ liệu kiểm thử tổng hợp; không đổi người phụ trách, trạng thái hay thông tin khách trên cloud. Browser evidence: `.local/qa/lead-reassignment/result.json` và ảnh 1440/360. Kết quả toàn bộ Python: `.local/qa/reassignment-python-tests.txt`.

## Triển khai xác nhận

- Website [fpt-vungtau.com](https://fpt-vungtau.com), project `pettravel/fpt-web`.
- Deployment `dpl_HTBtVeV97S9h9kcaLZ1htymScBT6`, candidate `https://fpt-mrt62bib4-pettravel.vercel.app`: READY. Deploy `--prod --skip-domain`, candidate đạt 12 checks rồi promote; inspect tên miền trả cùng id/READY.
- Candidate và tên miền chính mỗi nơi đạt 12 kiểm tra: home/health/login200, private HTML303, private APIs401, www308 giữ path/query; `common.js` và `crm.js` đúng SHA256 source. Upload189files không chứa env, keys, thư mục credentials; template chi tiết có trong manifest.
- Cloud migration `20261007045037_active_lead_reassignment`, file local khớp version cloud. Không đổi cấu hình R2, Telegram, secrets hoặc nhân viên thật.

Evidence triển khai: `.local/deploy-cli/deployment-reassignment.json`, `cloud-smoke-reassignment.json`, `cloud-live-reassignment.json`, `domain-reassignment-inspect.json`, `deployment-reassignment-upload-safety.json`. Luồng phân công xác nhận bằng SQL thật/browser fixture; cloud chỉ kiểm tra chỉ đọc, auth gates và mã đã triển khai, không thử bàn giao lead khách thật.
