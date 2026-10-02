# Review kết nối frontend/backend PageFPT

Cập nhật Admin 02/10/2026: xem [hợp đồng vận hành mới](ADMIN-VAN-HANH-2026-10-02.md) và [nghiệm thu nâng cấp](../qa/2026-10-02/admin-upgrade/NGHIEM-THU-ADMIN.md). Các phát hiện lịch sử về cookie preview, HTML Admin production, settings, Kanban, filters và daily đã được xử lý trong code; phần đánh giá bên dưới giữ nguyên để truy vết. Hosted/cloud vẫn chưa xác minh.

Cập nhật 02/10/2026: năm lỗi tích hợp F-01..F-05 đã được sửa và kiểm chứng cục bộ. Xem [báo cáo sửa lỗi](../qa/2026-10-02/BAO-CAO-SUA-LOI.md) và [cấu hình recovery](../backend/password-recovery.md). Nội dung review/kiểm chứng ngày 01/10 dưới đây là snapshot trước các sửa lỗi này.

Đối chiếu nguồn ngày 01/10/2026, tại workspace hiện tại. Phạm vi: route tree FastAPI, Pydantic request DTO, các hàm SQL trong tám migrations, cấu hình runtime, controller JS và template client/admin. Không sửa luồng nghiệp vụ hoặc triển khai cloud trong lượt review này.

## Kết luận

Backend đã có API cho phần lớn nghiệp vụ dự án; frontend hiện chỉ kết nối một phần. Có thể tích hợp dựa trên bộ hợp đồng bàn giao, nhưng chưa thể coi toàn bộ UI sẵn sàng production. Những mục cần xử lý trước tiên: cùng origin cho cookie admin, loại hành vi thành công mô phỏng, bỏ giá/dữ liệu demo, hydrate CRM đầy đủ và quản lý version đúng entity.

Inventory hiện tại: **129 method/path**, gồm **125 operation trong OpenAPI**, **12 trang HTML preview**, **113 operation API/health còn lại trong OpenAPI**, **4 route worker/SEO không nằm OpenAPI**. Redirect resolver là HTTP redirect. Static assets là mount riêng. Production/staging không mount các route HTML preview; con số 129 mô tả toàn bộ cây route ở test, không phải 129 API JSON production.

## Các phát hiện cần hành động

P1 ở đây nghĩa là phải xử lý trước khi công khai chức năng liên quan; P2 nghĩa là làm rõ hợp đồng/UX trước khi dùng dữ liệu để ra quyết định. Đây là review khả năng kết nối, không phải báo cáo đã kiểm thử cloud hoặc audit bảo mật độc lập toàn hệ thống.

