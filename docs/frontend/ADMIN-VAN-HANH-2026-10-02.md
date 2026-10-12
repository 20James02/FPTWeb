# Hợp đồng Admin sau nâng cấp — 02/10/2026

Stack tiếp tục là FastAPI/Jinja2/JavaScript nhẹ. Danh mục route/schema đầy đủ được sinh từ ứng dụng trong `frontend-contract.json` và `API-KET-NOI-CHI-TIET.md`; tài liệu này giải thích luồng nghiệp vụ và các phần vừa bổ sung.

## Xác thực và điều hướng

UI và API dùng cùng origin. `POST /api/v1/auth/session` nhận `{email,password,otp}`; cookie session HttpOnly, token provider không lưu vào localStorage. MFA_REQUIRED chuyển sang nhập mã ứng dụng xác thực. Sau login/MFA thành công, vào `/admin`; server đọc membership hiện hành và chuyển đến trang có quyền. Guest vào login; tài khoản chưa có quyền workspace nhận403, không vòng lặp redirect. Không còn tài khoản/mật khẩu hoặc cookie prefix cấp quyền preview.

`GET /api/v1/admin/me` trả `{id,aal,memberships}`. Membership có branch_id, permissions, display_name, capacity, shift. Wildcard chỉ hợp lệ nếu server cấp. Nav ẩn theo quyền nhưng API/SQL luôn quyết định quyền cuối cùng. Mọi mutation cookie dùng `X-CSRF-Token` lấy từ cookie `pagefpt_csrf` qua `adminFetch`. Không đưa service_role, job secret, credential R2 vào frontend.

## CRM, phân công và cập nhật

| Luồng | API và dữ liệu | Quy tắc frontend |
|---|---|---|
| Danh sách | GET `/api/v1/admin/leads`: limit1..100, cursor, status, q≤100, branch_id, assignee_id, region_id, start/endYYYY-MM-DD, overdue | Cursor chỉ dùng lại với cùng actor/bộ lọc; đổi bộ lọc bắt đầu lại. Search khớp mã lead, phone_masked, tên gói/địa bàn; không tìm điện thoại thô. start/end là ngày tiếp nhận ở Việt Nam. |
| Hiển thị | `{items,next_cursor}`; LeadSafe có labels.plan/region/assignee và payload được che PII | Tên không có thì hiện chưa có dữ liệu; không gọi thêm API cho từng dòng. Kanban nhóm đủ14 trạng thái; mobile dùng card. |
| Hồ sơ | GET `/api/v1/admin/leads/{id}` | Quote snapshot là giá tại thời điểm tiếp nhận. “confirmed” nghĩa hệ thống xác nhận giá, không có nghĩa đã chốt với khách. |
| Phân công | GET `/api/v1/admin/assignees`; POST `/leads/{id}/assignments` với `{expected_version,assignee_id?}` | Bỏ assignee_id để tự phân công. Cần lead.assign và quyền ghi tại SQL. Ca/sức chứa được server kiểm tra tại thời điểm ghi. |
| Phân công hàng loạt | POST `/api/v1/admin/lead-assignments`: `{assignee_id,items:[{id,expected_version}]}`,1..100ID khác nhau | Tất cả cùng thành công hoặc cùng rollback. Không báo một phần thành công khi409. Refetch rồi chọn lại nếu version stale. |
| Bộ lọc cá nhân | GET/POST `/api/v1/admin/lead-views`; PUT/DELETE `/{id}` | POST/PUT body `{expected_version,name,filters}`; tạo version0, sửa version hiện hành. DELETE queryexpected_version≥1. Mỗi actor chỉ đọc/sửa view của mình. |
| Đếm sidebar | GET `/api/v1/admin/lead-counts` → new,total,checked_at | Không hardcode số hoặc suy tổng từ trang30items. |
| Thay đổi | GET `/api/v1/admin/changes?after=...` | Poll5s khi tab hiện; lỗi backoff tối đa30s. Chỉ tiến cursor sau khi refresh thành công. Giữ filters và số trang đã tải; tránh request chồng/lỗi ghi đè từ response cũ. Đây là polling, chưa phải WebSocket. |

