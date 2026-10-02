Danh mục tỉnh/thành và xã/phường qua API: xem [hợp đồng đồng bộ](DANH-MUC-DIA-BAN-API.md).

# Prompt bàn giao: kết nối toàn bộ frontend PageFPT với backend

Ngày đối chiếu code: 02/10/2026. Đây là prompt triển khai frontend trên backend hiện có, không phải xác nhận đã deploy cloud hoặc tất cả màn hình đã kết nối. Có thể đưa nguyên file này cho agent frontend trong workspace PageFPT. Phụ lục cuối file chứa toàn bộ method/path, path/query/header parameters và 53 schema (52 từ OpenAPI, 1 body worker ẩn).

## 1. Vai trò và mục tiêu

Bạn là kỹ sư frontend phụ trách PageFPT. Đọc AGENTS.md, KE-HOACH-WEBSITE-CLIENT-ADMIN.md, KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md, SKILLS-DU-AN.md và docs/frontend/REVIEW-KET-NOI.md trước khi chỉnh sửa. Tích hợp giao diện client/admin đã có với Python/FastAPI + Jinja2, HTML/CSS/JavaScript nhẹ; giữ cấu trúc src/pagefpt. Không chuyển sang Next.js hoặc backend Node.

Mục tiêu: khách mobile gửi yêu cầu tư vấn nhanh, nhận thông báo đúng kết quả; admin xử lý lead, giá, nội dung, marketing, chăm sóc và quản trị theo quyền thật. Mọi nút phải thực hiện API đúng hợp đồng, hoặc hiển thị rõ chức năng chưa được hỗ trợ. Xóa thông báo thành công mô phỏng và dữ liệu mẫu khỏi luồng production. Không tự bịa giá, hotline, lời chứng thực hoặc tư cách đại lý chính thức.

Nguồn hợp đồng: code route/Pydantic và SQL migration hiện tại; docs/backend/openapi.json; docs/frontend/frontend-contract.json; phụ lục phía dưới. Request schema OpenAPI tương đối đầy đủ; phần lớn response chưa có response_model và chưa khai báo securitySchemes. Không sinh client rồi suy luận mọi response là object rỗng hoặc API không cần quyền.

Phạm vi inventory: 135 method/path khi chạy môi trường test, trong đó 131 có OpenAPI. Có 12 route HTML preview; 119 operation còn lại trong OpenAPI là API JSON/health, trừ redirect resolver trả HTTP redirect. Bốn route ngoài OpenAPI là worker và SEO. Production/staging hiện không mount 12 trang preview. /static là mount tài nguyên, không phải JSON API.

## 2. Topology và các kết nối

Dùng cùng origin HTTPS cho giao diện và API: ví dụ giao diện tại https://<ten-mien>/, API tại /api/v1, admin tại /admin. Nếu frontend và Python nằm ở hai deployment, dùng reverse proxy/rewrite cùng origin và kiểm tra cookie, Origin, Set-Cookie, X-CSRF-Token xuyên suốt. Không giả định deployment Vercel đã có rewrite đó.

Backend hiện có CORS allow_credentials=False; chỉ cho Authorization, Content-Type, Idempotency-Key, chưa cho X-CSRF-Token. Cookie admin thật dùng SameSite=Strict và kiểm tra Origin/PAGEFPT_PUBLIC_ORIGIN. Admin cross-origin với credentials:'include' sẽ không hoạt động chỉ bằng đổi URL. Nếu bắt buộc khác origin, ghi thành thay đổi backend riêng và kiểm thử lại toàn bộ auth/CSRF; không tự bỏ bảo vệ cookie.

