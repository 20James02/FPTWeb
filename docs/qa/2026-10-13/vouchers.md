# Kiểm chứng voucher khu vực — 13/10/2026

## Phạm vi

Voucher theo toàn quốc/tỉnh/xã phường, loại trừ địa bàn, kỳ thanh toán, gói và dịch vụ; giảm tiền/phần trăm có trần, quà tặng; link rút gọn, QR; áp dụng báo giá và nhận yêu cầu qua form; giữ/dùng/hủy suất trong CRM; hạn mức, ngân sách, tồn kho và báo cáo nguồn.

Môi trường kiểm chứng là PostgreSQL tạm, Supabase Auth giả lập và Chromium local. Dữ liệu là fixture QA; browser chặn yêu cầu ra mạng ngoài. Không dùng tài khoản hoặc dữ liệu khách production. Không kiểm chứng Vercel/Supabase production trong lượt này.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Python toàn dự án | 446/446 PASS, 139,05 giây, exit code 0 |
| Voucher unit/integration/contract | 29/29 PASS sau sửa lỗi ngân sách và bổ sung kiểm tra lịch sử báo giá |
| JavaScript contracts | 26/26 PASS |
| Browser voucher | PASS: editor, lưu/công bố, bản nháp không ảnh hưởng live, link, form thật, xác nhận địa chỉ, giữ/hủy/giữ lại/dùng, bulk pause, cookie/bỏ mã, 9 bố cục; bàn phím Tab/Enter/Space với trường nhập, điều kiện, checkbox và bỏ mã |
| Browser thẻ gói | PASS: 12 bố cục mobile/tablet/desktop; upload speed, kỳ/phụ kiện, popup và đăng ký |
| Browser landing studio | 15/15 PASS, gồm 320–1440px, save races và upload guards |
| Browser trang chủ | PASS: 320/360/390/430/768/1440px, slide, CTA, danh mục rỗng, thẻ 75%, flip/swipe |
| Browser danh sách Admin | PASS: tên cột ổn định, sort tiền/ngày hai chiều |
| Ruff / format / mypy / kiến trúc | PASS; 183 Python files được format kiểm tra, mypy và kiến trúc 107 source files |
| Dependency lock / sdist / wheel | PASS: 91 packages, wheel khớp mã nguồn, import/ASGI/static/template tách biệt |
| Hợp đồng frontend / OpenAPI | Xuất lại: 213 operations, 93 schemas; OpenAPI 169 paths |
| Review độc lập | Không còn blocker được phát hiện qua rà code; reviewer không thay thế kết quả chạy test |

## Trường hợp nghiệp vụ đã kiểm tra

- Xã/phường ưu tiên tỉnh và toàn quốc; loại trừ luôn thắng. Hết suất xã không tự chuyển sang ưu đãi tỉnh khi cùng địa chỉ.
- Giảm phần trăm có trần, làm tròn VND; không giảm tiền phụ kiện khách mua; ngân sách thiếu không hiển thị mức giảm không thể giữ.
- Không tiêu hao suất khi mở link, quét QR hoặc xem báo giá. Mã sai/hết hạn không làm mất form; idempotency nhận lead vẫn giữ nguyên.
- Hai yêu cầu tranh suất cuối, hạn mức khu vực/contact và tồn kho quà dùng chung; trả capacity khi hủy/hết hạn. Không cần cron để trả capacity.
- Redeem đợi khóa không hồi sinh suất đã hết hạn; catalog thay đổi trong khi giữ chờ khóa thì báo giá bị từ chối là stale.
- Snapshot giữ nguyên sau pause/công bố lại; sửa profile, đổi gói/kỳ đã chốt hoặc xác nhận báo giá mới phải hủy suất trước.
- Giữ lại/dùng/hủy có replay, không trừ hạn mức hai lần. Lưu báo giá trước đó vào lịch sử khi giữ suất.
- Chặn công bố khi giảm quota/ngân sách/khu vực/contact dưới cam kết; chặn xóa chiến dịch từng công bố kể cả đã pause.
- Kênh/nhân viên chụp tại intake, không bị sửa lại khi link đổi. Funnel tách requested/eligible/held/redeemed/installed/cost; địa bàn chưa xác nhận có nhóm riêng.
- API và database kiểm tra phạm vi nhân viên; thao tác tài chính yêu cầu quyền công bố và MFA. Bảng private bật RLS; thu hồi quyền anon/authenticated và aliases cũ. Public không lộ ngân sách/giá vốn/chi tiết quy tắc.
- Cookie manual code tồn tại qua tải lại; link mới thay ngữ cảnh cũ; bỏ mã và clear cookie; paused/expired có thể bỏ. Không bổ sung PII vào analytics.

## Các lỗi phát hiện và đã sửa

1. Bộ enhancer danh sách Admin ghi đè checkbox/sort riêng: bỏ qua bảng có `data-managed-list="true"`.
2. Cookie mã nhập cũ xung đột link chiến dịch mới: link được mở rõ ràng có ưu tiên.
3. Reload CRM hai lần làm mất dữ liệu vừa nhập: một reload, khóa controls trong lúc lưu và fence phản hồi cũ.
4. Tổng tiền CRM không cập nhật theo quote voucher: render số tiền và kỳ từ snapshot server.
5. Selector mẫu landing bị ép ở 320px do ba controls cùng hàng: selector full row, hai nút ở hàng dưới. Regression RED → GREEN 15/15.
6. Các race capacity/catalog, stale quote khi hủy/hết hạn và guard quote confirmation được sửa cùng regression tương ứng.
7. Kiểm tra ngân sách sớm trả nhầm lỗi hết suất: giữ mã lỗi `VOUCHER_BUDGET_EXCEEDED` để CRM hiển thị đúng. Bài kiểm tra lịch sử được bổ sung báo giá thực trước khi giữ suất.

Một lượt browser trang chủ trước đó timeout khi chụp màn hình trong lúc chạy nhiều kiểm tra; chạy riêng lại PASS. Lượt Python bị ngắt không tính là kết quả. Lượt toàn dự án trước sửa ngân sách có 444 PASS / 2 FAIL; hai trường hợp đã sửa, voucher targeted đạt 29/29 và toàn dự án chạy lại 446/446 PASS. Chỉ kết quả hoàn tất được đưa vào bảng trên.

## Vận hành và giới hạn kiểm chứng

Hướng dẫn: [Voucher khu vực](../../admin/VOUCHER-KHU-VUC.md).

Migration mới: `supabase/migrations/20261013030159_regional_vouchers.sql`. Chưa apply production, chưa push Git hoặc deploy. Trước khi dùng thật cần kiểm tra migration pending đúng project, triển khai cùng backend/templates/static rồi kiểm chứng staging bằng quyền/MFA thật. Chromium viewport tests chưa thay thế thử trên Safari/iPhone vật lý.

Ảnh kiểm tra local ở `.local/qa/vouchers/{admin,client,lead}.png`; log kiểm tra ở `/tmp/pagefpt-voucher-*.log`. Các artifact này không đưa vào Git.
