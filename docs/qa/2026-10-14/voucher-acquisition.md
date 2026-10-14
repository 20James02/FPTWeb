# QA luồng link voucher → popup → form — 14/10/2026

Đã triển khai trên `https://fpt-vungtau.com/s/salethang10`. Root cause ban đầu: link enabled, target/date valid, voucher draft, chưa có published_payload nên route trả JSON404. Không tự công bố bằng SQL; trạng thái đã chuyển sang published trong quá trình người dùng làm việc, được đọc lại trước smoke.

## Gate và bằng chứng

- Full Python **487 passed**,224.97s; `env -u PAGEFPT_TEST_DSN .venv/bin/python -m pytest -q`.
- JS **29/29 contracts passed**; acquisition live/unavailable/preview/mismatch/receipt, fixed cap và toàn bộ regional sold-out.
- Ruff check/format **192 files**, mypy/architecture **112 source files**, diff whitespace pass.
- 4 browser suites: voucher_acquisition, voucher_audit, telecom_landing, link_performance, dùng disposable Postgres/Auth/ports.
- Actual fixture workflow: draft link→target/no reward; published→popup→form201→CRM voucher request và signed source; standalone published telecom landing cũng gửi form201 giữ voucher/source. Không dựa vào toast/mock conversion.
- Mobile320/390/768/1440: popup giữa màn hình, không tràn trang/thẻ. Escape/close/reminder, delayed quiz overlay và preview guard được kiểm tra phù hợp; xem ảnh riêng390/1440.
- Independent reviewer: 3 findings xử lý RED→GREEN (standalone template, cap, modal focus); fresh32 backend integration tests + Chromium wording/focus/reminder/Tab/Escape pass; không còn actionablefinding trong bounded scope.
- Supabase migration `20261014054834_voucher_acquisition_flow` apply và checksum verified; history **26 migrations**; new/current alias api.dispatch đều revoke Public/anon/authenticated. Enabled known target resolves, unknown returns empty. Không thêm bảng hay sửa quyền client.
- Vercel deployment **dpl_DtW56GZs2Ykjq9MNUUoz9rRF3SWk**, candidate `https://fpt-h8cqsxlkn-pettravel.vercel.app` READY và promote thành công.
- **10/10 HTTP/static-hash checks** trên candidate và domain thật: health/home/shortlink/context/Auth/Admin plus4assets; /s returns302 + correct pf_offer, homepage có shared popup, JS/CSS đúng source.
- Live Chromium390: actual `/s/salethang10`→root→congratulations→Use Now→form showing actual voucher code. **Không submit production lead, không tin nhắn/đơn/conversion giả**. Public test requests đánh dấu QA-Bot, không coi là người thật.

Bằng chứng tổng hợp: `voucher-acquisition/verified-summary.json`; output/screenshot/raw CLI riêng ở `.local/qa/voucher-acquisition` (ignored, không đưa credentials vào git).

## Lỗi và điều chỉnh xác nhận

1. Intent marker/context/benefits RED2tests→GREEN48 affected integration cases. Không lộ draft, giá vốn/ngân sách hoặc PII trong public context; không nhầm voucher cũ khi fallback.
2. Screenshot cho thấy dialog lệch trái vì reset CSSmargin; browser centre assertion fail→explicitmargin:auto→4widthpass.
3. Standalone telecom thiếu shared component/scripts; real custom landing fail→full include/source SDK→form+attribution pass.
4. Amount100k/cap50k popup nói100k, trong engine50k; contract fail→min(amount,cap)→50kpass. Stock của tất cả regionalbenefits exhausted không chúc mừng.
5. Context trả chậm khi quiz đang mở gây chồngnative/pseudo sheets và trapfocus; real browser fail→guard+deferredObserver→Escape/Tab ổn.
6. Read-only migration smoke ban đầu kỳ vọng campaign vẫn draft trong lúc user đã publish; schema đã apply đúng. Verify lại trạng thái published, checksum/permissions/target pass; không rollback/overwrite dữ liệu người dùng.
7. Live browser ban đầu thiếu proxy dẫn navtimeout; đã cấu hình theo environment. Một lượt tiếp theo hết thời gian chờ, sau đó live probe có diagnostic instrumentation thành công; không sửa product để che môi trường mạng. HTTP/static checks và live successful UI proof lưu riêng.

## Rulings và giới hạn

User đã yêu cầu build luồng; thực hiện trong bounded scope, không giả định phê duyệt artifact. Giữ toàn bộ worktree cũ, không reset/push. Publication/pricing/MFA vẫn workflow Admin, không công bố tự động. Ưu đãi là đề nghị cần xác nhận gói/địa bàn/kỳ hạn, không giữ suất chỉ vì popup. Nút đóng luôn có; không mở lại liên tục khi khách từ chối, đã gửi thì dừng nhắc.

Marker URL chỉ mở popup, không quyết định quyền lợi. Nguồn form được ký; journey/timing vẫn consent-gated. Draft/future/expired known enabled link được redirect target công khai nhưng chỉ tư vấn, không apply coupon. Invalid/inactive/unknown destinations vẫn bị chặn. Labels/gifts/terms render plain text, không innerHTML.

Chưa kiểm thử điện thoại vật lý, tải lớn hoặc hiệu quả conversion lift/A-B; kết quả CRO plan là đánh giá cấu trúc, không phải KPI thực tế. Chưa có campaign delivery/Ads conversion trong scope. Hướng dẫn cấu hình/đấu nối: `docs/admin/VOUCHER-POPUP-FORM.md`.
