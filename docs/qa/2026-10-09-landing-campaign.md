# Landing chiến dịch — kiểm chứng 09/10/2026

## Phạm vi

Đồng bộ thẻ trang chủ/landing, giá riêng từng kỳ, nhãn/mô tả/màu/nút thẻ, điều kiện/thời hạn/stock thủ công, đếm phiên thật opt-in, hotline/Zalo/Messenger/popup/footer riêng. Admin có hướng dẫn nhanh, preset Camera, cấu hình nâng cao gấp gọn, tải ảnh và preview.

Giá riêng được server đọc từ bản landing đã công bố, vẫn cần giá/địa bàn hợp lệ. VAT, phí và phụ kiện giữ theo bảng giá thực. Kỳ để trống dùng giá/ưu đãi chuẩn. Báo giá kèm ID/version/thời hạn; không chấp nhận số tiền gửi từ client. Nguồn landing được giữ trong ghi chú lead được bảo vệ.

## Lỗi tái hiện và sửa

- Trên mobile, CSS trang chủ đặt nhãn ở top -11px khiến bị cắt trong ảnh thẻ; landing ép nhãn bên trong ảnh ở 12px.
- Công bố theo lịch từng bỏ qua pricing.publish: RED trả scheduled=true cho tài khoản chỉ có content.publish; SQL guard nay kiểm tra cả đặt lịch và worker công bố.
- Công bố khóa hàng trước khóa slug, chỉnh sửa dùng thứ tự ngược: review tái hiện DeadlockDetected. Nay cùng thứ tự slug → hàng, trả VERSION_CONFLICT khi có xung đột hoặc slug thay đổi. Kiểm thử hai kết nối đồng thời xác nhận không deadlock.
- Chỉ nhập giá 6 tháng từng làm kỳ 1/12 mất ưu đãi chuẩn: tính riêng từng kỳ, kiểm thử khoản giảm giá 12 tháng vẫn còn.
- Preset/reset/thay danh sách trong lúc tải ảnh làm widget bị ngắt và mất asset: ngăn thay cấu trúc khi đang tải, vẫn cho nhập văn bản và đổi trang theo generation. Browser regression giữ nguyên input đang tải khi bấm preset.
- Mô tả ngắn được hiển thị thực trên thẻ; khung nhãn có lựa chọn ẩn, kích thước thẻ/nút được giữ đồng đều.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Full pytest | 365 passed, 118.24s |
| Integration chiến dịch | 17 passed; giá độc lập, validation, stock/time, quyền, concurrency, activity/consent |
| JavaScript contracts | 17 file, tất cả exit 0 |
| Ruff | All checks passed trên src/tests/tools |
| Mypy | Không lỗi trong 101 source files |
| Browser chiến dịch | Chromium và WebKit đạt 9 nhóm: editor, kỳ, nhãn, ngày/stock, contacts/footer, giá server, 320–1440, carousel, popup bàn phím |
| Browser landing hiện có | Chromium và WebKit đạt 15 nhóm, gồm preview/CRUD/form/3–6–9 gói/phụ kiện/tải ảnh/cạnh tranh lưu/mobile |
| Bổ sung giới hạn danh sách | Preview Admin render đúng; 0 và 24 thẻ đồng kích thước, không tràn ngang tại 320/390/1440 |
| Code review độc lập | Các phát hiện quan trọng đã sửa và được rà soát lại |
| Vercel candidate | 67 checks; static SHA256 trùng mã nguồn |
| Tên miền live | 69 checks; guest Admin bị chuyển login, API Admin 401, static SHA256 trùng |

Các test tạo dữ liệu giả trong PostgreSQL/nhà cung cấp riêng; không gửi lead hoặc tạo landing mẫu ở production. Ảnh kiểm tra local: `.local/qa/landing-campaign/`, log và kết quả triển khai nằm trong `.local`, không upload.

## Triển khai

- Supabase project `ryfdlhmbytabinsbxbup`, tên FPTWeb, trạng thái ACTIVE_HEALTHY.
- Migration `20261009030713_landing_campaign_activity` áp dụng thành công, có lịch sử migration và index. api.dispatch/api.submit_lead/validator chỉ có service_role được EXECUTE, anon/authenticated không được gọi trực tiếp. PostgREST được yêu cầu reload schema.
- Upload inventory: 238 file, 2.453.984 byte, không có secret/.local/venv/tests/docs/database/migration.
- Candidate/production: `dpl_9RCDN3RJvw7PBV6eqTfGYpSBDJ9J`, `https://fpt-86f6h0z0o-pettravel.vercel.app`, READY.
- Promote đã thành công; inspect `https://fpt-vungtau.com` xác nhận đúng deployment trên. CLI updater npm có lỗi mạng riêng, nhưng thao tác promote exit 0, readback và kiểm tra live đều đạt.
- Có thể rollback ứng dụng về `dpl_uWLmZS3NvnBtpMDwMiVFbtR7v47W` nếu cần; migration thêm guard tương thích luồng cũ. Không tự hoàn tác dữ liệu khách hàng.

## Giới hạn thực tế

Stock do Admin cập nhật, không phải tồn kho hay giữ suất tự động. Activity là số session opt-in có xem trang trong 5 phút, không phải số người online chính xác; dưới ngưỡng/lỗi thì ẩn. Preview giá theo danh mục; giá riêng áp dụng ở bản đã công bố. Không có landing chiến dịch công khai được tự tạo. Admin cần nhập dữ liệu thương mại thật và công bố để chạy quảng cáo.

Hướng dẫn: `docs/frontend/TELECOM-LANDING.md`. Đánh giá bán hàng: `docs/qa/2026-10-09-landing-campaign-cro.md`. Điểm CRO là chẩn đoán cấu trúc, không bảo đảm tăng chuyển đổi.