Trạng thái hợp lệ: new, assigned, contacting, contacted, qualified, survey, quoted, closed, installed, unreachable, no_infrastructure, invalid, duplicate, rejected. Transition vẫn dùng expected_version và kiểm tra quy tắc server; thao tác xác nhận lắp đặt cần reference hợp lệ.

Cập nhật phân công 07/10/2026: khi chọn cụ thể nhân viên, cho phép `new`, `assigned`, `contacting`, `contacted`, `qualified`, `survey`, `quoted`, `closed`, `unreachable`, `no_infrastructure`. Chỉ `new` chuyển sang `assigned`; các trạng thái khác giữ nguyên tiến độ, hạn phản hồi và dữ liệu hồ sơ. `closed` là chốt bán, chưa nghiệm thu, vẫn có thể bàn giao. Hồ sơ `installed`, `invalid`, `duplicate`, `rejected` trả `409 ASSIGNMENT_NOT_ALLOWED`; frontend vô hiệu hóa chọn nhân viên và hiển thị hồ sơ đã kết thúc. Phân công tự động vẫn chỉ dành cho `new`/`assigned`. Backend tiếp tục kiểm tra quyền ghi/phân công, chi nhánh, ca làm việc, sức chứa và version. Phân công hàng loạt áp dụng cùng quy tắc; một hồ sơ không hợp lệ làm rollback cả nhóm. Chọn lại đúng người đang phụ trách không cộng thêm hồ sơ vào sức chứa.

PII chỉ đọc qua reveal theo lead.pii/AAL2 và scope; dữ liệu trả về không lưu browser storage. Activities trả timeline đã che nội dung ghi chú; đọc ghi chú plaintext chưa có API. Score là điểm0..100, completeness0..1; reasons là object(signal/kind/weight/age_days), hiển thị nguồn, ngày tính và ruleset. IP/GeoIP/đầu số là ước tính, không chứng minh danh tính hay nhà mạng hiện tại.

## Cài đặt và báo cáo

| API | Quyền/shape | Hành vi |
|---|---|---|
| GET `/operations/settings` | lead.read hoặc workflow.manage → version,payload | Safe global defaults. |
| PUT `/operations/settings` | workflow.manage toàn cục + AAL2; `{expected_version,sla_minutes,sound_alert,shift:{weekdays,start,end}}` | SLA1..240phút, weekdays0=Thứ2..6=CN, cần ít nhất1ngày/end>start. CAS409 khi stale. SLA áp dụng atomically lúc tiếp nhận hồ sơ mới, không sửa lịch hồ sơ cũ. |
| GET `/operations/status` | workflow.manage | checked_at/environment/database.latency_ms; một probe DB≤2s. R2/Auth/gateway chỉ configured_unverified/unconfigured/disabled, không suy health cloud từ có credential. |
| GET `/reports/summary` | report.read, scopebranch; start,end,branch_id,campaign | `{items,definition_version:'cohort-v2',as_of,timezone}`. campaign là mã UTM. Nếu có cả start/end: tối đa366ngày. |
| POST `/reports/rebuild` | report.read, `{day}` | v2 gồm contacted/qualified/installed, cùng định nghĩa worker. Chọn ngày bằng Asia/Ho_Chi_Minh. |

Summary dùng nhóm lead theo ngày tiếp nhận, kết quả trạng thái hiện tại và chi phí nhập theo ngày Việt Nam/campaign tương ứng. CPL=chi phí/lead; cost_per_qualified và cost_per_installed dùng mẫu số tương ứng. Thiếu chi phí hoặc mẫu số0 trả null: hiển thị “Chưa có dữ liệu”, không tự điền0. Chi phí là dữ liệu nhập, chưa đồng bộ spend quảng cáo; không có ROAS/doanh thu đã xác minh.

Display settings dùng endpoint hiện hữu và version của bản đã mở. Không đọc lại version mới rồi tự ghi đè chỉnh sửa của người khác. Chỉ toast thành công sau API xác nhận.

## Marketing, nội dung và vận hành

GET `/api/v1/admin/workspace/{kind}?limit=30&before=UUID` trả `{items,next_before}` theo quyền/branch. kind: campaign,experiment,integration,cost,page,media,promotion,export,privacy. before là paginationUUID; không dùng created_at làm cursor. Export/privacy payload được che, lấy chi tiết qua endpoint có quyền riêng. Mỗi workspace lọc tab theo quyền hiện hành.