| Mức | Phát hiện có bằng chứng trong code | Tác động và cách xử lý |
|---|---|---|
| P1 | application.py cấu hình CORS allow_credentials=False, chưa cho header X-CSRF-Token; sessions.py dùng cookie Strict và cùng Origin | Admin frontend khác origin không dùng cookie được như hiện tại. Ưu tiên UI/API cùng origin hoặc reverse proxy; nếu khác origin phải sửa và kiểm thử backend auth/CSRF rõ ràng. |
| P1 | application.py chỉ include web routes trong development/test | Deploy API production không tự có trang home/admin hiện hữu. Hoàn thiện binding, bỏ fixture rồi thay cấu hình mount/guard có kiểm thử; không hạ environment xuống development. |
| P1 | login.html handleForgotStep1/2/3 báo gửi mã/verify/reset bằng JS không gọi provider | Người dùng tưởng tài khoản đã khôi phục. Disable hoặc triển khai recovery thật với backend; hiện không có reset/enrollment/change-password API. |
| P1 | auth có fallback dev/test khi thiếu Supabase Auth config; authorization.py nhận cookie preview theo prefix và cấp wildcard/aal2 | Chỉ dành preview local, không phải bằng chứng xác thực thật. Giữ môi trường công khai staging/production, không chia sẻ demo credential như tài khoản vận hành. |
| P1 | Giá ở controller/template/regions.js có dữ liệu preview; public quote không trả monthly/setup/equipment/VAT riêng | Không thể bind bảng 'giá/tháng' hoàn chỉnh bằng current response. Dùng tổng quote/cần xác nhận hoặc bổ sung public quote DTO; không chia total để suy ra giá tháng. |
| P1 | admin routes render HTML preview không gọi current_actor phía server; /chinh-sach-bao-mat dùng home template | Trước khi mount UI production cần guard trang admin trừ login, bỏ fixture và cung cấp nội dung chính sách đã phê duyệt. JS guard không bảo vệ HTML chứa dữ liệu demo. |
| P2 | Phần lớn endpoint không có response_model và OpenAPI không có securitySchemes | Không thể sinh SDK đầy đủ success response/permission từ OpenAPI. Dùng route + SQL + response map của prompt; bổ sung DTO/security metadata là công việc backend riêng. |
| P2 | Admin generic resource là payload wrapper, public catalog/page đã flatten | Adapter chung áp một shape cho mọi endpoint sẽ gây lỗi. Tách PublicPlan/PublicPage, AdminResource, LeadSafe, Price và Appointment. |
| P2 | PUT resource/price dùng query version; mutation khác dùng body; appointment create dùng lead version, update dùng appointment version | Rất dễ 422/409 hoặc overwrite. Lập adapter riêng, refetch sau mutation và xử lý conflict bằng UX. |
| P2 | CRM JS mới tải limit mặc định; detail/charts/pricing nhiều phần còn template/fixtures | Bổ sung pagination, hydration detail, dữ liệu dashboard thực; chức năng search/date/phone toàn bộ chưa có API, không gắn query tự bịa. |
| P2 | realtime.js là polling khoảng 5 giây; cookie flow không trả JWT cho Supabase SDK | Không có WebSocket frontend hoàn chỉnh. Drain cursor, phân loại event type vì audit có entity ngoài lead, batch refetch, pause tab ẩn; private broadcast cần auth design riêng nếu dùng. |
| P2 | Lead scores được worker cập nhật; nhiều lệnh trả queued/draft/unknown | UI cần trạng thái trung gian; không hiện 'đã gửi/tính xong/xuất xong' chỉ vì HTTP thành công. |
| P2 | Request DTO phân tích phone/GeoIP không chứa nguồn xác minh thuê bao; prefix chỉ inferred | Không hứa danh tính, nhà mạng hiện tại hoặc địa chỉ chính xác. Scores contact/intent/fit/risk là 0..100, completeness 0..1, fit có thể null. |
| P2 | Auth permission Python chưa thể hiện tất cả SQL gates | UI phải xét scope và permission, server là quyết định cuối. Reveal cần read+pii/MFA; observations cần write+intelligence; assignment cần write+assign; nhiều resource toàn cục yêu cầu zero-UUID membership. |
| P2 | Export chỉ CSV metadata, download signed URLs; create queued, read status complete | Không có export số điện thoại/name/address. Poll có giới hạn, xử lý URL 60s và invalidated, không hứa URL ký đã phát ra được thu hồi ngay lập tức. |
| P2 | Manual metrics rebuild và auto metrics có definition_version khác nhau | Chart phải đọc định nghĩa/field thật, không suy ra CPL/ROAS hoặc điền dữ liệu thiếu thành 0. |
| P2 | Backend chỉ có Turnstile secret/hostnames, chưa có public site-key config endpoint | Frontend cần injection site key công khai riêng để human challenge hoạt động; tuyệt đối không dùng secret làm site key. |

Nguồn chính: [application.py](/mnt/DATA/Workspace/PageFPT/src/pagefpt/application.py), [sessions.py](/mnt/DATA/Workspace/PageFPT/src/pagefpt/modules/identity/sessions.py), [authorization.py](/mnt/DATA/Workspace/PageFPT/src/pagefpt/api/authorization.py), [login.html](/mnt/DATA/Workspace/PageFPT/src/pagefpt/templates/admin/login.html), [catalog routes](/mnt/DATA/Workspace/PageFPT/src/pagefpt/modules/catalog/routes.py), [scoring.py](/mnt/DATA/Workspace/PageFPT/src/pagefpt/modules/intelligence/scoring.py), [migration hoàn thiện CRM](/mnt/DATA/Workspace/PageFPT/supabase/migrations/20261001014824_sessions_and_crm_completion.sql).

## Coverage frontend hiện tại

| Nhóm | Đã có kết nối trong code | Cần bổ sung/kiểm chứng |
|---|---|---|
| Gửi lead | API client, bottom sheet, form landing có lead schema/idempotency | Challenge site key/widget, consent UI thật, xử lý mọi lỗi/quote state, retry intent qua reload nếu yêu cầu và có thiết kế bảo vệ dữ liệu |
| Catalog/khu vực | API public/hierarchy có dữ liệu published; controller khu vực có gọi API | Loại legacy fallback và hardcoded price matrix khỏi vận hành; bind cards/quote đúng UUID |
| Auth | Login cookie, me, logout và adminFetch | Loại forgot mock, page guard production, phân biệt MFA/scope, kiểm thật Supabase/cookie origin |
| CRM | List, một số mutation/reveal/notes và change polling | Pagination, hydrate detail, appointments/intelligence/quote confirm, trạng thái/version/UX conflict |
| Display | GET public settings, save settings đã có gọi API | Cover permission/MFA/version conflict và mobile/reduced-motion |
| Giá/CMS/media | Backend CRUD/publish/import/schedule/upload có routes | Bind toàn bộ editor, nested payload, signed PUT binary và refetch price DTO |
| Reports/ads | Backend funnel/daily/costs/campaign/experiments/integrations/deliveries | Xóa chart fixture; chưa có đủ report quảng cáo spend/CPL/ROAS/channel |
| Care/governance | Backend followup/preferences/feedback/referral/privacy/export/audit/jobs/membership | Tạo UI theo quyền và async state; không bịa list/detail APIs còn thiếu |

Cụ thể, nhiều handler landing/settings nằm inline trong template thay vì file JS riêng. Prompt yêu cầu kiểm tra tên file thật trước khi sửa; giữ controller đang có và tránh duplicate listeners.