| Kết nối | Bên thực hiện | Cách sử dụng |
|---|---|---|
| Client → FastAPI | Trình duyệt | API public, JSON, base URL tương đối cùng origin |
| Admin → FastAPI | Trình duyệt | Cookie phiên + CSRF cho mutation, quyền server kiểm tra |
| FastAPI → Supabase Auth | Server | Đăng nhập, xác minh TOTP, refresh, logout |
| FastAPI → Supabase RPC/Postgres | Server | Database và scope/transaction/RLS, secret ở server |
| Admin → R2 signed PUT | Trình duyệt | PUT File trực tiếp bằng upload_url, chỉ headers được trả |
| FastAPI → R2 | Server | Tạo URL ký, đọc kiểm tra ảnh, xuất CSV, quản lý object |
| FastAPI/worker → conversion/notification gateway | Server | Queue, adapter cấu hình; không gửi từ browser |
| Connector → webhook backend | Server ngoài → server | HMAC theo hợp đồng webhook của PageFPT |
| Cron/worker → /internal/jobs/* | Server | Job secret; tuyệt đối không đưa vào JS |

Chỉ công khai cấu hình UI cần thiết: API base/origin công khai, media domain, phiên bản văn bản consent đã phê duyệt, Turnstile site key khi có widget. Backend chưa có trường/site-key endpoint public cho Turnstile: cần cấp site key bằng cấu hình template riêng. Turnstile secret luôn ở server.

Không khởi tạo Supabase service-role/secret SDK trong trình duyệt. Supabase publishable/anon key không phải credential admin; luồng cookie hiện tại không cần trình duyệt giữ Supabase token. Mặc định không kết nối trực tiếp bảng private hoặc RPC từ frontend.

Các biến Settings thật dùng tiền tố PAGEFPT_; đây là cấu hình server, không sao chép toàn bộ sang biến public:

| Nhóm | Tên biến |
|---|---|
| Runtime/origin | ENVIRONMENT, PUBLIC_ORIGIN, ALLOWED_ORIGINS, TRUSTED_VERCEL_PROXY |
| Supabase/auth | SUPABASE_URL, SUPABASE_SECRET, SUPABASE_AUTH_KEY, JWT_AUDIENCE, ADMIN_SESSION_HOURS |
| Mã hóa và ký | ENCRYPTION_KEY, ENCRYPTION_KEY_VERSION, ENCRYPTION_PREVIOUS_KEYS, MATCHING_KEY, TOKEN_KEY, JOB_SECRET |
| R2/media | R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_PUBLIC_BUCKET, MEDIA_DOMAIN |
| Challenge/GeoIP | TURNSTILE_SECRET, TURNSTILE_HOSTNAMES, GEOIP_PATH |
| Gateway | INTEGRATIONS_ENABLED, CONVERSION_URL, CONVERSION_SECRET, INCOMING_WEBHOOK_SECRET, NOTIFICATION_URL, NOTIFICATION_SECRET |

Ví dụ tên đầy đủ: PAGEFPT_PUBLIC_ORIGIN. List/dict cấu hình theo định dạng JSON của Pydantic Settings. Không in giá trị secrets khi debug. ENVIRONMENT production/staging giữ nguyên; không dùng development để bật UI công khai. Auth key server phải là publishable/anon, không phải sb_secret_. Kiểm tra trusted proxy theo cấu hình hạ tầng; browser không gửi X-Forwarded-For/IP/GeoIP tự khai để chấm điểm.

## 3. Lớp API và quy tắc dữ liệu chung

Tổ chức module theo chức năng và tái sử dụng các controller hiện tại: static/js/client/api.js, analytics.js, bottom_sheet.js, regions.js, ui_motion.js; static/js/admin/auth.js, crm.js, realtime.js. Handler form landing và settings có thể nằm inline trong template; xác nhận tên file thật trước khi sửa. Bổ sung adapter/validator cho response và module màn hình cần thiết, tránh tạo hai listener/nút submit hoặc hai cơ chế auth cạnh tranh.

API client phải:

- Gửi Content-Type: application/json cho JSON; JSON.stringify body whitelist đúng DTO. Không spread toàn bộ object trả về thành request. DTO Command extra=forbid: trường lạ bị 422.
- Dùng credentials:'same-origin' cho admin cùng origin. Đọc pagefpt_csrf cookie mỗi mutation đã đăng nhập; gắn X-CSRF-Token. POST login không cần CSRF cookie trước đó. DELETE logout cần CSRF trong luồng thật.
- Kiểm tra HTTP status trước xử lý; catalog/page public có ETag và có thể trả 304 khi If-None-Match khớp, phải giữ bản cache cũ thay vì parse body rỗng; thành công có 200/201/202, không chỉ 200. Không bắt buộc mọi response đều JSON: redirect, sitemap và robots là ngoại lệ.
- Parse lỗi chung {code,message,fields,request_id}; map code thành tiếng Việt, gắn fields vào input tương ứng. Chỉ dùng mã lỗi/status/request_id cho log hỗ trợ; không ghi body chứa phone, IP, password, session/quote/feedback tokens hoặc URL ký vào analytics/console.
- Timeout/AbortController; hủy quote/search GET cũ khi đổi lựa chọn. Dùng sequence ID để response cũ không ghi đè lựa chọn mới. Cache catalog/settings công khai có giới hạn; tuyệt đối không cache reveal PII, auth hoặc signed downloads vào service worker/CDN/localStorage.
- Tách retry theo operation. GET có thể retry giới hạn với jitter/backoff. Lead retry có idempotency riêng. Không tự retry mọi POST/PUT, đặc biệt activities, followups, import, privacy execute, reconcile, export creation.
- Disable nút submit khi pending và hiển thị trạng thái thật. Timeout là chưa biết kết quả, không khẳng định thất bại hoàn toàn hay tạo yêu cầu mới ngay.

UUID phải lấy từ backend; tên khu vực/code người đọc không thay UUID. Region hierarchy provinces[].code hiện là UUID thật, còn region_code là mã chữ. Giá VND là integer, format bằng Intl.NumberFormat('vi-VN'); không parseInt chuỗi '185.000' thành 185. Datetime gửi ISO 8601 có timezone, hiển thị Asia/Ho_Chi_Minh. Tùy chọn 'gọi ngay/khi thuận tiện' gửi preferred_contact_at:null, không gửi chuỗi 'asap'. Missing/null/empty string khác nhau; kiểm tra schema và validator.

Không có endpoint tổng quát /profile, /search, /upload, /admin/config, /admin/login hoặc /api/login. /admin/login là trang HTML preview; endpoint xác thực là /api/v1/auth/session. Không tự bịa query tìm kiếm, khoảng ngày, branch hoặc sort khi route chưa hỗ trợ.

## 4. Client: bootstrap, consent và catalog

Bootstrap tải song song GET /api/v1/catalog, /api/v1/regions/hierarchy, /api/v1/system/display-settings. GET /api/v1/regions dùng khi cần danh sách phẳng. CMS theo slug tải GET /api/v1/pages/{slug}. Không chặn form tư vấn chỉ vì analytics, CMS phụ hoặc hiệu ứng lỗi.

Catalog/regions phẳng trả {items:[{id,version,...publishedPayload}]}. Public page trả {id,version,title,slug,blocks,description,canonical_path,...}. Admin resource khác cấu trúc, xem phần admin. Hierarchy trả object zone keys, mỗi zone {id,name,provinces:[{code,name,price_group,region_code}]}. Khi backend chưa có region published, production có thể trả object rỗng: hiển thị chọn khu vực chưa xác định/cần tư vấn; không dùng danh sách cũ như UUID database.

Public catalog chỉ cung cấp plan metadata, chưa cung cấp price bảng tháng hoặc public products list. Card dùng name, service, description, speed_mbps, equipment và id; nhóm service internet/combo/camera/business/play. Không lấy endpoint admin prices để hiển thị public.

Consent phải là lựa chọn thật, mặc định analytics=false, marketing=false. Tạo POST /api/v1/sessions với:

```json
{"analytics":false,"marketing":false,"consent_version":"<phien-ban-van-ban-da-duyet>"}
```

Response {session_token}. Token có hạn 1 ngày khi không analytics, 30 ngày khi analytics bật. PUT /api/v1/consent dùng cùng ba trường và session_token; response {saved:true}, không cấp token mới. Chỉ tạo phiên mới sau expiry hoặc ý định mới rõ ràng; không đổi phiên giữa retry lead chưa biết kết quả.

Lưu consent theo chính sách đã phê duyệt, token mặc định giữ RAM và không cho vào URL/log. Không lưu phone/password/PII để làm draft. Consent phục vụ yêu cầu liên hệ phải được thể hiện bằng UI/văn bản riêng; DTO lead có consent_version nhưng không có trường 'consent':true. analytics_opt_in/marketing_opt_in phải khớp lựa chọn và phiên, không bật theo mặc định để ghi được nhiều dữ liệu.

Khi rút consent: PUT consent, dừng batch events, xóa buffer analytics và attribution token phía UI phù hợp. Server xử lý xóa/suppression dữ liệu đã liên kết; không coi mỗi lần đổi checkbox là tạo session mới.

## 5. Client: giá và báo giá

Khi chọn plan + region + kỳ thanh toán, POST /api/v1/quotes:

```json
{"plan_id":"<UUID-plan-published>","region_id":"<UUID-region-published-hoac-null>","billing_months":6}
```

billing_months 1..36, mặc định 6. Debounce đổi lựa chọn, hủy request cũ, cache ngắn theo cả ba giá trị và hạn expires_at. Chỉ dùng token của tổ hợp đang chọn.

Confirmed response chứa status='confirmed', monthly_vnd, vat_included, vat_bps, price_id, plan_id, region_id, billing_months, service_months, revision, initial_total_vnd, line_items:{base_vnd,discount_vnd}, promotion_ids, calculated_at, expires_at, quote_token. Needs-confirmation response chứa status='needs_confirmation', revision, plan_id, region_id; không giả có total hoặc token.

Hiển thị initial_total_vnd là tổng ban đầu và service_months theo đúng nghĩa. Giá tháng lấy trực tiếp monthly_vnd; VAT theo vat_included/vat_bps, không chia tổng cho số tháng để suy ra giá. API chưa tách setup_vnd/equipment_vnd/gift_months trong response. Card và quiz chỉ dùng danh mục đã công bố và UUID thật. Sau đổi vùng phải xóa giá/token cũ ngay, kiểm tra generation trước khi áp dụng response. Request quote có deadline 3 giây; lỗi/missing price hiển thị cần tư vấn và cho gửi lead không có quote token. CTA quảng bá không gắn gói công bố phải thể hiện tư vấn chung.

Báo giá thường tối đa 15 phút và có thể hết hạn sớm do biên giá/promotion. Khi hết hạn, làm mới trước xác nhận hoặc để lead vào trạng thái cần xác nhận. Frontend không tự ký token hoặc quyết định price/promotion nào được áp dụng; engine backend làm việc đó.

## 6. Client: gửi lead, chống trùng, challenge

POST /api/v1/leads với Idempotency-Key. Key server cho 8..100 ký tự; frontend dùng crypto.randomUUID(). Body đầy đủ minh họa dưới đây; thay placeholders bằng UUID/token thật, null nếu chưa có:

```json
{
  "phone":"<so-dien-thoai-khach>",
  "name":"",
  "service_ids":["internet"],
  "plan_id":null,
  "region_id":null,
  "installation_address":"",
  "notes":"",
  "preferred_contact_at":null,
  "quote_token":null,
  "consent_version":"<phien-ban-van-ban-da-duyet>",
  "analytics_opt_in":false,
  "marketing_opt_in":false,
  "session_token":null,
  "attribution_token":null,
  "challenge_token":null,
  "website":""
}
```

Bắt buộc phone 5..40 ký tự và consent_version 1..50; backend chuẩn hóa/kiểm tra số Việt Nam. service_ids tối đa 5 giá trị enum; name≤150, address≤500, notes≤2000, website honeypot≤200. Tokens≤8192. Không gửi email, current_carrier, geoip, ip, score, assignee_id, status, consent hoặc UTM tự do vào LeadRequest. Không tự phân tích đầu số rồi gán nhà mạng hiện tại vào payload.

Lần tạo 201; replay cùng intent 200. Success {receipt,event_id,quote_status,next_action:'await_contact'}. Chỉ hiển thị 'Đã tiếp nhận yêu cầu' sau receipt hợp lệ. receipt không phải lead.id admin; không có public GET tra cứu lead theo receipt. event_id dành cho dedup event server; không ghi phone vào event conversion browser.

Giữ nguyên Idempotency-Key và nội dung body khi timeout, lỗi network hoặc 503 vì server có thể đã commit. Client giữ pending body theo các input/consent người dùng; token quote/session/attribution/challenge được refresh tự động không tạo một intent mới khi lần gửi trước chưa có kết quả. Khi bấm gửi lại giữ cả body gốc và key gốc; 4xx xuất hiện sau một phản hồi mất/5xx không chứng minh lần trước chưa commit. Trạng thái pending hiện chỉ ở RAM trong tab; reload/đóng tab sẽ mất. Chỉ challenge_token được loại khỏi digest, có thể bổ sung sau challenge. Chụp body/serialized JSON cho pending intent; chỉnh consent, quote_token, session hoặc notes trong retry chưa biết kết quả sẽ gây IDEMPOTENCY_CONFLICT. Không xoay key để né 409 hoặc rate limit. Nếu server đã trả lỗi validation rõ ràng, khách sửa form tạo một intent mới có thể dùng key mới. Chống double click trên cả bottom sheet và landing form; không tự gửi hai request độc lập từ cùng một submit.

Quote hết hạn/không hợp lệ có thể được tiếp nhận thành needs_confirmation; đừng xóa lead thành công hoặc hứa giá cố định. Async enrichment/assignment/conversion xảy ra sau commit, không chờ chúng rồi mới báo tiếp nhận.

Nếu 403 CHALLENGE_REQUIRED: giữ form và intent, hiển thị Turnstile bằng site key công khai thật và action='lead' (server bắt buộc đúng action/hostname); POST /api/v1/leads/challenges/verify {session_token,phone,provider_token}. Response {challenge_token,expires_in:300,verification:'human_challenge'}. Dùng cùng session/phone và bổ sung token rồi submit lại. Challenge xác minh người thao tác, không xác minh chủ số điện thoại. Nếu chưa có session, có thể tạo session và intent mới sau lỗi từ chối rõ ràng; không làm vậy cho request timeout chưa biết đã lưu hay chưa. 429 đọc Retry-After và chờ, không loop nhanh.

## 7. Analytics, attribution, A/B và đánh giá visit

Sau analytics consent mới gửi POST /api/v1/events/batch {session_token,events:[...]}, tối đa 20 event/batch. Mỗi event có id UUID giữ nguyên khi retry, name thuộc whitelist, plan_id/region_id/experiment_id UUID hoặc null, variant chuỗi≤50 hoặc null. Response {accepted:n} đếm event mới; retry có thể accepted=0 mà không phải mất event.

Whitelist: view_plan, select_plan, select_region, compare_plans, start_form, view_cost, click_call, click_zalo, return_visit, experiment_exposure. Không có lead_submitted/purchase/freeform event. Không nhét phone, tên, IP, địa chỉ, nội dung ghi chú hoặc nguyên URL vào event.

POST /api/v1/touches dùng session_token, utm_source, utm_medium, utm_campaign≤100 theo regex của schema; platform rỗng hoặc google/meta/tiktok/zalo/seo/referral; click_id≤256 theo regex. UTM Unicode/khoảng trắng không phù hợp schema: kiểm tra hoặc bỏ trường không hợp lệ; không gửi gây lỗi cả form. Map gclid→google, fbclid→meta, ttclid→tiktok khi consent cho phép; backend hỗ trợ một click_id cho mỗi touch, không gửi cả object tracking. Chỉ gửi click ID khi có marketing consent và analytics consent cho liên kết attribution. Không tự suy luận platform từ chữ campaign bất kỳ. Response {attribution_token:string|null}; gắn vào lead khi có, không đưa vào URL hoặc persistent debug log.

GET /api/v1/experiments/{id}/variant?session_token=... trả {variant,experiment_version}. Có analytics consent mới cấp session token cho thử nghiệm có tracking; không có consent dùng biến thể mặc định. Query token là hợp đồng hiện tại, cần redaction ở logging. Gửi experiment_exposure một lần cho phiên/experiment version/variant đã thực sự hiển thị. Không chọn lại ngẫu nhiên mỗi render.

POST /api/v1/visits/assess {session_token} trả {status:'tracking_disabled'} hoặc {status:'estimated',intent,reasons,ruleset_version,computed_at,geoip,identity_verified:false}. Điểm là ước tính hành vi, GeoIP là suy đoán mạng; không hứa địa chỉ chính xác, chủ thuê bao hoặc xác suất mua. Không có API cho frontend tự gửi IP và khai thác danh tính.

Không chặn LCP/submit bằng SDK quảng cáo. Consent analytics của backend không tự cấu hình consent cho Pixel/GA/SDK ngoài: nếu cần các SDK, phải triển khai lựa chọn và mapping riêng đúng consent; không tải mặc định rồi cho rằng backend đã bảo vệ chúng. Conversion thật đi qua server queue/gateway; chỉ ghi thành công khi gateway có kết quả được xác nhận.

## 8. Admin: xác thực, quyền và MFA

Login POST /api/v1/auth/session {email,password,otp:''}. Khi MFA_REQUIRED, yêu cầu mã TOTP sáu chữ số và gửi lại endpoint cùng credentials + otp. Đây là mã từ authenticator, không phải SMS OTP; không dựng chức năng resend SMS. MFA_TOTP_REQUIRED báo tài khoản cần phương thức TOTP được hỗ trợ.

Success {user:{id},aal}. Server đặt pagefpt_admin_session HttpOnly, pagefpt_csrf readable; secure ở staging/production, thời gian mặc định 12 giờ, cấu hình 1..24 giờ. Không trả refresh/access token cho browser qua flow này. GET /api/v1/admin/me trả {id,aal,memberships}; lấy quyền từ memberships, không từ nhãn role trong template. Tài khoản không có factor có thể đăng nhập aal1; mutation/reveal cần MFA sẽ bị chặn. Chưa có API enroll MFA/step-up cho phiên hiện hữu; muốn aal2 cần đăng nhập lại với factor thật đã được thiết lập ngoài flow này.

DELETE /api/v1/auth/session + CSRF trả {signed_out:true,provider_revoked:boolean}; signed_out là phiên backend đã bị thu hồi, provider_revoked=false cần thông báo phù hợp chứ không giữ người dùng đăng nhập. Server tự refresh Supabase token; không có /auth/refresh frontend. SESSION_REFRESH_BUSY 503 cho GET có thể retry giới hạn.

401: xóa dữ liệu admin trong RAM, chuyển login/hiển thị phiên hết hạn. 403: phân biệt thiếu quyền, MFA_REQUIRED khi login, CSRF_FAILED; không tự lặp login hoặc kết luận mọi 403 là sai mật khẩu. PERMISSION_DENIED có thể do AAL2/scope; đọc me để giải thích và vẫn để server quyết định.

GET/PUT /api/v1/admin/memberships cần identity.manage + aal2. Body MembershipInput trong phụ lục: user_id, branch_id UUID, permissions enum, active, capacity, shift. Không tự gửi role:'admin'. Global scope dùng zero UUID 00000000-0000-0000-0000-000000000000. Shift weekdays thứ Hai=0..Chủ nhật=6, giờ start<end; validate uniqueness và capacity. Không có API tạo user Supabase trong project; membership không tạo tài khoản. Server chặn cấp quyền vượt quyền người cấp và gỡ owner cuối cùng.

UI ẩn/disable hành động theo permission và aal; SQL vẫn kiểm tra branch, assignee và global scope. Ví dụ: reveal cần lead.read + lead.pii trong scope và aal2; observations cần lead.write + intelligence.write; assignment cần lead.write + lead.assign; feedback token cần care.write + lead.read. Lead đọc được bởi assignee/quyền lead.all theo scope; không coi có lead.read ở một branch là đọc mọi lead.

Khôi phục mật khẩu đã có API email cùng origin: POST /api/v1/auth/recovery {email} → 202 {accepted:true}, chỉ chuyển sang bước nhận mã sau response. POST /api/v1/auth/recovery/reset {email,otp,password,totp:''} xác minh OTP email type=recovery, active membership, MFA nếu đã đăng ký, rồi đổi mật khẩu. OTP email 6–8 chữ số; totp trống hoặc 6 chữ số; mật khẩu 8..1024 ký tự và còn chịu chính sách Supabase. Bước nhập mã chỉ kiểm tra định dạng; không tuyên bố xác thực trước khi reset thành công. Response thành công {changed:true,provider_revoked:boolean}; xóa credentials/codes, chuyển về login và yêu cầu đăng nhập lại. Mọi BFF session của user được thu hồi, cookie bị xóa; provider_revoked=false là logout toàn cục Supabase chưa xác nhận. Không đưa provider access/refresh token vào browser. MFA_REQUIRED, PASSWORD_REJECTED, UNAUTHENTICATED: cần mã email mới nếu mã trước đã được provider tiêu thụ; AUTH_UNAVAILABLE 503 không báo thành công; RATE_LIMITED 429 chờ trước khi thử. Xem docs/backend/password-recovery.md để cấu hình email template và migration. Chưa có recovery qua SMS, MFA enrollment hoặc API profile.

Luồng dev/test khi thiếu cấu hình Supabase Auth có preview authentication riêng trong code. Không dùng account/demo cookie đó để chứng minh đăng nhập production hoạt động. Đảm bảo môi trường deploy production/staging và test auth với tài khoản giả lập/fixture provider phù hợp, không phát tán credential demo như account thật.

## 9. Admin CRM: list, detail và hành động

GET /api/v1/admin/leads?limit=30&status=...&cursor=... trả {items,next_cursor}. limit 1..100; status dùng enum đúng. Cursor opaque một giờ, gắn actor và filter; đổi filter thì bỏ cursor. Triển khai tải thêm/trang kế tiếp, không chỉ 30 dòng đầu. Server chưa có search phone/name/date/score/sort/branch trên route này. Nếu muốn filter local, ghi rõ chỉ lọc các dòng đang tải; chức năng tìm kiếm toàn bộ cần API bổ sung.

GET /api/v1/admin/leads/{id} trả lead safe và observations, activities. Lead chứa id, status, version, evidence_version, assignee_id, branch_id, timestamps, SLA, quote_status, payload, scores... theo SQL. Phone nằm payload.phone_masked; scores có thể null trong khi worker chưa tính. Không trông chờ plaintext phone/name/address/notes trong list/detail. Notes hoạt động được mã hóa server và không trả plaintext trong timeline hiện tại; hiển thị metadata, không fake nội dung từ fixture.

Trang /admin/leads/detail?id=<UUID> phải hydrate từ GET detail thật, tải appointments/intelligence nếu cần, lấy quyền từ me. Không dùng lead-001, không dùng receipt làm ID. Empty/not-found/forbidden có UI riêng.

POST /api/v1/admin/leads/{id}/reveal không body, cần quyền/MFA; response plaintext {phone,name,installation_address,notes}. Chỉ gọi khi người có quyền bấm reveal, hiển thị trong RAM và xóa khi đổi lead/logout. Không prefetch mọi số điện thoại, không tự chèn vào data-* hoặc analytics. Backend audit mỗi reveal.

Các lệnh xử lý:

| Tác vụ | Lệnh và body | Kết quả/điểm cần xử lý |
|---|---|---|
| Phân công tự động | POST leads/{id}/assignments {expected_version:lead.version} | Lead safe mới hoặc {status:'unassigned',id}; không có assignee_id chọn tay |
| Chuyển trạng thái | POST leads/{id}/transitions {expected_version,status,reason,installation} | Lead safe mới; chỉ chuyển theo bảng dưới |
| Bổ sung bằng chứng | POST leads/{id}/observations {field,value,status,evidence_ref,expires_at} | Lead safe, tăng version/evidence_version, queue tính lại |
| Ghi call/note/tác vụ | POST leads/{id}/activities {kind,notes,due_at} | Lead safe; refetch detail/timeline; không phải Activity DTO |
| Lịch hẹn mới | POST leads/{id}/appointments {expected_version:lead.version,due_at,kind,notes} | Appointment safe; refetch lead.version |
| Danh sách lịch | GET leads/{id}/appointments | {items:[appointment]}, tối đa 100 |
| Đổi lịch/trạng thái lịch | PATCH /api/v1/admin/appointments/{id} {expected_version:appointment.version,status,due_at} | Appointment safe, chỉ lịch đang pending |
| Xác nhận lại quote | POST leads/{id}/quotes/confirm {expected_version:lead.version,quote_token} | Lead safe; quote phải cùng plan/region và revision hiện hành |
| Đọc điểm/bằng chứng | GET leads/{id}/intelligence | {scores,evidence_version,observations} |
| Yêu cầu tính lại | POST leads/{id}/recompute không body | 202 {queued:true,job_id,evidence_version}; chờ worker, không hiển thị đã tính xong |

Bảng trạng thái hợp lệ:

| Hiện tại | Đích được phép |
|---|---|
| new | assigned, invalid, rejected, duplicate |
| assigned | contacting, unreachable, rejected |
| contacting | contacted, unreachable, invalid, rejected |
| contacted | qualified, no_infrastructure, rejected |
| qualified | survey, quoted, closed, rejected |
| survey | quoted, no_infrastructure, rejected |
| quoted | closed, rejected |
| closed | installed, rejected |
| unreachable | contacting, rejected |
| no_infrastructure | survey, rejected |
| installed / invalid / duplicate / rejected | Terminal, không có đích tiếp theo |

Dùng survey, không dùng surveying. installed bắt buộc installation.reference không rỗng; invalid/rejected/duplicate bắt buộc reason. Phân công chọn nhân viên server theo ca/capacity/tải, kết quả unassigned không phải lỗi API. Đừng gọi transition assigned rồi tưởng đã cấp assignee.

Observation field enum: otp/contacted/needs_confirmed cần boolean; need/region/infrastructure nhận boolean hoặc yes/no/unknown; home_isp/phone_carrier nhận boolean hoặc chuỗi≤250. status confirmed/inferred/unknown, evidence_ref 1..500 bắt buộc, expires_at timezone nếu có. Frontend không tạo bằng chứng otp=true từ challenge Turnstile hoặc suy đoán đầu số; đây là dữ liệu staff xác nhận có nguồn.

Activity kind call/note/appointment/complaint/resolved. Nếu cần quản lý lịch nhắc có trạng thái, dùng appointments API, không chỉ activity kind=appointment. due_at/preferred time frontend luôn gửi timezone. Quote stale/conflict phải tải quote mới và xin thao tác xác nhận thật, không tự ghi đè.

Scores hiện có contact_confidence, intent, fit có thể null, completeness, automation_risk, reasons, ruleset_version, computed_at. contact_confidence/intent/fit/automation_risk là số nguyên 0..100; completeness là tỷ lệ 0..1, chỉ nhân 100 cho trường này khi hiển thị phần trăm; null='Chưa đủ dữ liệu', không phải 0%. Phone prefix_carrier chỉ inferred; current_carrier/home_isp mặc định unknown, owner_verified=false. GeoIP có status/source/country/city/accuracy_radius/asn/isp nếu có dữ liệu. Không gọi score là xác minh danh tính/nhà mạng hiện tại hay 'độ tin cậy chắc chắn'.

## 10. Realtime và kiểm soát tải

Cơ chế frontend hiện tại là polling /api/v1/admin/changes?after=<cursor> khoảng 5 giây, không phải WebSocket/SSE. Response {items:[{cursor,entity_id,type}]}, tối đa 100. Cursor là audit integer, khác lead-list cursor token. Tiến cursor bằng max các item đã xử lý; nếu đủ 100, drain trang kế tiếp có backoff để không bỏ thay đổi. Đây là audit projection: khi có lead.all/global, entity_id còn có thể là page/price/privacy/membership, không chỉ lead. Phân loại type trước khi refetch; event non-lead hoặc chưa hỗ trợ vẫn tiến cursor, không gọi GET leads/{entity_id} cho mọi item. Batch entity IDs phù hợp, refetch dữ liệu được quyền đọc, debounce render và bỏ poll khi tab ẩn; restart/catch-up khi hiện lại. Chỉ dùng một vòng polling/tab, tránh request chồng nhau.

Nếu không có cursor mới, không refetch toàn bộ dashboard liên tục. Dữ liệu thay đổi cần refetch: lead detail/list, intelligence, appointments; hoạt động async có thể tăng version, không giữ version cũ để mutation. Toast từ change event không chứa PII.

Database có cơ chế private broadcast, nhưng browser cookie BFF không cung cấp Supabase SDK JWT. Không đưa job secret/service-role vào SDK để có realtime. Nếu chuyển sang private Supabase realtime phải thiết kế cấp token/scope và kiểm thử riêng; trước mắt dùng durable polling hiện có. Không hứa độ trễ sub-second từ polling 5 giây.

## 11. Admin catalog, vùng, sản phẩm, giá và promotion

Resource groups có CRUD: plans, regions, products, promotions, pages, campaigns, experiments, integrations. Với mỗi nhóm: GET list ?limit=1..100 mặc định 30; POST create bằng Input tương ứng; GET /{id}; PUT /{id}?expected_version=<record.version> bằng full typed Input; POST /{id}/retire {expected_version}. Không có DELETE hoặc generic PATCH.

Admin Resource DTO có {id,kind,branch_id,payload,status,version,published_payload,published_version,created_at,updated_at,...}; editor dùng payload, public UI dùng snapshot published. PUT fullbody whitelist từ schema; không gửi id,kind,status,version,published_payload. Trường branch_id của resource có scope khi schema cho phép; update bị chặn đổi scope.

Publish POST /api/v1/admin/{kind}/{id}/publish {expected_version}, chỉ kind plans/products/regions/promotions/pages/experiments/prices. Cần aal2; quyền prices=pricing.publish, pages=content.publish, experiments=marketing.write, còn lại catalog.write. campaigns và integrations không có publish. Tạo/sửa draft không có nghĩa đã public. Version và trạng thái sau mutation phải lấy từ response/refetch; không ép published trong frontend.

RegionInput: zone_id mien_bac/mien_trung/mien_nam/khac; name,code,branch_id bắt buộc; price_group_id có thể null, aliases tối đa 30. PlanInput: name/service/code, description, speed_mbps, equipment. ProductInput: name/service/code/description/plan_ids. Product hiện có admin CRUD/publish nhưng không public product list; trang sản phẩm dùng dữ liệu published được backend hỗ trợ hoặc yêu cầu extension, không gọi admin endpoint từ client.

Price API riêng: GET /api/v1/admin/prices?limit=30&before=<UUID cuối>, GET /prices/{id}, POST /prices, PUT /prices/{id}?expected_version=n, POST /prices/{id}/retire {expected_version}; publish qua generic path kind=prices. List dùng keyset before UUID, không trả next_cursor token. Không trộn với lead cursor hoặc tự giả có offset.

PriceInput gồm plan_id, scope_kind region/group/default, scope_id, billing_months, monthly_vnd, setup_vnd, equipment_vnd, vat_included, vat_bps, gift_months, start, end, source. Default scope_id là zero UUID; region/group phải dùng UUID đúng đối tượng. VND 0..1e9 integer, VAT bps 0..10000 (1000=10%), start/end aware, end>start khi có. Source phải có nguồn giá 1..500 ký tự, không tự tạo giá theo website tham khảo chưa được xác nhận.

Một khác biệt response hiện có: POST price/publish có thể trả effective range; GET/list/update/retire trả start/end thay effective. Adapter không giả định cả hai giống nhau: refetch GET price sau tạo/publish để hydrate editor nhất quán.

Import giá: đọc file CSV thành string, POST /prices/imports/preview {csv}; không multipart. ≤256 KiB text và ≤100 dòng dữ liệu; body boundary riêng imports tối đa 1 MiB. Cột theo PriceInput; blank bỏ field optional; parse booleans rõ ràng. Response {rows,errors:[{row,code}],approval_token,status:'draft_only'}. Chỉ enable apply khi errors rỗng/token có. POST /imports/apply {csv,approval_token} cần aal2, token khoảng 15 phút gắn actor và digest. Kết quả import tạo drafts theo transaction, không tự publish; chỉnh CSV phải preview lại. Không retry apply mù vì không có idempotency header cho operation này.

PromotionInput có name,discount_vnd,priority,group,start,end,plan_ids,region_ids. Khoảng hiệu lực timezone end>start; promotion áp dụng theo engine, không cộng/stack phía client. Không coi giá draft hoặc lịch tương lai là giá hiện tại.

## 12. CMS, redirect và display settings

CMS pages CRUD/publish ở phần trên. PageInput title,slug,blocks,description,canonical_path. Block chỉ có type,text,url,media_id; type text/heading/cta/image/pricing/faq. Không có fields plan_id, HTML, hero_json hay FAQ object riêng trong Block hiện tại. Nếu UX cần block có cấu trúc richer, yêu cầu DTO extension, không gửi field lạ.

Render text qua textContent/escape Jinja, không innerHTML dữ liệu API. Link chỉ HTTP/HTTPS hoặc local path theo validator; kiểm tra đích phù hợp trước render. Public page chỉ là snapshot published; không lộ draft qua endpoint admin. POST /api/v1/admin/pages/{id}/schedule {expected_version,publish_at} cần content.publish + aal2, publish_at tương lai có timezone; job queued không phải đã published.

Redirect: GET /api/v1/admin/redirects, PUT cùng path {path,target,status_code}; status_code 301/302/307/308, đường dẫn local hợp lệ, không query/hash/protocol-relative/reserved route. GET /api/v1/redirects/resolve?path=... trả HTTP redirect với Location, không JSON. Browser fetch có thể follow; dùng điều hướng/routing server phù hợp thay vì parse JSON. SEO GET /sitemap.xml và /robots.txt; không đưa admin/private URL vào sitemap.

GET /api/v1/system/display-settings trả object flat và version, mặc định version=0 khi chưa có record. POST cùng URL cần content.publish global + aal2, body expected_version>=0 và các field patch. Response {success:true,settings:{...version}}; không gán success=true local trước khi response tới.

Fields: fpt_anim boolean; fpt_anim_style wave/bounce/glow; runline_enabled; runline_speed slow/normal/fast; runline_text≤2000; banner_zones object boolean chỉ sáu keys hero_slider/showcase_posters/ribbon_banner/promo_grid/app_banner/floating_promo; lenis_scroll; tilt_parallax. Top-level patch bỏ các field không đổi; banner_zones được SQL merge từng key với map hiện hành; có thể gửi các key thay đổi, giữ đầy đủ map khi render UI. Render runline_text an toàn. Đây là cấu hình hiển thị, không phải API chỉnh asset banner, tài khoản/hotline hoặc toàn bộ site.

## 13. Media R2

Flow upload admin:

1. Kiểm tra File JPEG/PNG/WebP, size≤10 MiB; POST /api/v1/admin/media/upload-intents {filename,content_type,size_bytes} cần content.write và CSRF.
2. Nhận {id,upload_url,expires_in:300,headers:{'Content-Type':...}}. PUT upload_url với body File, headers được trả. Đây là URL R2 khác origin: không đính cookie admin, Authorization, X-CSRF-Token hoặc JSON.stringify File. Cần R2 CORS cho origin thật và PUT/Content-Type theo setup.
3. Sau PUT thành công POST /api/v1/admin/media/{id}/finalize không body, qua API admin có CSRF. Server kiểm bytes/type/dimensions≤40MP, loại metadata và xuất WebP tên hash.
4. Chỉ dùng {id,state:'ready',url} để lưu vào CMS. PUT thành công riêng chưa có nghĩa asset được public.

Không nhận SVG, file tùy ý hoặc dùng quarantine URL làm ảnh public. Signed upload hết hạn tạo intent phù hợp và giữ trạng thái lỗi rõ. Backend chưa có media library list/delete endpoint; không dựng fetch /admin/media rồi giả có dữ liệu. MEDIA_DOMAIN/R2_PUBLIC_BUCKET phải cấu hình để finalize hoạt động.

## 14. Marketing admin và tích hợp ngoài

Campaigns CRUD: name,platform,utm_campaign,branch_id nullable. Không có schedule/publish campaign endpoint hoặc danh sách chi phí campaign riêng. Experiments CRUD/publish: variants 2..5, tên unique, weights cộng đúng 10000, salt 32..128; frontend nhận variant từ public endpoint, không tự tính salt assignment.

Integrations CRUD cần marketing.write + aal2, payload name/platform/enabled/description; platform google/meta/tiktok/notification. Chỉ là công tắc/cấu hình nghiệp vụ, không nhận access token/API secret vào payload. GET /api/v1/admin/integration-capabilities cần aal2, trả tình trạng server đã bật/configure URL; không phải màn hình cấu hình secrets.

GET /api/v1/admin/deliveries cần marketing.write + aal2 và global scope; returns {items:[delivery]} không result chi tiết. POST /deliveries/{id}/reconcile {state:'accepted'|'failed'|'retry',evidence_ref} cần cùng quyền/MFA. Chỉ reconcile kết quả unknown với bằng chứng thật; không biến timeout thành accepted để dashboard đẹp.

POST /api/v1/admin/costs {campaign_id,day,cost_vnd}; day YYYY-MM-DD, VND integer≤1e11. Chưa có GET costs/import CSV spend hoặc report ROAS/CPL/channel conversion. Chỉ triển khai nhập chi phí thật; màn biểu đồ quảng cáo ngoài hợp đồng phải ghi thiếu backend, không dùng fixtures làm số thật.

Webhook POST /api/v1/webhooks/leads/{provider}: provider google/meta/tiktok/crm; body {provider_event_id,lead:<LeadRequest>}; headers x-webhook-timestamp và x-webhook-signature HMAC, tolerance 5 phút, signature server theo provider.timestamp.rawbody. Đây là bridge của PageFPT, không phải endpoint cắm trực tiếp native payload Meta/Google mà bỏ mapping/xác thực. Browser không giữ incoming webhook secret và không gọi endpoint này cho form.

## 15. Chăm sóc, feedback và referral

PUT /api/v1/admin/leads/{id}/preferences {marketing_allowed,service_contact_allowed,complaint_open}; care.write và scope đọc lead. Object trả resource safe, không có expected_version trong input hiện tại. Giữ consent/suppression của contact, không coi marketing_allowed tự động cấp consent quảng cáo bên ngoài.

POST /api/v1/admin/followups {lead_id,channel,purpose,scheduled_at} cần care.write; channel call/sms/email/zalo, purpose service/marketing/upsell, scheduled_at aware. GET /admin/followups trả {items:resource[]}, tối đa 100. Tạo draft/queue không có nghĩa tin nhắn đã gửi. Provider/config chưa sẵn phải hiện đúng trạng thái. Worker có consent/suppression, quiet hours và giới hạn tần suất; UI không gửi trực tiếp ra Zalo/SMS khi tạo lịch.

POST /admin/followups/{id}/reconcile {state,evidence_ref} cần care.approve + aal2. Không tự retry delivery unknown; operator reconcile với chứng cứ. Đây không phải endpoint sửa lịch followup tổng quát.

POST /admin/leads/{id}/feedback-token không body, response {token} khoảng 7 ngày. Form feedback public POST /api/v1/feedback {token,rating:1..5,comment:''}. Token nhạy cảm không đưa vào analytics/log; không có GET đọc feedback plaintext cho admin. Mỗi lead đã gửi feedback có thể bị 409 FEEDBACK_ALREADY_RECORDED; hiển thị phù hợp.

POST /admin/referrals {referrer_lead_id,referred_lead_id,installation_reference}, care.write; POST /admin/referrals/{id}/approve {expected_version}, care.approve + aal2. Backend kiểm không tự giới thiệu cùng contact và có lead installed/installation reference. Chưa có GET referral list hoặc payout endpoint; giữ id từ response phục vụ approve, không fake bảng lịch sử/payout.

## 16. Reports, audit, jobs, quyền dữ liệu và export

GET /api/v1/admin/reports trả {funnel:{leads,contacted,qualified,installed,overdue},definition_version,as_of}; quyền report.read và scope. Dashboard dùng dữ liệu thật với thời điểm cập nhật, không bịa doanh thu/spend/ROAS từ funnel.

GET /admin/reports/daily trả {items:[{day,branch_id,payload,...}]}, tối đa 100; POST /admin/reports/rebuild {day} quyền report.read, response {rebuilt:true}; definition_version nằm trong payload của daily metric. Manual rebuild tạo payload definition_version='v1', auto dirty-metrics tạo 'v2' với định nghĩa khác; đọc definition_version trước so sánh chart, không trộn trường còn thiếu thành số 0. API không nhận arbitrary date range/campaign/branch query trên routes này.

GET /admin/audit?after=0 cần governance.audit + aal2, {items} tối đa 100; cursor theo id cuối, không phải lead cursor. GET /admin/jobs cần workflow.manage global; {items} jobs bỏ result. POST /admin/jobs/{id}/replay không body cần workflow.manage + aal2, queued không phải job đã xong. Browser chỉ gọi route admin replay; /internal/jobs/process/recover là worker secret, cấm đưa nút browser gọi trực tiếp.

Privacy: POST /admin/privacy/requests {lead_id,action:'delete'|'stop_marketing',reason}, governance.write + aal2; nhận resource id. POST /admin/privacy/requests/{id}/execute không body, governance.delete + aal2, ghi nhận kết quả thật. Xóa có thể liên quan nhiều lead cùng contact và cần quyền toàn phạm vi; lỗi scope không bypass bằng xóa từng dòng local. Chưa có GET privacy request list hay public yêu cầu quyền dữ liệu. Những màn đó cần endpoint bổ sung hoặc giữ id hiện có, không tự giả routes.

Export: POST /admin/exports {format:'csv',branch_id:null|UUID}, governance.export + aal2, R2 phải sẵn. Response 201 {id,state:'queued'}. Poll GET /admin/exports/{id} giới hạn/backoff đến status='complete'; khi có download_urls dùng URL ký private (~60 giây). Nếu hết hạn gọi GET lại để server kiểm quyền/cấp lại, không lưu URL vào DB/localStorage/analytics. Trạng thái erased hoặc EXPORT_INVALIDATED 410 phải ngừng download và báo không còn khả dụng.

CSV hiện chỉ gồm metadata lead id/status/created_at/quote_status; không có phone/name/address hoặc include_phone option. Đừng hứa nút 'Xuất danh sách số điện thoại'. Khi nhiều chunk, hiển thị các file phần theo download_urls; không nối serverless download khổng lồ. URL đã ký cần giữ riêng tư; thay đổi quyền/xóa có giới hạn thời gian URL ký còn sống, không gọi đó là truy cập được kiểm quyền lại từng byte download.


Thông tin vận hành dành riêng server, không triển khai thành nút gọi từ browser: POST /internal/jobs/process nhận JSON {queue:'lead_local'} (ProcessInput ở phụ lục), queue chọn lead_local/lead_external/conversions/notifications/maintenance. GET /internal/jobs/recover không body chạy schedule tick và các queue batch nhỏ, response {queues:[...]}. Cả hai yêu cầu X-Job-Secret: <PAGEFPT_JOB_SECRET> hoặc Authorization: Bearer <PAGEFPT_JOB_SECRET>, so sánh server; không phải JWT admin. Kết quả process là thống kê worker, đọc theo source worker.py, không dùng làm receipt khách.

Health: GET /health/live {status:'alive'}; GET /health/ready {status:'ready'} khi DB RPC được. Chỉ dùng cho trạng thái vận hành; ready không xác nhận Auth/R2/advertising gateway đã hoạt động đầy đủ.

## 17. Quy tắc version, response và lỗi

| Operation | expected_version ở đâu | Version lấy từ |
|---|---|---|
| PUT generic resource và PUT price | Query | GET resource/price.version |
| publish/retire/transition/assignment/confirm quote | Body | Entity/lead.version |
| Schedule page | Body | Page.version |
| Tạo appointment | Body | Lead.version |
| PATCH appointment | Body | Appointment.version |
| Approve referral | Body | Referral resource.version |
| POST display settings | Body, cho phép 0 lần đầu | Display settings.version |

Những operation không khai báo version không tự thêm field đó vào body. VERSION_CONFLICT 409: refetch entity và hiển thị thay đổi; giữ input đang nhập cho người dùng kiểm tra, không tự lấy version mới rồi ghi đè. IDEMPOTENCY_CONFLICT 409 khác VERSION_CONFLICT; không đổi key để ép lưu. INVALID_TRANSITION 409: cập nhật danh sách trạng thái từ detail, không coi UI dropdown là quyết định cuối.

Lỗi nên xử lý:

| HTTP/code | UI/hành vi |
|---|---|
| 401 UNAUTHENTICATED | Admin chuyển login; public token hết hạn xử lý phiên phù hợp |
| 403 PERMISSION_DENIED | Thiếu permission/scope/MFA; không fallback dữ liệu giả |
| 403 CSRF_FAILED | Dừng mutation, kiểm cookie/origin/phiên; không bỏ header để retry |
| 403 MFA_REQUIRED / MFA_TOTP_REQUIRED khi login | Hiển thị TOTP hoặc yêu cầu factor hỗ trợ |
| 403 CHALLENGE_REQUIRED | Luồng human challenge của lead |
| 409 VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / INVALID_TRANSITION / QUOTE_STALE | Xử lý theo operation, không auto overwrite |
| 410 EXPORT_INVALIDATED | Ngừng tải, xóa URL khỏi UI |
| 422 VALIDATION_ERROR | fields map body.<field>/query.<field> vào form, giữ input |
| 413 BODY_TOO_LARGE | Giảm payload; không retry cùng body vô hạn |
| 429 RATE_LIMITED | Đọc Retry-After, cooldown |
| 503 SESSION_REFRESH_BUSY | Retry GET giới hạn; mutation cần quyết định theo semantics |
| 5xx/network/timeout | Thông báo chưa có xác nhận; retry chỉ khi an toàn |

Một số domain code khác có trong code: INVALID_CURSOR, CONTACT_NOT_PERMITTED, FEEDBACK_ALREADY_RECORDED, LAST_OWNER_REQUIRED, PRIVILEGE_ESCALATION, DUPLICATE_RESOURCE, INVALID_IMPORT, MEDIA_DOMAIN_UNCONFIGURED. Map theo code thật; không hardcode mọi 422 là sai số điện thoại. Envelope fields có thể rỗng. API JSON body bình thường giới hạn 16 KiB; cả request chứa token và form cũng phải nằm trong hạn, không chỉ từng field hợp lệ.

## 18. Mobile, hiệu năng và UX bắt buộc

Ưu tiên form phone + nhu cầu, mở rộng trường sau; input tel/inputmode tel, autocomplete thích hợp, error gần trường, consent rõ, bàn phím không che CTA. Tối thiểu 44px tap target; bottom sheet focus trap/ESC/nút đóng, xử lý safe-area và cuộn khi bàn phím mở. Không double-submit do touch+click hoặc listener trùng. Toast textContent, aria-live; giữ dữ liệu trong form khi lỗi, xóa sau receipt hợp lệ hoặc thao tác khách chủ động.

Giảm motion theo prefers-reduced-motion dù setting server bật hiệu ứng; hạn chế canvas/tilt/scroll engine trên mobile. Lazy-load ảnh dưới fold, kích thước ảnh cố định chống CLS; ưu tiên LCP image và HTML có nội dung meaningful. Không bắt đăng nhập khách, không ép bật tracking để gửi tư vấn. Analytics/challenge chỉ tải khi cần.

Module/bundle gọn; cache dữ liệu public trong RAM có expiry, request dùng connection/browser hiện có. Các endpoint admin không được gộp bằng cách bypass quyền hoặc lấy trực tiếp DB secret. Không hứa tốc độ hosting từ benchmark local; kiểm network thật/cold start sau khi có deployment.

## 19. Thứ tự thực hiện và tiêu chí nghiệm thu

Thực hiện trên giao diện hiện có, kiểm tra trạng thái file đồng thời trước khi sửa:

1. Audit mỗi nút/màn hình → endpoint/schema/quyền/response trong phụ lục; lập coverage thực hiện/chưa hỗ trợ. Tách fixture preview khỏi dữ liệu vận hành.
2. Hoàn thiện API adapter, error handling, cookie/CSRF, me/permissions, consent thật và lead idempotency/challenge. Kiểm mobile sớm.
3. Bind catalog/regions/quotes, hydration lead detail, pagination/list, transitions/evidence/appointments, intelligence và polling.
4. Bind giá/import/publish, CMS/schedule/redirect/settings và R2 upload; kiểm version và draft/published.
5. Bind reports, marketing, chăm sóc, membership, audit/jobs/privacy/export theo quyền; disable màn chưa có API.
6. Lập thay đổi backend cần thiết riêng: response DTO/security OpenAPI, phân rã các khoản quote còn thiếu, MFA enrollment, UI production mount + page guard và các endpoint list/detail còn thiếu. Chỉ triển khai mở rộng có hợp đồng rõ; không tạo routes giả trong JS.
7. Chạy kiểm chứng, ghi kết quả thật và hạn chế. Đừng báo production-ready nếu chỉ có mock provider/local preview.

Các kiểm tra tối thiểu cho integration:

- Mobile 360/390/430px: CTA, bàn phím, bottom sheet, validation, loading/error; keyboard/accessibility và desktop admin.
- Lead mới 201, double click/retry cùng key 200 cùng receipt; body khác key cũ 409; timeout sau commit không tạo hai leads; sai schema 422 vẫn giữ form; 429/challenge hoàn thành thật.
- Giá chưa chọn vùng/không có bảng giá trả cần xác nhận; quote confirmed đúng tổ hợp, response cũ không ghi đè, hết hạn không hứa giá; không có hardcoded commercial price.
- Consent false không events/touch link; opt-in/opt-out chạy đúng PUT; event retry giữ id, không PII trong network analytics/log/storage.
- Auth cookie thật, TOTP, CSRF mutation/logout, session expiry/refresh concurrent, aal1 không reveal/publish; không dùng demo auth để pass các case này.
- Lead pagination/filter cursor đúng; scope branch/assignee và quyền bị gỡ; reveal chỉ on-demand; hai admin cập nhật cùng version tạo 409 có UX giải quyết.
- State machine đầy đủ, lý do terminal/installation reference; appointment dùng đúng version; recompute202 chờ worker và refetch.
- Poll catch-up >100 changes, tabẩn/hiện, không vòng lặp chồng; chart không tự sinh fixture khi API lỗi.
- Giá import lỗi/preview/apply/token hết hạn; draft không public; publish đổi revision; CRUD scope không thay sai.
- Upload signed PUT binary đúng headers, expired URL/size/type lỗi; finalize ready mới dùng public URL.
- Export queued→complete/multipart URL ký→expiry/invalidated; privacy/permission denied; jobs replay chỉ quyền/MFA; không gọi internal từ browser.
- Tất cả nút unsupported không báo thành công giả. Không gửi SMS/email/ads hoặc thay đổi production trong test khi chưa có quyền riêng.

Khi hoàn thành báo: file sửa, coverage endpoint→màn hình, kiểm tra đã chạy/kết quả, API còn thiếu và cấu hình cloud cần cấp. Nêu rõ chức năng đã bind thật và chức năng cần backend; không gọi toàn dự án hoàn tất vì trang HTML render được.

## 20. Phụ lục hợp đồng request đầy đủ

Phụ lục sau được sinh từ route tree FastAPI hiện tại. Khi code thay đổi, chạy lại tools/export_frontend_contract.py rồi đồng bộ phần phụ lục của prompt. Các quy tắc custom validator và SQL ở phần trên bổ sung cho JSON Schema; schema không tự chứng minh quyền hay shape success response.

## Bổ sung: giá theo tỉnh/thành và xã/phường (2026-10-02)

Đọc [GIA-THEO-DIA-BAN.md](GIA-THEO-DIA-BAN.md) trước khi nối màn hình gói/bảng giá. Public regions/hierarchy chỉ trả tỉnh đã công bố; tải ward theo `/api/v1/regions/{province_id}/wards` và cursor. Khi khách chọn ward, dùng UUID ward làm region_id ở quotes và leads, đồng bộ chọn giữa trang chủ/form/landing, hủy token cũ ngay khi đổi. Giá ưu tiên ward→province→group→default; `not_available` không có quote_token. Admin dùng checkbox theo tên thay UUID, PlanInput thêm applicable_region_ids, RegionInput thêm level/parent_id, bulk giá nguyên tử và published replacement theo expected_version. Với bulk `publish=false` chỉ cần pricing.write; `publish=true` cần thêm pricing.publish và AAL2 (bảng sinh tự động liệt kê quyền tối đa của operation).

<!-- BEGIN GENERATED FRONTEND CONTRACT -->

# API và tham số kết nối frontend

Sinh từ code hiện tại bằng `uv run python tools/export_frontend_contract.py`. Không truy cập tài khoản cloud. Quyền trong bảng là kiểm tra Python; SQL còn kiểm tra scope/assignee/global. Response OpenAPI của phần lớn API chưa có DTO: xem response map trong prompt, không coi schema `{}` là hợp đồng đầy đủ.

Tổng 156 method/path: 152 có trong OpenAPI và 4 route worker/SEO ngoài OpenAPI.

## Toàn bộ method, URL, quyền và body

| Method | URL | Caller/quyền Python | MFA | Body model | Nguồn |
|---|---|---|---|---|---|
| GET | `/` | preview_html_only | — | — | `src/pagefpt/web/client_routes.py:26` |
| GET | `/admin` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:57` |
| GET | `/admin/content` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:120` |
| GET | `/admin/dashboard` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:79` |
| GET | `/admin/leads` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:84` |
| GET | `/admin/leads/detail` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:89` |
| GET | `/admin/login` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:74` |
| GET | `/admin/marketing` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:115` |
| GET | `/admin/operations` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:127` |
| GET | `/admin/pricing` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:96` |
| GET | `/admin/reports` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:103` |
| GET | `/admin/settings` | preview_html_only | — | — | `src/pagefpt/web/admin_routes.py:108` |
| PATCH | `/api/v1/admin/appointments/{id}` | lead.write | — | AppointmentUpdate | `src/pagefpt/modules/leads/appointments.py:58` |
| GET | `/api/v1/admin/assignees` | lead.assign | — | — | `src/pagefpt/modules/leads/admin.py:233` |
| GET | `/api/v1/admin/audit` | governance.audit | AAL2 | — | `src/pagefpt/modules/reporting/routes.py:33` |
| GET | `/api/v1/admin/campaigns` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/campaigns` | marketing.write | — | CampaignInput | `src/pagefpt/api/v1/resources.py:17` |
| GET | `/api/v1/admin/campaigns/{id}` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/campaigns/{id}` | marketing.write | — | CampaignInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/campaigns/{id}/retire` | marketing.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/changes` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:162` |
| GET | `/api/v1/admin/costs` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/costs` | marketing.write | — | CostInput | `src/pagefpt/modules/governance/routes.py:19` |
| GET | `/api/v1/admin/costs/{id}` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/costs/{id}` | marketing.write | — | CostInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/costs/{id}/retire` | marketing.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/deliveries` | marketing.write | AAL2 | — | `src/pagefpt/modules/integrations/routes.py:28` |
| POST | `/api/v1/admin/deliveries/{id}/reconcile` | marketing.write | AAL2 | ReconcileConversion | `src/pagefpt/modules/integrations/routes.py:40` |
| GET | `/api/v1/admin/experiments` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/experiments` | marketing.write | — | ExperimentInput | `src/pagefpt/api/v1/resources.py:17` |
| GET | `/api/v1/admin/experiments/{id}` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/experiments/{id}` | marketing.write | — | ExperimentInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/experiments/{id}/retire` | marketing.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| POST | `/api/v1/admin/exports` | governance.export | AAL2 | ExportInput | `src/pagefpt/modules/governance/routes.py:48` |
| GET | `/api/v1/admin/exports/{id}` | governance.export | AAL2 | — | `src/pagefpt/modules/governance/routes.py:61` |
| GET | `/api/v1/admin/followups` | care.write | — | — | `src/pagefpt/modules/care/routes.py:48` |
| POST | `/api/v1/admin/followups` | care.write | — | FollowupInput | `src/pagefpt/modules/care/routes.py:35` |
| POST | `/api/v1/admin/followups/{id}/reconcile` | care.approve | AAL2 | ReconcileInput | `src/pagefpt/modules/care/routes.py:102` |
| GET | `/api/v1/admin/integration-capabilities` | marketing.write | AAL2 | — | `src/pagefpt/modules/integrations/routes.py:14` |
| GET | `/api/v1/admin/integrations` | marketing.write | AAL2 | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/integrations` | marketing.write | AAL2 | IntegrationInput | `src/pagefpt/api/v1/resources.py:17` |
| GET | `/api/v1/admin/integrations/{id}` | marketing.write | AAL2 | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/integrations/{id}` | marketing.write | AAL2 | IntegrationInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/integrations/{id}/retire` | marketing.write | AAL2 | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/jobs` | workflow.manage | — | — | `src/pagefpt/modules/reporting/routes.py:40` |
| POST | `/api/v1/admin/jobs/{id}/replay` | workflow.manage | AAL2 | — | `src/pagefpt/modules/reporting/routes.py:47` |
| POST | `/api/v1/admin/lead-assignments` | lead.assign | — | BulkAssignmentCommand | `src/pagefpt/modules/leads/admin.py:240` |
| GET | `/api/v1/admin/lead-counts` | lead.read | — | — | `src/pagefpt/modules/administration/routes.py:226` |
| GET | `/api/v1/admin/lead-views` | lead.read | — | — | `src/pagefpt/modules/administration/routes.py:179` |
| POST | `/api/v1/admin/lead-views` | lead.read | — | LeadViewInput | `src/pagefpt/modules/administration/routes.py:186` |
| DELETE | `/api/v1/admin/lead-views/{id}` | lead.read | — | — | `src/pagefpt/modules/administration/routes.py:213` |
| PUT | `/api/v1/admin/lead-views/{id}` | lead.read | — | LeadViewInput | `src/pagefpt/modules/administration/routes.py:199` |
| GET | `/api/v1/admin/leads` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:101` |
| GET | `/api/v1/admin/leads/{id}` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:169` |
| POST | `/api/v1/admin/leads/{id}/activities` | lead.write | — | ActivityCommand | `src/pagefpt/modules/leads/admin.py:224` |
| GET | `/api/v1/admin/leads/{id}/appointments` | lead.read | — | — | `src/pagefpt/modules/leads/appointments.py:40` |
| POST | `/api/v1/admin/leads/{id}/appointments` | lead.write | — | AppointmentCreate | `src/pagefpt/modules/leads/appointments.py:47` |
| POST | `/api/v1/admin/leads/{id}/assignments` | lead.assign | — | AssignmentCommand | `src/pagefpt/modules/leads/admin.py:184` |
| POST | `/api/v1/admin/leads/{id}/feedback-token` | care.write | — | — | `src/pagefpt/modules/care/routes.py:55` |
| GET | `/api/v1/admin/leads/{id}/intelligence` | lead.read | — | — | `src/pagefpt/modules/intelligence/routes.py:16` |
| POST | `/api/v1/admin/leads/{id}/observations` | intelligence.write | — | ObservationCommand | `src/pagefpt/modules/leads/admin.py:211` |
| PUT | `/api/v1/admin/leads/{id}/preferences` | care.write | — | PreferencesInput | `src/pagefpt/modules/care/routes.py:22` |
| POST | `/api/v1/admin/leads/{id}/quotes/confirm` | lead.write | — | ConfirmQuote | `src/pagefpt/modules/pricing/routes.py:98` |
| POST | `/api/v1/admin/leads/{id}/recompute` | intelligence.write | — | — | `src/pagefpt/modules/intelligence/routes.py:23` |
| POST | `/api/v1/admin/leads/{id}/reveal` | lead.pii | AAL2 | — | `src/pagefpt/modules/leads/admin.py:176` |
| POST | `/api/v1/admin/leads/{id}/transitions` | lead.write | — | TransitionCommand | `src/pagefpt/modules/leads/admin.py:202` |
| GET | `/api/v1/admin/locations` | catalog.write | — | — | `src/pagefpt/modules/catalog/routes.py:86` |
| GET | `/api/v1/admin/locations/source` | catalog.write | — | — | `src/pagefpt/modules/catalog/geography_routes.py:22` |
| POST | `/api/v1/admin/locations/sync` | catalog.write | AAL2 | GeographySyncInput | `src/pagefpt/modules/catalog/geography_routes.py:37` |
| GET | `/api/v1/admin/me` | admin | — | — | `src/pagefpt/modules/identity/routes.py:9` |
| POST | `/api/v1/admin/media/upload-intents` | content.write | — | UploadInput | `src/pagefpt/modules/media/routes.py:24` |
| POST | `/api/v1/admin/media/{id}/finalize` | content.write | — | — | `src/pagefpt/modules/media/routes.py:49` |
| GET | `/api/v1/admin/memberships` | identity.manage | AAL2 | — | `src/pagefpt/modules/identity/routes.py:15` |
| PUT | `/api/v1/admin/memberships` | identity.manage | AAL2 | MembershipInput | `src/pagefpt/modules/identity/routes.py:24` |
| GET | `/api/v1/admin/operations/settings` | 'lead.read' if actor.permits('lead.read') else 'workflow.manage' | — | — | `src/pagefpt/modules/administration/routes.py:33` |
| PUT | `/api/v1/admin/operations/settings` | workflow.manage | AAL2 | OperationalSettings | `src/pagefpt/modules/administration/routes.py:40` |
| GET | `/api/v1/admin/operations/status` | workflow.manage | — | — | `src/pagefpt/modules/administration/routes.py:53` |
| GET | `/api/v1/admin/pages` | content.write | — | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/pages` | content.write | — | PageInput | `src/pagefpt/api/v1/resources.py:17` |
| GET | `/api/v1/admin/pages/{id}` | content.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/pages/{id}` | content.write | — | PageInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/pages/{id}/retire` | content.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| POST | `/api/v1/admin/pages/{id}/schedule` | content.publish | AAL2 | ScheduleInput | `src/pagefpt/modules/content/scheduling.py:24` |
| GET | `/api/v1/admin/plans` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:43` |
| POST | `/api/v1/admin/plans` | catalog.write | — | PlanInput | `src/pagefpt/modules/catalog/routes.py:112` |
| GET | `/api/v1/admin/plans/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/plans/{id}` | catalog.write | — | PlanInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/plans/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/prices` | pricing.write | — | — | `src/pagefpt/modules/pricing/routes.py:15` |
| POST | `/api/v1/admin/prices` | pricing.write | — | PriceInput | `src/pagefpt/modules/catalog/routes.py:165` |
| POST | `/api/v1/admin/prices/bulk` | pricing.write; pricing.publish | AAL2 | BulkPriceInput | `src/pagefpt/modules/pricing/routes.py:30` |
| POST | `/api/v1/admin/prices/imports/apply` | pricing.write | AAL2 | ApplyInput | `src/pagefpt/modules/pricing/imports.py:66` |
| POST | `/api/v1/admin/prices/imports/preview` | pricing.write | — | ImportInput | `src/pagefpt/modules/pricing/imports.py:48` |
| GET | `/api/v1/admin/prices/{id}` | pricing.write | — | — | `src/pagefpt/modules/pricing/routes.py:58` |
| PUT | `/api/v1/admin/prices/{id}` | pricing.write | — | PriceInput | `src/pagefpt/modules/pricing/routes.py:65` |
| POST | `/api/v1/admin/prices/{id}/replace` | pricing.write; pricing.publish | AAL2 | PriceInput | `src/pagefpt/modules/pricing/routes.py:41` |
| POST | `/api/v1/admin/prices/{id}/retire` | pricing.publish | AAL2 | VersionCommand | `src/pagefpt/modules/pricing/routes.py:81` |
| POST | `/api/v1/admin/privacy/requests` | governance.write | AAL2 | PrivacyInput | `src/pagefpt/modules/governance/routes.py:32` |
| POST | `/api/v1/admin/privacy/requests/{id}/execute` | governance.delete | AAL2 | — | `src/pagefpt/modules/governance/routes.py:41` |
| GET | `/api/v1/admin/products` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/products` | catalog.write | — | ProductInput | `src/pagefpt/api/v1/resources.py:17` |
| GET | `/api/v1/admin/products/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/products/{id}` | catalog.write | — | ProductInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/products/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/promotions` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:57` |
| POST | `/api/v1/admin/promotions` | catalog.write | — | PromotionInput | `src/pagefpt/api/v1/resources.py:17` |
| GET | `/api/v1/admin/promotions/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/promotions/{id}` | catalog.write | — | PromotionInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/promotions/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/redirects` | content.write | — | — | `src/pagefpt/modules/content/redirects.py:56` |
| PUT | `/api/v1/admin/redirects` | content.publish | AAL2 | RedirectInput | `src/pagefpt/modules/content/redirects.py:49` |
| POST | `/api/v1/admin/referrals` | care.write | — | ReferralInput | `src/pagefpt/modules/care/routes.py:75` |
| POST | `/api/v1/admin/referrals/{id}/approve` | care.approve | AAL2 | VersionCommand | `src/pagefpt/modules/care/routes.py:84` |
| GET | `/api/v1/admin/regions` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:43` |
| POST | `/api/v1/admin/regions` | catalog.write | — | RegionInput | `src/pagefpt/modules/catalog/routes.py:117` |
| GET | `/api/v1/admin/regions/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:62` |
| PUT | `/api/v1/admin/regions/{id}` | catalog.write | — | RegionInput | `src/pagefpt/api/v1/resources.py:30` |
| POST | `/api/v1/admin/regions/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:67` |
| GET | `/api/v1/admin/reports` | report.read | — | — | `src/pagefpt/modules/governance/routes.py:12` |
| GET | `/api/v1/admin/reports/daily` | report.read | — | — | `src/pagefpt/modules/reporting/routes.py:26` |
| POST | `/api/v1/admin/reports/rebuild` | report.read | — | RebuildInput | `src/pagefpt/modules/reporting/routes.py:17` |
| GET | `/api/v1/admin/reports/summary` | report.read | — | — | `src/pagefpt/modules/administration/routes.py:139` |
| GET | `/api/v1/admin/workspace/{kind}` | RESOURCE_PERMISSIONS[kind] | — | — | `src/pagefpt/modules/administration/routes.py:105` |
| POST | `/api/v1/admin/{kind}/{id}/publish` | prices:pricing.publish; pages:content.publish; experiments:marketing.write; plans/products/regions/promotions:catalog.write | AAL2 | VersionCommand | `src/pagefpt/modules/catalog/routes.py:122` |
| POST | `/api/v1/auth/recovery` | active membership after provider proof on reset | — | RecoveryEmail | `src/pagefpt/modules/identity/recovery.py:41` |
| POST | `/api/v1/auth/recovery/reset` | active membership after provider proof on reset | — | ResetPassword | `src/pagefpt/modules/identity/recovery.py:50` |
| DELETE | `/api/v1/auth/session` | login_or_cookie_session | — | — | `src/pagefpt/modules/identity/sessions.py:165` |
| POST | `/api/v1/auth/session` | login_or_cookie_session | — | Login | `src/pagefpt/modules/identity/sessions.py:113` |
| GET | `/api/v1/catalog` | public | — | — | `src/pagefpt/modules/catalog/routes.py:33` |
| PUT | `/api/v1/consent` | public | — | ConsentUpdate | `src/pagefpt/modules/marketing/routes.py:27` |
| POST | `/api/v1/events/batch` | public | — | EventBatch | `src/pagefpt/modules/marketing/routes.py:38` |
| GET | `/api/v1/experiments/{id}/variant` | public | — | — | `src/pagefpt/modules/marketing/routes.py:86` |
| POST | `/api/v1/feedback` | public | — | FeedbackInput | `src/pagefpt/modules/care/routes.py:67` |
| POST | `/api/v1/leads` | public | — | LeadRequest | `src/pagefpt/modules/leads/routes.py:11` |
| POST | `/api/v1/leads/challenges/verify` | public | — | ChallengeInput | `src/pagefpt/modules/abuse/challenges.py:22` |
| GET | `/api/v1/pages/{slug}` | public | — | — | `src/pagefpt/modules/content/routes.py:11` |
| POST | `/api/v1/quotes` | public | — | QuoteRequest | `src/pagefpt/modules/catalog/routes.py:174` |
| GET | `/api/v1/redirects/resolve` | public | — | — | `src/pagefpt/modules/content/redirects.py:63` |
| GET | `/api/v1/regions` | public | — | — | `src/pagefpt/modules/catalog/routes.py:107` |
| GET | `/api/v1/regions/hierarchy` | public | — | — | `src/pagefpt/modules/catalog/routes.py:38` |
| GET | `/api/v1/regions/{id}/wards` | public | — | — | `src/pagefpt/modules/catalog/routes.py:68` |
| POST | `/api/v1/sessions` | public | — | ConsentInput | `src/pagefpt/modules/marketing/routes.py:15` |
| GET | `/api/v1/system/display-settings` | public | — | — | `src/pagefpt/modules/content/display_settings.py:75` |
| POST | `/api/v1/system/display-settings` | content.publish | AAL2 | DisplayPatch | `src/pagefpt/modules/content/display_settings.py:80` |
| POST | `/api/v1/touches` | public | — | AttributionInput | `src/pagefpt/modules/marketing/routes.py:60` |
| POST | `/api/v1/visits/assess` | public | — | VisitInput | `src/pagefpt/modules/intelligence/routes.py:37` |
| POST | `/api/v1/webhooks/leads/{provider}` | server HMAC signature | — | LeadWebhook | `src/pagefpt/modules/integrations/webhooks.py:27` |
| GET | `/chinh-sach-bao-mat` | preview_html_only | — | — | `src/pagefpt/web/client_routes.py:95` |
| GET | `/health/live` | health_public | — | — | `src/pagefpt/application.py:67` |
| GET | `/health/ready` | health_public | — | — | `src/pagefpt/application.py:71` |
| POST | `/internal/jobs/process` | server worker secret | — | ProcessInput | `src/pagefpt/modules/workflow/routes.py:30` |
| GET | `/internal/jobs/recover` | server worker secret | — | — | `src/pagefpt/modules/workflow/routes.py:43` |
| GET | `/khuyen-mai` | preview_html_only | — | — | `src/pagefpt/web/client_routes.py:74` |
| GET | `/robots.txt` | seo_public | — | — | `src/pagefpt/modules/content/routes.py:35` |
| GET | `/san-pham/{slug}` | preview_html_only | — | — | `src/pagefpt/web/client_routes.py:39` |
| GET | `/sitemap.xml` | seo_public | — | — | `src/pagefpt/modules/content/routes.py:17` |

## Path, query và header parameters

Thiếu query không bắt buộc → dùng default server. Không gắn query chưa có trong bảng để giả có filter/search.

### GET /admin/leads/detail

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `id` | False | `{"type":"string","default":"","title":"Id"}` |

### PATCH /api/v1/admin/appointments/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/audit

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `after` | False | `{"type":"integer","minimum":0,"default":0,"title":"After"}` |

### GET /api/v1/admin/campaigns

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/campaigns/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/campaigns/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/campaigns/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/changes

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `after` | False | `{"type":"integer","minimum":0,"default":0,"title":"After"}` |

### GET /api/v1/admin/costs

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/costs/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/costs/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/costs/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/deliveries/{id}/reconcile

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/experiments

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/experiments/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/experiments/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/experiments/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/exports/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/followups/{id}/reconcile

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/integrations

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/integrations/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/integrations/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/integrations/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/jobs/{id}/replay

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### DELETE /api/v1/admin/lead-views/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### PUT /api/v1/admin/lead-views/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/leads

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |
| query | `cursor` | False | `{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Cursor"}` |
| query | `status` | False | `{"anyOf":[{"type":"string","maxLength":32},{"type":"null"}],"title":"Status"}` |
| query | `q` | False | `{"anyOf":[{"type":"string","maxLength":100},{"type":"null"}],"title":"Q"}` |
| query | `branch_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Branch Id"}` |
| query | `assignee_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Assignee Id"}` |
| query | `region_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Region Id"}` |
| query | `start` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"Start"}` |
| query | `end` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"End"}` |
| query | `overdue` | False | `{"type":"boolean","default":false,"title":"Overdue"}` |

### GET /api/v1/admin/leads/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/activities

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/leads/{id}/appointments

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/appointments

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/assignments

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/feedback-token

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/leads/{id}/intelligence

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/observations

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/leads/{id}/preferences

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/quotes/confirm

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/recompute

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/reveal

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/transitions

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/locations

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `level` | False | `{"enum":["province","ward"],"type":"string","default":"province","title":"Level"}` |
| query | `parent_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Parent Id"}` |
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":100,"title":"Limit"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### POST /api/v1/admin/media/{id}/finalize

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/pages

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/pages/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/pages/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/pages/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/pages/{id}/schedule

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/plans

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### GET /api/v1/admin/plans/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/plans/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/plans/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/prices

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### GET /api/v1/admin/prices/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/prices/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/prices/{id}/replace

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/prices/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/privacy/requests/{id}/execute

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/products

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/products/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/products/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/products/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/promotions

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### GET /api/v1/admin/promotions/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/promotions/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/promotions/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/referrals/{id}/approve

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/regions

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### GET /api/v1/admin/regions/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/regions/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### POST /api/v1/admin/regions/{id}/retire

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/reports/summary

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `start` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"Start"}` |
| query | `end` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"End"}` |
| query | `branch_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Branch Id"}` |
| query | `campaign` | False | `{"anyOf":[{"type":"string","maxLength":100},{"type":"null"}],"title":"Campaign"}` |

### GET /api/v1/admin/workspace/{kind}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `kind` | True | `{"enum":["campaign","experiment","integration","cost","page","media","promotion","export","privacy"],"type":"string","title":"Kind"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### POST /api/v1/admin/{kind}/{id}/publish

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `kind` | True | `{"type":"string","title":"Kind"}` |
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/experiments/{id}/variant

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `session_token` | False | `{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Session Token"}` |

### POST /api/v1/leads

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| header | `Idempotency-Key` | False | `{"type":"string","default":"","title":"Idempotency-Key"}` |

### GET /api/v1/pages/{slug}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

### GET /api/v1/redirects/resolve

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `path` | True | `{"type":"string","maxLength":250,"title":"Path"}` |

### GET /api/v1/regions/{id}/wards

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":100,"title":"Limit"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### POST /api/v1/webhooks/leads/{provider}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `provider` | True | `{"enum":["google","meta","tiktok","crm"],"type":"string","title":"Provider"}` |

### GET /san-pham/{slug}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

## Tất cả request schemas và fields

`additionalProperties=false`: chỉ gửi whitelist fields, không spread DTO response vào request. Null khác bỏ field. Validator Python về thời gian/fit/redirect/CSV không thể hiện hết bằng JSON Schema; xem prompt và source.

### ActivityCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `kind` | Có | `{"type":"string","enum":["call","note","appointment","complaint","resolved"]}` |
| `notes` | Không | `{"type":"string","maxLength":2000,"default":""}` |
| `due_at` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |

### ApplyInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `csv` | Có | `{"type":"string","maxLength":262144}` |
| `approval_token` | Có | `{"type":"string","maxLength":8192}` |

### AppointmentCreate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `due_at` | Có | `{"type":"string","format":"date-time"}` |
| `kind` | Không | `{"type":"string","enum":["callback","survey","installation"],"default":"callback"}` |
| `notes` | Không | `{"type":"string","maxLength":2000,"default":""}` |

### AppointmentUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `status` | Có | `{"type":"string","enum":["pending","completed","cancelled"]}` |
| `due_at` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |

### AssignmentCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `assignee_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### AttributionInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |
| `utm_source` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_.-]*$","default":""}` |
| `utm_medium` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_.-]*$","default":""}` |
| `utm_campaign` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_.-]*$","default":""}` |
| `platform` | Không | `{"type":"string","maxLength":30,"pattern":"^(\|google\|meta\|tiktok\|zalo\|seo\|referral)$","default":""}` |
| `click_id` | Không | `{"type":"string","maxLength":256,"pattern":"^[a-zA-Z0-9_-]*$","default":""}` |

### Block

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `type` | Có | `{"type":"string","enum":["text","heading","cta","image","pricing","faq"]}` |
| `text` | Không | `{"type":"string","maxLength":5000,"default":""}` |
| `url` | Không | `{"anyOf":[{"type":"string","maxLength":1000},{"type":"null"}]}` |
| `media_id` | Không | `{"anyOf":[{"type":"string","maxLength":100},{"type":"null"}]}` |

### BulkAssignmentCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `assignee_id` | Có | `{"type":"string","format":"uuid"}` |
| `items` | Có | `{"items":{"$ref":"#/components/schemas/BulkAssignmentItem"},"type":"array","maxItems":100,"minItems":1}` |

### BulkAssignmentItem

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `id` | Có | `{"type":"string","format":"uuid"}` |

### BulkPriceInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `rows` | Có | `{"items":{"$ref":"#/components/schemas/PriceInput"},"type":"array","maxItems":500,"minItems":1}` |
| `publish` | Không | `{"type":"boolean","default":false}` |

### CampaignInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `platform` | Có | `{"type":"string","enum":["google","meta","tiktok","zalo","seo","referral"]}` |
| `utm_campaign` | Có | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_-]+$"}` |
| `branch_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### ChallengeInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |
| `phone` | Có | `{"type":"string","maxLength":40}` |
| `provider_token` | Có | `{"type":"string","maxLength":2048,"minLength":1}` |

### ConfirmQuote

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `quote_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |

### ConsentInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `analytics` | Không | `{"type":"boolean","default":false}` |
| `marketing` | Không | `{"type":"boolean","default":false}` |
| `consent_version` | Có | `{"type":"string","maxLength":50,"minLength":1}` |

### ConsentUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `analytics` | Không | `{"type":"boolean","default":false}` |
| `marketing` | Không | `{"type":"boolean","default":false}` |
| `consent_version` | Có | `{"type":"string","maxLength":50,"minLength":1}` |
| `session_token` | Có | `{"type":"string","maxLength":8192}` |

### CostInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `campaign_id` | Có | `{"type":"string","format":"uuid"}` |
| `day` | Có | `{"type":"string","format":"date"}` |
| `cost_vnd` | Có | `{"type":"integer","maximum":100000000000.0,"minimum":0.0}` |

### DisplayPatch

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":0.0}` |
| `fpt_anim` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `fpt_anim_style` | Không | `{"anyOf":[{"type":"string","enum":["wave","bounce","glow"]},{"type":"null"}]}` |
| `runline_enabled` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `runline_speed` | Không | `{"anyOf":[{"type":"string","enum":["slow","normal","fast"]},{"type":"null"}]}` |
| `runline_text` | Không | `{"anyOf":[{"type":"string","maxLength":2000},{"type":"null"}]}` |
| `banner_zones` | Không | `{"anyOf":[{"additionalProperties":{"type":"boolean"},"type":"object"},{"type":"null"}]}` |
| `lenis_scroll` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `tilt_parallax` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |

### EventBatch

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |
| `events` | Có | `{"items":{"$ref":"#/components/schemas/EventInput"},"type":"array","maxItems":20}` |

### EventInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `id` | Có | `{"type":"string","format":"uuid"}` |
| `name` | Có | `{"type":"string","enum":["view_plan","select_plan","select_region","compare_plans","start_form","view_cost","click_call","click_zalo","return_visit","experiment_exposure"]}` |
| `plan_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `experiment_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `variant` | Không | `{"anyOf":[{"type":"string","maxLength":50},{"type":"null"}]}` |

### ExperimentInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `variants` | Có | `{"items":{"$ref":"#/components/schemas/Variant"},"type":"array","maxItems":5,"minItems":2}` |
| `salt` | Có | `{"type":"string","maxLength":128,"minLength":32}` |

### ExportInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `format` | Không | `{"type":"string","const":"csv","default":"csv"}` |
| `branch_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### FeedbackInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `token` | Có | `{"type":"string","maxLength":8192}` |
| `rating` | Có | `{"type":"integer","maximum":5.0,"minimum":1.0}` |
| `comment` | Không | `{"type":"string","maxLength":2000,"default":""}` |

### FollowupInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `lead_id` | Có | `{"type":"string","format":"uuid"}` |
| `channel` | Có | `{"type":"string","enum":["call","sms","email","zalo"]}` |
| `purpose` | Không | `{"type":"string","enum":["service","marketing","upsell"],"default":"service"}` |
| `scheduled_at` | Có | `{"type":"string","format":"date-time"}` |

### GeographySyncInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `branch_id` | Có | `{"type":"string","format":"uuid"}` |
| `province_codes` | Không | `{"items":{"type":"integer"},"type":"array","maxItems":100}` |
| `source` | Không | `{"type":"string","enum":["live","bundled"],"default":"live"}` |

### HTTPValidationError

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `detail` | Không | `{"items":{"$ref":"#/components/schemas/ValidationError"},"type":"array"}` |

### ImportInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `csv` | Có | `{"type":"string","maxLength":262144}` |

### IntegrationInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `platform` | Có | `{"type":"string","enum":["google","meta","tiktok","notification"]}` |
| `enabled` | Không | `{"type":"boolean","default":false}` |
| `description` | Không | `{"type":"string","maxLength":500,"default":""}` |

### LeadRequest

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `phone` | Có | `{"type":"string","maxLength":40,"minLength":5}` |
| `name` | Không | `{"type":"string","maxLength":150,"default":""}` |
| `service_ids` | Không | `{"items":{"type":"string","enum":["internet","combo","camera","business","play"]},"type":"array","maxItems":5}` |
| `plan_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `installation_address` | Không | `{"type":"string","maxLength":500,"default":""}` |
| `notes` | Không | `{"type":"string","maxLength":2000,"default":""}` |
| `preferred_contact_at` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |
| `quote_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |
| `consent_version` | Có | `{"type":"string","maxLength":50,"minLength":1}` |
| `analytics_opt_in` | Không | `{"type":"boolean","default":false}` |
| `marketing_opt_in` | Không | `{"type":"boolean","default":false}` |
| `session_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |
| `attribution_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |
| `challenge_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |
| `website` | Không | `{"type":"string","maxLength":200,"default":""}` |

### LeadViewFilters

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `status` | Không | `{"anyOf":[{"type":"string","maxLength":32},{"type":"null"}]}` |
| `q` | Không | `{"anyOf":[{"type":"string","maxLength":100},{"type":"null"}]}` |
| `branch_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `assignee_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `start` | Không | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}]}` |
| `end` | Không | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}]}` |
| `overdue` | Không | `{"type":"boolean","default":false}` |

### LeadViewInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":0.0}` |
| `name` | Có | `{"type":"string","maxLength":80,"minLength":1}` |
| `filters` | Có | `{"$ref":"#/components/schemas/LeadViewFilters"}` |

### LeadWebhook

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `provider_event_id` | Có | `{"type":"string","maxLength":100,"minLength":1,"pattern":"^[a-zA-Z0-9_.:-]+$"}` |
| `lead` | Có | `{"$ref":"#/components/schemas/LeadRequest"}` |

### Login

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |
| `password` | Có | `{"type":"string","maxLength":1024,"minLength":1}` |
| `otp` | Không | `{"type":"string","pattern":"^([0-9]{6})?$","default":""}` |

### MembershipInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `display_name` | Không | `{"type":"string","maxLength":100,"default":""}` |
| `user_id` | Có | `{"type":"string","format":"uuid"}` |
| `branch_id` | Có | `{"type":"string","format":"uuid"}` |
| `permissions` | Có | `{"items":{"type":"string","enum":["*","identity.manage","catalog.write","pricing.write","pricing.publish","content.write","content.publish","lead.read","lead.write","lead.all","lead.assign","lead.pii","intelligence.write","marketing.write","care.write","care.approve","report.read","governance.write","governance.delete","governance.export","governance.audit","workflow.manage"]},"type":"array","maxItems":30}` |
| `capacity` | Không | `{"type":"integer","maximum":1000.0,"minimum":1.0,"default":20}` |
| `active` | Không | `{"type":"boolean","default":true}` |
| `shift` | Không | `{"$ref":"#/components/schemas/Shift"}` |

### ObservationCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `field` | Có | `{"type":"string","enum":["otp","contacted","needs_confirmed","need","region","infrastructure","home_isp","phone_carrier"]}` |
| `value` | Có | `{"anyOf":[{"type":"boolean"},{"type":"string"}]}` |
| `status` | Không | `{"type":"string","enum":["confirmed","inferred","unknown"],"default":"confirmed"}` |
| `evidence_ref` | Có | `{"type":"string","maxLength":500,"minLength":1}` |
| `expires_at` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |

### OperationalSettings

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":0.0}` |
| `sla_minutes` | Không | `{"type":"integer","maximum":240.0,"minimum":1.0,"default":10}` |
| `sound_alert` | Không | `{"type":"boolean","default":true}` |
| `shift` | Không | `{"$ref":"#/components/schemas/Shift"}` |

### PageInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `title` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `slug` | Có | `{"type":"string","maxLength":100,"minLength":1,"pattern":"^[a-z0-9-]+$"}` |
| `blocks` | Có | `{"items":{"$ref":"#/components/schemas/Block"},"type":"array","maxItems":100}` |
| `description` | Không | `{"type":"string","maxLength":300,"default":""}` |
| `canonical_path` | Không | `{"anyOf":[{"type":"string","maxLength":200,"pattern":"^/[a-z0-9/-]*$"},{"type":"null"}]}` |

### PlanInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `service` | Có | `{"type":"string","enum":["internet","combo","camera","business","play"]}` |
| `code` | Có | `{"type":"string","maxLength":60,"minLength":1,"pattern":"^[a-z0-9-]+$"}` |
| `description` | Không | `{"type":"string","maxLength":4000,"default":""}` |
| `speed_mbps` | Không | `{"anyOf":[{"type":"integer","maximum":100000.0,"minimum":1.0},{"type":"null"}]}` |
| `equipment` | Không | `{"items":{"type":"string"},"type":"array","maxItems":20}` |
| `applicable_region_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":500}` |

### PreferencesInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `marketing_allowed` | Không | `{"type":"boolean","default":false}` |
| `service_contact_allowed` | Không | `{"type":"boolean","default":true}` |
| `complaint_open` | Không | `{"type":"boolean","default":false}` |

### PriceInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `plan_id` | Có | `{"type":"string","format":"uuid"}` |
| `scope_id` | Có | `{"type":"string","format":"uuid"}` |
| `scope_kind` | Có | `{"type":"string","enum":["region","group","default"]}` |
| `billing_months` | Có | `{"type":"integer","maximum":36.0,"minimum":1.0}` |
| `monthly_vnd` | Có | `{"type":"integer","maximum":1000000000.0,"minimum":0.0}` |
| `setup_vnd` | Không | `{"type":"integer","maximum":1000000000.0,"minimum":0.0,"default":0}` |
| `equipment_vnd` | Không | `{"type":"integer","maximum":1000000000.0,"minimum":0.0,"default":0}` |
| `vat_included` | Không | `{"type":"boolean","default":true}` |
| `vat_bps` | Không | `{"type":"integer","maximum":10000.0,"minimum":0.0,"default":0}` |
| `gift_months` | Không | `{"type":"integer","maximum":36.0,"minimum":0.0,"default":0}` |
| `start` | Có | `{"type":"string","format":"date-time"}` |
| `end` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |
| `source` | Có | `{"type":"string","maxLength":500,"minLength":1}` |

### PrivacyInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `lead_id` | Có | `{"type":"string","format":"uuid"}` |
| `action` | Có | `{"type":"string","enum":["delete","stop_marketing"]}` |
| `reason` | Có | `{"type":"string","maxLength":500,"minLength":1}` |

### ProcessInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `queue` | Không | `{"default":"lead_local","enum":["lead_local","lead_external","conversions","notifications","maintenance"],"type":"string"}` |

### ProductInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `code` | Có | `{"type":"string","maxLength":60,"minLength":1,"pattern":"^[a-z0-9-]+$"}` |
| `service` | Có | `{"type":"string","enum":["internet","combo","camera","business","play"]}` |
| `description` | Không | `{"type":"string","maxLength":4000,"default":""}` |
| `plan_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":50}` |

### PromotionInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `discount_vnd` | Có | `{"type":"integer","maximum":1000000000.0,"minimum":0.0}` |
| `priority` | Không | `{"type":"integer","maximum":1000.0,"minimum":0.0,"default":0}` |
| `group` | Không | `{"type":"string","maxLength":60,"default":"exclusive"}` |
| `start` | Có | `{"type":"string","format":"date-time"}` |
| `end` | Có | `{"type":"string","format":"date-time"}` |
| `plan_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":100}` |
| `region_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":100}` |

### QuoteRequest

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `plan_id` | Có | `{"type":"string","format":"uuid"}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `billing_months` | Không | `{"type":"integer","maximum":36.0,"minimum":1.0,"default":6}` |

### RebuildInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `day` | Có | `{"type":"string","format":"date"}` |

### ReconcileConversion

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `state` | Có | `{"type":"string","enum":["accepted","failed","retry"]}` |
| `evidence_ref` | Có | `{"type":"string","maxLength":200,"minLength":1}` |

### ReconcileInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `state` | Có | `{"type":"string","enum":["accepted","failed","retry"]}` |
| `evidence_ref` | Có | `{"type":"string","maxLength":200,"minLength":1}` |

### RecoveryEmail

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |

### RedirectInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `path` | Có | `{"type":"string","maxLength":250,"minLength":1}` |
| `target` | Có | `{"type":"string","maxLength":250,"minLength":1}` |
| `status_code` | Không | `{"type":"integer","enum":[301,302,307,308],"default":301}` |

### ReferralInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `referrer_lead_id` | Có | `{"type":"string","format":"uuid"}` |
| `referred_lead_id` | Có | `{"type":"string","format":"uuid"}` |
| `installation_reference` | Có | `{"type":"string","maxLength":100,"minLength":1}` |

### RegionInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `zone_id` | Không | `{"type":"string","enum":["mien_bac","mien_trung","mien_nam","khac"],"default":"khac"}` |
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `code` | Có | `{"type":"string","maxLength":80,"minLength":1}` |
| `branch_id` | Có | `{"type":"string","format":"uuid"}` |
| `price_group_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `aliases` | Không | `{"items":{"type":"string"},"type":"array","maxItems":30}` |
| `level` | Không | `{"type":"string","enum":["province","ward"],"default":"province"}` |
| `parent_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### ResetPassword

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |
| `password` | Có | `{"type":"string","maxLength":1024,"minLength":8}` |
| `otp` | Có | `{"type":"string","pattern":"^[0-9]{6,8}$"}` |
| `totp` | Không | `{"type":"string","pattern":"^([0-9]{6})?$","default":""}` |

### ScheduleInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `publish_at` | Có | `{"type":"string","format":"date-time"}` |

### Shift

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `weekdays` | Không | `{"items":{"type":"integer"},"type":"array","maxItems":7,"default":[0,1,2,3,4,5]}` |
| `start` | Không | `{"type":"string","format":"time","default":"08:00:00"}` |
| `end` | Không | `{"type":"string","format":"time","default":"18:00:00"}` |

### TransitionCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `status` | Có | `{"type":"string","enum":["new","assigned","contacting","contacted","qualified","survey","quoted","closed","installed","unreachable","no_infrastructure","invalid","duplicate","rejected"]}` |
| `reason` | Không | `{"type":"string","maxLength":500,"default":""}` |
| `installation` | Không | `{"anyOf":[{"additionalProperties":true,"type":"object"},{"type":"null"}]}` |

### UploadInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `filename` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `content_type` | Có | `{"type":"string","enum":["image/jpeg","image/png","image/webp"]}` |
| `size_bytes` | Có | `{"type":"integer","maximum":10485760.0,"minimum":1.0}` |

### ValidationError

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `loc` | Có | `{"items":{"anyOf":[{"type":"string"},{"type":"integer"}]},"type":"array"}` |
| `msg` | Có | `{"type":"string"}` |
| `type` | Có | `{"type":"string"}` |
| `input` | Không | `{}` |
| `ctx` | Không | `{"type":"object"}` |

### Variant

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":50,"minLength":1,"pattern":"^[a-zA-Z0-9_-]+$"}` |
| `weight` | Có | `{"type":"integer","maximum":10000.0,"minimum":0.0}` |

### VersionCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### VisitInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |


<!-- END GENERATED FRONTEND CONTRACT -->