| Màn/tab | API ghi/đọc hiện hữu | Điều kiện và trạng thái |
|---|---|---|
| Campaign | campaigns POST/GET/PUT/retire | marketing.write; tạo UTM chỉ chấp nhận http(s), không credential URL; attribution theo consent. |
| A/B | experiments CRUD/publish | Tổng trọng số biến thể10.000BPS; phân nhóm ổn định. Chưa có kết quả thống kê kết luận biến thể thắng. |
| Integration | integrations CRUD; integration-capabilities | marketing.write+AAL2. Bản ghi enabled không tự kết nối vendor; credential server-only. |
| Chi phí | costs POST/GET/PUT/retire | campaign_id UUID được phép, day ngày thực, cost_vnd; derivebranch từcampaign. Chỉnh sửa khoản sai, tránh nhập lặp cùng khoản. |
| Landing | pages CRUD/publish/schedules | content.write; publish có quyền riêng. Khối có type/text/url/media_id; scheduled cầnworker. |
| Ưu đãi | promotions CRUD/publish | catalog.write; plans/regions checkbox, tỉnh/xã lazyload. Giá/ưu đãi dùng chung engine, không nhập giá giả vào CMS. |
| Media | media/upload-intents → signedPUTbinary → /media/{id}/finalize | content.write; JPEG/PNG/WebP≤10MB. Không toast thành công khi R2 chưa cấu hình hoặc finalize thất bại. |
| Queue | jobs GET; /jobs/{id}/replay POST | workflow.manage; replayAAL2. state/attempt/next_attempt_at thể hiện tác vụ, queued không nghĩa đã gửi. |
| Audit | audit GET | governance.audit; pagination; không thêmPII vào log. |
| Nhân sự | memberships GET/PUT | identity.manage+AAL2; user_id phải có trong Auth thật. last-owner/privilege/scope bảo vệ server. Endpoint hiện hữu chưa có CAS membership; cần tránh nhiều người cùng sửa một membership. |
| Export | exports POST → workspace/export → exports/{id} GET | governance.export+AAL2. CSV metadata, queued→complete/failed; tải URL có hạn, cầnworker/R2. |
| Privacy | privacy/requests POST → workspace/privacy → /{id}/execute POST | governance.write+AAL2, thực thi governance.delete+AAL2, xác nhận hành động riêng. Không tự gửi thông báo cho khách. |

Resource thường PUT `?version=...`; retire/publish dùng command version theo schema sinh tự động. Membership không phải genericresource và không có queryversion. Lead/appointment/savedview mỗi loại dùng version của đúng entity. HTTP409 phải giữ bản nháp và yêu cầu làm mới; không tự retry với version mới để ghi đè.

## Gói, giá và địa bàn

Xem `GIA-THEO-DIA-BAN.md` và `DANH-MUC-DIA-BAN-API.md` cho hợp đồng đầy đủ. Một plan có nhiều price theo xã/tỉnh/group/default, kỳ và thời gian. Ưu tiên xã→tỉnh→group→default; dùng địa bàn khách chọn. Không có giá phù hợp thì tư vấn, không lấy giá rẻ nhất ở vùng khác.

Editor thêm “Nhân bản” để giữ thông số và chọn địa bàn mới. Bản sao là draft mới; preview tính cước theo kỳ trả tiền, phí, VAT bằng số nguyên. Tháng tặng không tăng kỳ phải trả. Preview draft chưa áp dụng promotion và không thay public quote cuối cùng. Quote trả line_items: term_vnd,setup_vnd,equipment_vnd,vat_added_vnd,base_vnd,discount_vnd; tổng ban đầu đối chiếu được với từng phần.

## Giới hạn nghiệm thu

Kiểm thử local dùng PostgreSQL disposable, dữ liệu tổng hợp và Auth HTTP fixture. Migrations, auth/RLS/CAS/queue và browser được kiểm tra; hosted Supabase Auth, Vercel cookie/cron, R2CORS/upload/export và gateway vendor thật vẫn cần staging. Không đổi ENV=development để né production gate của clientpreview. HTML Admin có auth server ở mọi environment; clientpreview vẫn chỉ development/test.
