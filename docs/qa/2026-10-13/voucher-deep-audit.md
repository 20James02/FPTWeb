# Rà soát và sửa lỗi dự án — 13/10/2026

Yêu cầu: sửa lỗi tạo voucher Admin, sau đó rà soát toàn bộ code và xử lý lỗi tái hiện. Kiến trúc giữ Python/FastAPI/Jinja2, Supabase, Vercel và R2.

## Nguyên nhân lỗi người dùng báo

Production đã có giao diện/API voucher nhưng Supabase project `ryfdlhmbytabinsbxbup` chưa có schema/RPC voucher. Endpoint context trả HTTP 400 `UNKNOWN_OPERATION`; đây là lỗi thiếu migration, không phải form nhập sai. Hai migration còn thiếu (`20261010060000_audit_scaling.sql`, `20261013030159_regional_vouchers.sql`) đã được áp dụng trong một giao dịch, có lịch sử migration. Context sau đó trả HTTP 200. Tạo draft qua hàm dữ liệu production được kiểm chứng trong giao dịch **ROLLBACK**, không để lại voucher QA hay gửi thông báo.

Đợt sửa sâu bổ sung migration `20261013103126_voucher_audit_integrity.sql`, không sửa migration đã chạy. Đã áp dụng production, xác nhận lịch sử migration, FK giữ sổ chi phí khi xóa PII, trigger ẩn danh, validation trang đích và thu hồi quyền bảng/RPC của anon/authenticated.

## Lỗi đã tái hiện và sửa

| Luồng | Lỗi trước sửa | Xử lý và kiểm chứng |
|---|---|---|
| Giá landing → CRM | Giữ voucher tính lại bằng giá thường, mất giá chiến dịch khách đã gửi | Slug lấy từ quote đã lưu phía server; tính lại giá landing; kiểm tra publication/version trong giao dịch. Test chặn đổi publication sát lúc giữ suất |
| Đổi kỳ/thiết bị | Preview kỳ thiếu thiết bị; quote voucher cũ vẫn được dùng khi checkbox thay đổi | Preview gồm accessory_ids, tiền thiết bị và điều kiện quà trùng; browser loại quote voucher không khớp selection ngay, kể cả request mới chưa hoàn tất |
| Quà tặng | Phụ kiện chuyển sang phí tháng vẫn được nhận là quà một lần | Quà chưa giữ phải đang công bố và billing_mode=one_time |
| Xóa PII | Xóa khách đã nhận quà làm mất redemption, hoàn quota/ngân sách/tồn quà đã dùng | Giữ ledger tài chính ẩn danh; suất held được released, redeemed vẫn consumed. Xóa lead/contact/link/lý do/quote/địa chỉ khỏi snapshot; kiểm chứng suất tiếp theo bị từ chối khi đã dùng hết |
| Cùng tạo mã | Hai request cùng mã có thể phát sinh lỗi nội bộ | INSERT ON CONFLICT; trả 409 VOUCHER_CODE_EXISTS; barrier test hai giao dịch |
| Cùng tạo link | Hai chiến dịch có thể ghi đè cùng slug | Upsert chỉ cập nhật khi cùng voucher_id; khác chiến dịch trả 409 LINK_SLUG_EXISTS; barrier test |
| Trang đích | Link tới landing không tồn tại/chưa công bố vẫn tạo được; nút UI gọi API UUID bằng slug | Server kiểm tra khi lưu và resolve. UI gọi API public slug, có timeout và fence response; ba trang hệ thống được hỗ trợ |
| Ưu đãi bằng 0 | Trần 0 hoặc giảm thực tế bằng 0 vẫn mang trạng thái eligible | Chặn cấu hình giảm đơn thuần vô hiệu; báo giá trả no_benefit nếu không có quà, không giữ suất |
| Nhập/bỏ mã nhanh | DELETE kết thúc muộn làm lệch cookie và voucher mới | Xếp hàng POST/DELETE, render dùng generation; E2E giữ DELETE rồi nhập mã khác để tái hiện |
| Dữ liệu hiển thị | Tên voucher và địa chỉ ước tính có thể đi qua innerHTML | Dùng textContent/DOM nodes; test chuỗi HTML độc hại không thực thi. GeoIP hiển thị rõ là ước tính |
| Marquee | Chưa cấu hình voucher vẫn tuyên bố tặng modem/miễn phí hòa mạng | Nội dung trung tính; không báo đã áp dụng/đã giữ khi chỉ xem mã |
| CSV và KPI | Dấu nháy/công thức không được xử lý đầy đủ; requested dễ hiểu thành lượt mở link | Escape nháy và trung hòa công thức; tooltip/nhãn xác định đúng lead request, giữ suất và chi phí |

## Phạm vi rà soát code

Kiểm kê 254 file nguồn/giao diện liên quan; kiểm tra các vị trí HTML động, redirect/URL, ngoại lệ, ranh giới API và SQL. Kiểm tra 107 module Python bằng mypy và luật import kiến trúc. Các nhóm đã kiểm chứng bằng suite toàn dự án và luồng trình duyệt:

