# QA hiệu quả link và chuyển đổi — 14/10/2026

Đã triển khai module link content/voucher trên `https://fpt-vungtau.com/admin/link-performance`. Form = lead commit thành công; chốt = current closed/installed do CRM, tách creator/closer. Không tạo lead/conversion giả hoặc gửi thông báo trong production.

## Bằng chứng kiểm chứng

| Gate | Kết quả |
|---|---|
| Toàn bộ Python | 485 passed, 196.58s; `env -u PAGEFPT_TEST_DSN .venv/bin/python -m pytest -q`. |
| JS contracts | 28/28 passed, gồm tracking consent/idle/hidden/navigation/preview/source precedence. |
| Ruff check/format | Pass; 191 Python files formatted. |
| Mypy/architecture | Pass; 112 source files. |
| Git diff whitespace | Pass. |
| Browser | 8 suite liên quan: link_performance, voucher_audit, integrated, accounts_analytics, admin_bulk, telecom_landing, reference_cards, landing_studio. Mỗi suite dùng Postgres/port riêng, không thao tác máy chủ người dùng. |
| Layout | 320/390/768/1440 không tràn trang; xem ảnh 390/1440 và dark. Bảng cuộn bên trong. |
| Luồng thực tế browser | Tạo link → redirect → điều hướng product khi chưa opt-in → form201 → CRM assigned/contacting/contacted/qualified/closed → KPI/pop-up nhân viên → chỉnh note → batch pause → link404. |
| Review độc lập | 5 findings material đã sửa, reviewer fresh28 backend tests + tracking contract pass; không còn material issue chưa giải quyết trong scope. |
| Supabase production | Migration `20261014034406` đã apply; history25 migrations, 6 bảng mới RLS, anon/authenticated không SELECT hoặc EXECUTE các private link functions. Hash migration đúng source local. |
| Smoke DB production | Tạo registry và gọi report trong transaction rồi ROLLBACK; kiểm tra không còn artifact. Không tạo khách giả. |
| Vercel | Deployment `dpl_7geHoEojjXz9ay3CQZcgwQYNAcNa`, candidate `https://fpt-7yvytzm93-pettravel.vercel.app`, READY và promote thành công. |
| Candidate/live HTTP | 14/14 mỗi môi trường: health/home/login, Admin redirect/auth, context, slug404, catalog, 4 static hashes đúng source. Domain inspect đối chiếu deployment. |

Artifacts đầy đủ ở `.local/qa/link-performance` (git-ignored), bản tóm tắt kiểm chứng tại `link-performance/verified-summary.json`. Tệp debug/raw CLI không đưa vào repository. Dữ liệu QA thuộc disposable fixture; không nhầm với chỉ số production.

## Lỗi được tái hiện trước khi sửa

- SQL lock inversion giữa chốt/heartbeat và giữa sửa voucher/toggle registry: regression barrier xác định, trước sửa API500, sau sửa cả hai thành công. Thứ tự khóa visit trước result/day; voucher trước registry.
- Không checkpoint bị ghi TB0 thay vì unknown; đã dùng timed_visits riêng và null khi chưa đo.
- Journey mất trong lúc consent acknowledgement và cookie voucher cũ lấn source content mới; contract RED→GREEN, generation/ready fences và source time precedence.
- No-consent điều hướng mất nguồn; đã carry query qua anchor nội bộ, không dùng cookie tracking/storage trước consent. Preview từ config không sinh đo/nguồn form.
- Channel voucher sửa lại làm relabel lịch sử hoặc replay journey sai phiên bản: daily/source revision và visit_version predicates, regression RED→GREEN.
- Hành vi xóa PII ở journey đã resume làm mất success vô danh khi lead khác đổi trạng thái: giữ boolean erased outcomes, không giữ mapping lead/người đã xóa.
- Engagement có thể tạo vô hạn page rows/request: token bucket và128 page-state cap, regression429.
- SDK gửi heartbeat không đổi khi hidden/idle: bỏ request khi cumulative không đổi, giữ packet lost-ACK để retry.
- OpenAPI GET/HEAD dùng trùng operation ID: HEAD tách và không expose schema, regression unit đạt.
- Checkbox bị click lúc report reload; đã khóa lúc tải và chờ refresh trước đóng editor.

Một số lỗi là QA harness: selector menu phải mở dropdown rồi chọn link có hash; browser account thứ hai phải chặn network ngoài fixture; smoke endpoint gói là `/api/v1/catalog`, không phải `/api/v1/plans`; Management query có thể trả201; Vercel lần đầu transient Not authorized, whoami/project read đúng và retry build/promote được xác nhận. Không sửa application để che những lỗi harness này.

## Quyết định và giới hạn

- Thực hiện trong phạm vi user đã yêu cầu xây dựng và xác nhận form/chốt, không suy diễn phê duyệt artifact; giữ branch đang làm và pending voucher fixes, không reset/clean.
- Đếm insert/transaction và trạng thái CRM, không tin toast/event client là bằng chứng chuyển đổi. Unknown creator/closer cũ không suy ra từ assignee.
- Nguồn service-only truyền URL nội bộ; consent là điều kiện lưu hành trình/đo thời gian. Navigation bằng code mới cần giữ contract; không truyền source sang domain ngoài.
- Không checkpoint là unknown; outcome đã xóa PII chỉ giữ vô danh, không còn nhân viên/hồ sơ đối chiếu. Historical click/time trước khi bật không thể khôi phục.
- Source ngày click cho nghiệp vụ; ngày bắt đầu đo cho mature cohort. Wilson tối thiểu30 mẫu ≥7 ngày là mô tả thận trọng trên mẫu opt-in, không phải causal lift.
- Avg là thời gian active ước tính; có thể mất phần cuối khi đóng/trình duyệt bỏ keepalive. Click không phải người duy nhất, bot filter không bao phủ mọi bot.
- Chưa kiểm thử trên điện thoại vật lý hoặc tải lớn, chưa nối chi phí/tiền thu theo link nên chưa tính CPL/ROAS. Không fake data để chứng minh provider/Ads conversion.
- Advisors không ERROR. WARN cũ: leaked password protection chưa bật và2 duplicate index; INFO private tables không policy là access service-only có revoke/RLS. Không thay đổi cấu hình Auth trong feature này.

Tham chiếu triển khai đã kiểm tra với [Supabase database functions](https://supabase.com/docs/guides/database/functions) và [Vercel deploy CLI](https://vercel.com/docs/cli/deploy). Hướng dẫn sử dụng: `docs/admin/LINK-PERFORMANCE.md`; đấu nối UI: `docs/frontend/LINK-PERFORMANCE-LUONG-DU-LIEU.md`.