## Chức năng chưa có API đủ để frontend tự nối

Không có recovery/reset password/SMS OTP login, enroll MFA/step-up, profile edit/customer account, public lead status theo receipt, public product list, media library list/delete, referral list/payout, privacy request list/public data-subject workflow, plaintext activity notes read, cost list/CSV spend import, report CPL/ROAS/channel performance. Không có API xác minh chủ thuê bao/nhà mạng hiện tại từ số điện thoại, kiểm tra hạ tầng real-time tại địa chỉ, ký hợp đồng/thanh toán hoặc xử lý mọi native vendor webhook payload.

Một số nhóm đã có create/execute nhưng thiếu list/view: có thể dùng id trả về trong phiên hiện tại cho tác vụ tiếp theo; không trình bày đó là màn lịch sử bền vững đầy đủ. Muốn UX đầy đủ cần bổ sung endpoint theo hợp đồng mới, kiểm scope và request/response DTO.

## Cấu hình phải đối chiếu khi kết nối deployment thật

1. Origin thực và cookie/CSRF; reverse proxy giữ header/cookie đúng, public_origin khớp. API base browser ưu tiên tương đối.
2. Supabase project/migrations/RPC/private schema, service secret phía server, publishable auth key, user/factor/membership thật. Membership không tạo user.
3. R2 private/public buckets, endpoint/access keys server, media domain, CORS signed PUT. Export cần private storage, media finalize cần public media domain.
4. Turnstile site key ở UI và secret/hostname ở backend; GEOIP_PATH có file phù hợp; trusted proxy đúng hạ tầng. Unknown GeoIP vẫn là trạng thái hợp lệ.
5. Các gateway conversion/notification/HMAC webhook được cấu hình và được phép sử dụng; INTEGRATIONS_ENABLED không tự cung cấp credential vendor.
6. Worker/cron có job secret và chạy queue; frontend không thay worker bằng fetch internal. Health ready chỉ kiểm DB, không chứng minh toàn bộ tích hợp đã bật.

Chưa có chứng cứ cloud credentials/deployment trong lượt này: không xác nhận Supabase hosted, R2 CORS hoặc Vercel cookie/cron đã chạy thực tế.

## Bộ bàn giao và cách cập nhật

- [PROMPT-KET-NOI-FRONTEND.md](/mnt/DATA/Workspace/PageFPT/docs/frontend/PROMPT-KET-NOI-FRONTEND.md): prompt hành động và phụ lục contract đầy đủ, dùng làm đầu vào agent frontend.
- [API-KET-NOI-CHI-TIET.md](/mnt/DATA/Workspace/PageFPT/docs/frontend/API-KET-NOI-CHI-TIET.md): appendix riêng, toàn bộ routes/parameters/request schemas.
- [frontend-contract.json](/mnt/DATA/Workspace/PageFPT/docs/frontend/frontend-contract.json): dữ liệu contract để tool/agent kiểm tra, quyền annotations chỉ Python.
- [export_frontend_contract.py](/mnt/DATA/Workspace/PageFPT/tools/export_frontend_contract.py): sinh inventory từ FastAPI nested route tree, không truy cập cloud.

Chạy generator bằng Python workspace hoặc uv theo môi trường, generator tự cập nhật phụ lục prompt trong cặp marker BEGIN/END GENERATED FRONTEND CONTRACT khi có đúng một cặp. Giữ request DTO, custom validators, SQL scope và response map đồng bộ. Chỉ chạy generator không chứng minh integration UI thành công; acceptance tests cần được thực hiện khi agent frontend sửa code.

## Kiểm chứng thực hiện trong lượt review này

- Generator xuất 129 method/path, 125 operation OpenAPI, 50 schema (49 OpenAPI + ProcessInput worker ẩn). Đối chiếu inventory/schema/parameters/body/declared responses với OpenAPI và nguồn route hiện hành, không gọi cloud.
- Dựng route tree bằng production settings giả lập: 117 operation không preview; đúng là 12 HTML preview không mount trong production. Không xác nhận ứng dụng deploy thật chạy.
- Phụ lục trong prompt khớp byte với file API riêng; nguồn/line references tồn tại; ba JSON example blocks parse được. Kiểm năm trường hợp DTO quan trọng phải từ chối và default consent của lead.
- Ruff check/format tool generator đạt; bộ tests/unit hiện tại **18 passed**. Không chạy lại full integration/cloud/browser suite trong lượt chỉ viết tài liệu này.
- Reviewer độc lập kiểm contract/auth/CSRF/version/pricing/queue/R2; ghi nhận /changes có entity ngoài lead, đã bổ sung hướng dẫn phân loại event. Không thấy lỗi P1 trong tài liệu bàn giao ở phạm vi đã review; đây không phải xác nhận mọi vấn đề P1 của ứng dụng đã được sửa.

Chi tiết xác nhận inventory: [verification-contract.json](/mnt/DATA/Workspace/PageFPT/docs/frontend/verification-contract.json).