- Auth/session/CSRF/MFA/tài khoản nhân viên và quyền theo scope.
- CRM: phân công, chuyển trạng thái/version, hiển thị PII, địa chỉ, hồ sơ, lịch hẹn, ghi chú, retry nhận lead.
- Gói, giá khu vực, kỳ thanh toán, phụ kiện, quote/token, công bố và thao tác hàng loạt.
- Thanh toán/nhắc hạn, notification/realtime và cơ chế queue/lease/retry trong tests backend.
- Nội dung/menu/slide/landing, upload media, bản nháp và công bố, form, cookie consent, dữ liệu báo cáo.
- Voucher/link/QR/giữ-dùng-hủy/hết hạn/quota/budget/tồn kho, xóa PII và concurrency.
- Homepage/navbar/landing/thẻ/speedtest trên các độ rộng màn hình; speedtest thiếu timing và bị chặn.

Review độc lập phát hiện hai lỗi bổ sung: preview thiếu phụ kiện và kiểm tra landing sai API. Cả hai đã sửa, có test thất bại trước sửa và đạt sau sửa. Reviewer chưa kết luận semantics lịch sử request/channel khi khách đổi voucher hoặc bị xóa; quyết định hiện tại: giữ sổ chi phí đã dùng ẩn danh, không phục hồi attribution/PII và không gọi báo cáo hiện có là funnel sự kiện đầy đủ.

## Kết quả cuối cùng tại local

| Kiểm tra | Kết quả |
|---|---|
| Python toàn dự án | **457/457 PASS**, 157,33 giây |
| JavaScript contracts | **27/27 PASS** |
| Deep voucher browser probes | **8/8 PASS** |
| Browser matrix | **16 suite PASS**: vouchers, voucher_audit, integrated, admin_quality, admin_bulk, profile_consent, lead_billing, pricing_bulk, landing_studio, home_mobile, navbar_pages, telecom_landing, accounts_analytics, reference_cards, speedtest_mobile, speed_cards |
| Mypy / kiến trúc | PASS, 107 source files |
| Ruff lint / format | PASS; 184 Python files đã đúng format |
| Git diff whitespace | PASS |

Browser integrated: 31 kiểm tra + 48 bố cục; accounts/MFA/staff/analytics: 23 kiểm tra; landing studio: 15 kiểm tra; thẻ tham chiếu: 12 bố cục. Speedtest mobile: normal, thiếu bandwidth timing, timing hạn chế đều complete; bị chặn trả error đúng trạng thái, không dựng số liệu giả.

Một số suite cũ ban đầu thất bại vì selector báo cáo đã bị thay, button lịch mới thêm gây selector không duy nhất, fixture dùng sai cấu hình R2 hoặc chờ mạng ngoài. Đã sửa harness/selector để kiểm tra API/UI hiện hành; không đổi logic sản phẩm chỉ để làm test đạt. Bộ kiểm thử dùng PostgreSQL tạm và dữ liệu tổng hợp, Auth/provider bên ngoài được giả lập; không gửi conversion/Telegram QA hay xuất dữ liệu khách production.

## Triển khai và chứng cứ

Candidate Vercel `dpl_DkfS6w9JXpj2aCQhV2TWzJcW4dDY` đã READY, đạt 17 kiểm tra HTTP và SHA-256 của các asset sửa đổi trước promote. Migration mới đã được kiểm chứng trên Supabase. Bản trước promote: `dpl_3fYHZTfHQM4WBdRDFXVaLk9dsqpX`.

**Đã promote lên https://fpt-vungtau.com.** Vercel inspect xác nhận đúng deployment mới, READY; 17/17 kiểm tra HTTP và hash asset trên tên miền đạt. API Admin chưa đăng nhập trả 401, context mã không tồn tại trả 200 với voucher=null, trang/link không tồn tại trả 404. Lệnh promote exit 0; cảnh báo kiểm tra phiên bản npm của CLI không cản promote và kết quả được xác nhận trực tiếp sau đó. Quy trình theo [Vercel deploy --skip-domain](https://vercel.com/docs/cli/deploy#skip-domain) và [Vercel promote](https://vercel.com/docs/cli/promote).

Chứng cứ local (ignored, không chứa secret): `.local/qa/voucher-audit/{forward-applied,forward-verified,production-draft-smoke,candidate-smoke,browser-results}.json`; `.local/qa/project-audit/final-matrix.json` và log từng suite. Lệnh pytest/JS/lint/format/type và log cuối nằm trong `/tmp/pagefpt-final-audit-*.log`. Tài liệu đấu nối đã cập nhật: `docs/frontend/VOUCHER-LUONG-DU-LIEU-ANTIGRAVITY.md`, `PROMPT-ANTIGRAVITY-VOUCHER.md`, `voucher-ui-contract.json`, `docs/admin/VOUCHER-KHU-VUC.md`.

Helper sdd-workspace của skill không có trên máy; dùng `.local/qa/voucher-audit/progress.md` làm ledger thủ công để giữ tiến trình, không cài tooling khác. Test đã bao phủ các lỗi tái hiện; chưa kiểm chứng tải lớn p95/p99, iPhone/Safari thật, quy trình Auth/Telegram thực tế bằng tài khoản người dùng, hay tính đầy đủ của lịch sử attribution sau xóa PII. Không tuyên bố hệ thống không còn mọi lỗi hoặc đạt 10/10 chỉ từ bộ test này.
