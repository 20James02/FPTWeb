# Đặc tả backend PageFPT

Ngày: 30/09/2026. Trạng thái: đề xuất triển khai để review, chưa có backend chạy thực tế. Phạm vi là toàn bộ backend client/admin của kế hoạch sản phẩm hiện có; cấu hình ban đầu dưới đây là mặc định pilot, không phải số liệu đã đo.

## 1. Mục tiêu và lựa chọn kiến trúc

Nhận yêu cầu tư vấn nhanh, lưu đúng giá và nguồn, phân công đúng quyền, phân tích có giải thích, đo tới kết quả lắp đặt. Python/FastAPI trên Vercel; Supabase PostgreSQL/Auth/Realtime/Queues; R2 chứa tệp. HTML/Jinja2 dùng các service giống API, không tự tính giá lần thứ hai.

Chọn modular monolith theo nghiệp vụ. So với microservices, giảm số lần gọi mạng và vận hành; so với ORM CRUD thuần, dùng RPC PostgreSQL cho các bất biến cần transaction và khóa đồng thời. Chưa cần ML hoặc worker thường trực: rules dễ kiểm tra, queue chịu retry. Khi vượt tải phải có benchmark trước khi thay kiến trúc.

Ba lớp: router/schema → Python domain service → repository/RPC. Python sở hữu validator, thuật toán và orchestration; SQL sở hữu constraint, quyền dữ liệu và transaction. Không sao chép cùng một công thức pricing/scoring sang hai ngôn ngữ: Python tính proposal, RPC xác nhận revision/điều kiện và ghi nguyên tử.

## 2. Công nghệ và quy ước

- Python 3.12; FastAPI, Pydantic v2, HTTPX async, Jinja2; uv.lock ghim bản thư viện đã kiểm thử. Ruff, mypy, pytest, pytest-asyncio, Hypothesis, respx; Locust cho tải staging. Không cài package ở bước lập kế hoạch.
- Data API/RPC qua HTTPX là đường dữ liệu MVP. SQL trực tiếp chỉ thêm khi đo chứng minh cần; khi đó transaction pooler, pool nhỏ, tắt prepared statements theo driver và kiểm chứng TLS. Không trộn hai write path tùy tiện.
- UUID cho ID; thời điểm aware UTC, hiển thị Asia/Ho_Chi_Minh; tiền bigint VND, không float. Khoảng hiệu lực `[start,end)`; end null = vô hạn. Server quyết định thời gian nghiệp vụ.
- Pydantic giới hạn kích thước, enums, extra='forbid' cho command. JSON request lead tối đa 16 KiB, notes 2.000 ký tự; import/upload có endpoint riêng. Không ghi body/headers auth vào log.
- API `/api/v1`; lỗi `{code,message,fields,request_id}`. Cursor opaque ký, ràng buộc filter/scope, limit mặc định 30, tối đa 100. Không trả tổng count đắt tiền mỗi lần.

## 3. Các module và dữ liệu

| Module | Bảng chính | Trách nhiệm |
| --- | --- | --- |
| Identity | staff_profiles, memberships, role_permissions | Auth, MFA, chi nhánh, quyền và thu hồi |
| Catalog | products, plans, plan_revisions, regions, region_aliases, region_price_groups | Gói, vùng, địa danh cũ/mới, thông số |
| Pricing | price_versions, promotions, promotion_rules, catalog_revisions, quote_snapshots | Giá, duyệt, hiệu lực, báo giá |
| CRM | contacts, contact_identifiers, leads, lead_interests, lead_transitions, activities, appointments, installation_records | Hồ sơ liên hệ và từng yêu cầu riêng |
| Intelligence | observations, score_snapshots, scoring_rulesets, enrichment_runs, provider_cache | IP/ASN/phone/NLP, scores |
| Workflow | shifts, assignment_counters, sla_tasks, job_runs, job_failures, wake_signals | Phân công, SLA và queue |
| Marketing | sessions, consents, events, touches, campaigns, conversion_deliveries, experiments, experiment_assignments | Attribution, event, ads, A/B |
| Content/media | pages, page_revisions, media_assets, import_runs, import_rows | CMS, SEO, tệp R2, nhập dữ liệu |
| Care/referral | contact_preferences, followup_tasks, feedback, referral_codes, referral_claims | Chăm sóc, ngừng liên hệ, referral |
| Reporting/governance | daily_metrics, audit_events, export_jobs, deletion_requests, retention_runs | Báo cáo, audit, export/xóa |

`private` schema chứa PII, queue/job ledger, secrets references, observations thô; không expose trực tiếp Data API. `api` schema chỉ expose RPC/view cần thiết. Chỉ bật exposed schema sau khi kiểm tra cấu hình thật. Các bảng expose bật RLS; view dùng security_invoker khi thích hợp. Không publish private schema vào Realtime.

Contacts không đồng nghĩa một con người đã xác minh. Contact_identifier gồm `kind, lookup_hmac, key_version, ciphertext, verified_at`. Cùng số chỉ nối tới hồ sơ liên hệ, không khẳng định danh tính hay tự gộp mọi lead. Leads giữ riêng địa chỉ, dịch vụ, nguồn và thời điểm. Không có unique(phone) trên leads.

Constraint/index ưu tiên:
- Unique `(namespace,idempotency_key)`; lưu keyed request digest và response tối thiểu, TTL 24h. Lead vẫn tồn tại khi bản ghi idempotency hết hạn.
- Unique contact_identifier trên `(kind,key_version,lookup_hmac)`; hỗ trợ key rotation và collision kiểm tra sau giải mã trong phạm vi cho phép.
- Exclusion constraint giá đã publish trên `(plan_id,region_scope_id,billing_term,effective_range)` bằng GiST/btree_gist; giá draft có thể trùng để soạn thảo nhưng publish phải reject overlap.
- Lead indexes `(branch_id,status,created_at DESC,id DESC)`, `(assignee_id,status,created_at DESC,id DESC)` và contact_id; appointments `(due_at,id)` với partial index pending; job dedup_key unique; delivery `(platform,event_id,account_id)` unique.
- events unique `(session_id,event_id)`; time index và batch retention. Chỉ partition events khi dung lượng/query plan chứng minh cần. Không tạo hàng chục index chưa có truy vấn sử dụng.

## 4. API contract

| Nhóm | Endpoints | Quy tắc |
| --- | --- | --- |
| Public | GET /catalog, /regions, /pages/{slug}; POST /quotes | Chỉ revision đã publish; price theo vùng xác nhận |
| Lead | POST /leads; POST /leads/challenges/verify | LeadRequest, Idempotency-Key; receipt opaque, không endpoint tra phone công khai |
| Events/consent | POST /events/batch; PUT /consent | Tối đa 20 event/16 KiB/batch; whitelist payload; no phone/IP payload |
| Auth | POST /auth/session; DELETE /auth/session; GET /admin/me | Supabase token verify; cookie HttpOnly cho server session nếu sử dụng; CSRF cho cookie mutation |
| CRM | GET /admin/leads; GET /admin/leads/{id}; POST /{id}/transitions, /assignments, /activities, /appointments | Scope, expected_version, lịch sử, quyền reveal riêng |
| Catalog/price | /admin/plans, /regions, /prices, /promotions; POST /prices/{id}/publish; /quotes/{id}/confirm | Draft-review-publish; không publish trực tiếp từ import |
| Intelligence | GET /admin/leads/{id}/intelligence; POST /{id}/observations, /recompute | Override có evidence/source, không sửa score thủ công |
| CMS/media | /admin/pages, /pages/{id}/publish; /media/upload-intents, /media/{id}/finalize | Block schema có whitelist; media quarantine tới khi validate |
| Marketing | /admin/campaigns, /experiments, /integrations; /webhooks/{provider} | Secret/signature và inbox dedup; integration disabled mặc định |
| Care | /admin/followups, /feedback, /referrals | Preferences, quiet hours, điều kiện thưởng và audit |
| Governance | /admin/reports; /exports; /privacy/requests | RBAC, export job, link hết hạn, log download |
| Internal | POST /internal/jobs/process; GET /internal/jobs/recover; GET /health/live, /health/ready | Secret riêng, không public docs; health không lộ cấu hình |

LeadRequest: phone, name optional, service_ids, plan_id optional, region_id optional, installation_address optional, notes optional, preferred_contact_at optional, quote_token optional, consent_version, analytics_opt_in, marketing_opt_in, session_token optional, attribution_token optional, challenge_token optional. Không tin score, actor_id, branch_id, giá, ASN hoặc IP từ body. IP đọc từ trusted deployment proxy sau khi đối chiếu header chính thức; header không tin thì không dùng để định vị/rate-limit theo IP.

POST /leads: 201 sau commit `{receipt,event_id,quote_status,next_action}`; replay cùng key+payload = 200 cùng receipt; cùng key khác payload = 409; input sai = 422; throttle = 429+Retry-After; cần challenge = 403+code CHALLENGE_REQUIRED, có lối xác minh thay thế. Quote token lỗi không làm mất yêu cầu tư vấn: bỏ snapshot không hợp lệ, lưu requested_plan, quote_status=needs_confirmation. Idempotent replay được kiểm tra trước việc đánh giá quote expiry để retry sau hết hạn vẫn trả kết quả cũ.

## 5. Luồng lưu lead và chống trùng

1. Bound body, normalize phone bằng phonenumbers với region VN + quy tắc nghiệp vụ. Có thể nhận số cố định hợp lệ; carrier=not_applicable. Loại unicode control, giới hạn input; parse không chứng minh số hoạt động.
2. HMAC SHA-256 số chuẩn hóa phục vụ lookup, mã hóa AEAD bằng cryptography với nonce ngẫu nhiên và key version; key mã hóa, matching và token tách nhau. Không dùng SHA(phone) để matching nội bộ.
3. Tạo keyed request digest trên semantic payload chuẩn hóa, không bao gồm header biến đổi; bảo toàn các trường mà thay đổi làm yêu cầu khác. Xác minh session/token, consent, quote nếu có.
4. RPC `submit_lead(command)` gồm replay check, rate bucket consumption, contact upsert, lead insert, snapshot insert khi hợp lệ, consent/touch attach, audit tối thiểu, queue send và wake_signal insert trong một transaction. Rate limit phải nằm trong transaction nhưng trả decision bình thường, không rollback counter bằng exception.
5. Unique constraint giải quyết race; duplicate idempotency chờ transaction đối thủ rồi đọc committed result. Deadlock retry bounded cùng key; key mismatch 409. Test timeout sau commit/trước response: client retry tìm được kết quả.
6. Phân biệt gửi lại cùng request với lead gần giống: cùng phone HMAC+plan/service+địa chỉ chuẩn hóa trong 24h chỉ đánh dấu candidate duplicate. Không tự bỏ yêu cầu khi khác địa chỉ/dịch vụ; manual merge giữ cả history/touches.
7. DB mất kết nối = 503, chưa báo thành công; request giữ key để retry. Nhà cung cấp lookup/ads/chăm sóc lỗi không ảnh hưởng commit.

Job payload chỉ chứa IDs/version. Response và receipt không tiết lộ contact existence; receipt không cấp quyền đọc profile.

## 6. Pricing engine

`resolve_price(plan_id, region_id, billing_term, at)` ưu tiên exact region → price group → default approved; vùng unknown chỉ hiển thị giá tham khảo rõ scope hoặc needs_quote. Không dựa vào GeoIP để chốt giá.

Tính bằng integer: `initial_total = prepaid_fee + setup_fee + purchased_equipment + addons - eligible_discount`. Quy tắc VAT explicit: bảng giá xác định VAT included hay excluded; làm tròn VND bằng Decimal ROUND_HALF_UP tại bước VAT được định nghĩa, không cộng VAT lần thứ hai. Giảm giá không vượt base đủ điều kiện, total không âm. Tách billing_months/service_months/gift_months.

Promotion có priority, eligibility predicate whitelist và combinability_group; không eval text/SQL do editor nhập. Chọn nhóm không kết hợp theo priority, tie theo ID ổn định; không tự giải bài toán mọi tổ hợp. Eligibility unknown → chưa áp dụng/needs_confirmation, không giả đủ điều kiện.

QuoteProposal chứa immutable line items, sources, catalog_revision, effective boundary, calculated_at. Token HMAC chứa quote_id/revision/expiry, không PII. TTL mặc định 15 phút nhưng expiry không vượt thời điểm thay đổi giá/ưu đãi. Submit RPC kiểm tra revision/current time: stale → lưu lead và đánh dấu reconfirm, không âm thầm áp giá mới. Quote snapshot không đổi; confirmation tạo snapshot tiếp theo có audit.

Publish increment catalog_revision trong transaction; public cache key gắn revision/scope. TTL tối đa 60s và không vượt next_effective_boundary; signed quote + commit guard bảo đảm đúng dữ liệu khi CDN invalidation chậm. Preview không cache công khai.

## 7. Thuật toán intelligence

### 7.1. Observations và IP/phone

Mỗi observation: field, value, source, observed_at, source_version, status (observed/inferred/confirmed/unknown), accuracy_radius nếu có, expires_at, evidence_ref. Unknown không là false/0; xác nhận của nhân viên không bị provider cũ ghi đè. Mỗi field có precedence rule rõ, lưu cả lịch sử.

IPv4/IPv6 chuẩn hóa qua ipaddress; MMDB lookup ở worker, mở reader một lần/instance, giới hạn RAM. ISP/ASN là mạng kết nối, carrier lookup là mạng số điện thoại, home_isp chỉ khách/nguồn được cấp quyền xác nhận. Không suy ra nhà mạng hiện tại từ đầu số. Provider cache keyed HMAC(identifier)+provider+version, TTL theo hợp đồng; MMDB cache theo IP chuẩn/source_version, không cần gọi dịch vụ trả phí mỗi pageview. IP private/reserved/malformed → unknown.

Phone external lookup optional, sau khi kiểm tra độ bao phủ VN và số chuyển mạng. Timeout 2s/provider, tổng 5s/job enrichment, tối đa 3 request provider đồng thời mỗi invocation; giới hạn toàn hệ thống bằng quota/permit DB, semaphore local không đủ. Missing provider → unknown, vẫn có scores local.

### 7.2. Scores versioned, có lý do

`score_lead(evidence: EvidenceSet, as_of: datetime, ruleset: Ruleset) -> ScoreBundle` là hàm pure, không I/O, deterministic. ScoreBundle gồm bốn kết quả, completeness, reasons, source versions, ruleset_version và evidence_version. Worker chỉ commit khi evidence_version khớp; stale result enqueue recompute, không ghi đè mới hơn.

- Contact confidence = 20 cấu trúc số hợp lệ +30 OTP +30 liên hệ xác nhận yêu cầu +20 khách xác nhận nhu cầu/địa chỉ; 0–100. OTP/số không còn kiểm soát phải có chính sách hết hiệu lực evidence, không cộng vĩnh viễn. Đây là mức bằng chứng, không phải probability.
- Intent: chọn gói 25, quiz/so sánh 20, lịch liên hệ/thời gian lắp 25, xem điều kiện/chi phí 20, quay lại session được phép 10. Với mỗi loại lấy tín hiệu đáng tin mới nhất trong 7 ngày, không cộng mỗi lần click. Đề xuất decay `weight*2**(-age_days/3)`, clamp/round tổng về 0–100; server-received time là chuẩn, client timestamp chỉ metadata. Chỉ event analytics được phép và dữ liệu khách cung cấp được dùng; thiếu consent không xem là intent thấp để bỏ phục vụ.
- Fit: ba tiêu chí nhu cầu, vùng phục vụ, hạ tầng với yes/no/unknown. `fit=100*yes_count/known_count` khi known>0, ngược lại null; completeness=known_count/3. Fit 100 với completeness 1/3 không đủ điều kiện tự gắn nhãn qualified. Region không hỗ trợ phải từ dữ liệu phạm vi xác nhận; hạ tầng unknown không suy ra từ region.
- Automation risk: honeypot 50; server burst xác minh 30; nhiều số khác nhau theo mẫu abuse 30; chuỗi sự kiện bất khả thi có server evidence 20; clamp 100. Fast form/thiếu JS/VPN riêng lẻ không cộng. <40 normal, 40–69 lightweight challenge, >=70 strong challenge/manual review. Heuristics có TTL và reasons; chỉ evidence abuse chắc chắn được auto-reject.

Không đưa score/risk vào giá. Ranking ưu tiên không phải chặn intake: `priority = 0.35*intent + 0.25*(fit or 50) + 0.20*urgency + 0.20*min(wait_minutes/60*100,100)`. Urgency theo thời gian lắp khách khai báo: <=2 ngày 100, <=7 ngày 70, >7 ngày 40, unknown 50. Đây là trọng số pilot, lưu version. Hard SLA overdue đứng trước weighted score để khách chưa có hành vi không bị bỏ quên; tie created_at rồi id.

### 7.3. Abuse/rate limiting

Pilot lead endpoint: session bucket capacity 5/refill 1 mỗi 120s; trusted-IP HMAC bucket capacity 60/refill 1 mỗi 10s, endpoint-specific. IP threshold cao hỗ trợ NAT; session thay mới không vượt được hard IP burst guard. Phone bucket capacity 3/refill 1 mỗi 600s chỉ gây xác minh nhẹ, không khóa số để tránh attacker chặn nạn nhân. OTP có limit riêng phone/session/IP và chi phí ngày.

Atomic token bucket trong DB: `tokens=min(capacity,old_tokens+max(0,now-updated_at)*rate)`; consume hoặc return retry_after. Khóa bucket theo thứ tự key ổn định; chỉ khóa transaction ngắn. Record key HMAC+key_version, TTL cleanup. WAF xử lý volumetric abuse trước Function; không dùng RAM counter làm bảo vệ toàn hệ thống. Khi rate-store lỗi: WAF còn hoạt động, endpoint không xác nhận lead khi DB chưa commit; phân biệt infra outage với abuse.

### 7.4. NLP/ML

MVP rule extraction Unicode/Vietnamese vocabulary: service, floors, devices, budget range, date intent; evidence span và confidence category, ambiguous→unknown. Không hardcode địa danh cũ thành mã vùng mới nếu không có alias được xác nhận.

LLM optional sau redact PII, schema validation, timeout, source spans; text khách là dữ liệu không phải instruction. Không gọi tool hoặc truy cập URL do note chỉ định. ML chỉ sau nhãn contactable/installed đáng tin: time split, feature cutoff lúc dự báo, kiểm tra calibration/PR-AUC/false positives từng nguồn; shadow rollout, fallback rules. Không dùng trạng thái lắp trong feature dự đoán lắp trước đó.

## 8. Queue, retry, phân công và realtime

Queues tách `lead_local`, `lead_external`, `conversions`, `notifications`, `maintenance` để provider chậm không chặn intake/local score. Transaction send trực tiếp vào pgmq kèm ledger, không có một outbox thứ hai thực hiện cùng công việc. Wake là signal best effort, queue là source of truth.

`process_jobs(queue, max_messages=10, deadline_seconds=20)` chạy hữu hạn; concurrency ban đầu 3, visibility timeout 60s và không nhận việc khi deadline còn < timeout_job+3s. Local job budget 2s; external 5s; export chunks riêng. Deployment phải có maxDuration > deadline+margin, kiểm tra gói trước cấu hình.

Claim pgmq + job ledger lease generation/fencing token trong RPC. Complete phải khớp token/version; worker lease hết hạn không được ghi kết quả/ack của worker mới. Internal wake xác thực secret header, signal ID tồn tại; duplicate wake vô hại nhờ claim, worker permit DB giới hạn số invocation đang xử lý. Cron phục hồi ít nhất mỗi phút nếu gói/cấu hình hỗ trợ; không hứa <1s ở fallback.

Retry full jitter `uniform(0,min(300,2**attempt))` giây, tối đa 6 attempts; phân biệt transient 429/5xx/timeout và permanent validation/permissions. Lưu next_attempt_at + set visibility qua API pgmq phiên bản đã kiểm tra; complete/failed transition+archive trong transaction. Cron quét backlog/expired permits có giới hạn; alarm oldest age. Không tạo vòng tự gọi Function vô hạn và không task sau response.

External exactly-once không bảo đảm: delivery record pending/sending/unknown/sent, stable event_id, provider idempotency nếu hỗ trợ. Timeout sau provider nhận → unknown + reconcile nếu API hỗ trợ; không mặc định gửi lại notification không idempotent. Audit được attempts và kết quả.

Auto-assignment: lọc nhân viên đúng branch/service/shift/capacity; transaction lock counter nhân viên, chọn `active_leads/capacity` thấp nhất, tie last_assigned_at/id. Unique active assignment per lead, expected_version. Không có nhân viên → unassigned+manager task. Status machine giữ các trạng thái sản phẩm, cho các nhánh thất bại/hẹn lại có allowed transitions; transition forbidden=409; installed cần installation_record; rejected/invalid cần reason; mọi mutation log before/after/version.

SLA theo calendar ca trực Asia/Ho_Chi_Minh, target pilot 10 phút làm việc; ngoài ca tính từ ca kế tiếp. Deadline không bị reset bởi reassignment. Scheduler nhận overdue theo due_at, max batch và SKIP LOCKED; reminder key `(lead_id,sla_kind,deadline)` chống trùng.

Realtime private channel theo user/branch có membership auth; notification chỉ ID/version/type. Client refetch qua API và quyền hiện tại. Bị thu hồi membership: không dựa vào policy tại subscribe để thu hồi tức thời; đóng/revalidate channel theo khả năng Supabase, reauth ngắn hạn, API deny ngay, subscription không mang PII. Reconnect resync bằng durable change cursor `(changed_at,id)` từ audit projection hoặc revision feed; không dùng chỉ created_at.

## 9. Marketing, CMS, care và dữ liệu

Attribution append touches; first/last theo cửa sổ cấu hình 30 ngày, giữ nguồn lead cụ thể. UTM whitelist/length; referrer chỉ domain/path được sanitize, không lưu query chứa PII. Click ID lưu private và expiry; không chứng minh danh tính. Event ingestion dedup, opt-in check cả client lẫn server; lead_submitted do server sau commit. Browser/server cùng event_id, API retries không tạo conversion mới.

Provider adapters chung `deliver(ConversionCommand)->DeliveryResult`; Google/Meta/TikTok triển khai từng kênh sau kiểm tra tài liệu/quyền thực tế. Preview/staging không gửi conversion, SMS/OA thật. Import lead form qua webhook có signature, inbox dedup, consent metadata và source mapping. Nhập chi phí ads file là MVP, API sync sau; currency/timezone minh bạch.

A/B phân bổ `HMAC(experiment_salt,session_id)` modulo 10.000 vào ranges cố định, persist assignment khi analytics consent; đổi trọng số tạo experiment version mới. Conversion gắn assignment tại exposure trước submit, không gắn lại sau khi biết kết quả. Khi thiếu consent phục vụ variant default, không theo dõi lâu dài.

CMS revision immutable, blocks whitelist, sanitize HTML/URL scheme, draft/preview/publish/schedule. Public SEO API canonical/sitemap/redirects, loại admin/receipt/private pages. Import CSV có dry-run, row errors, rollback transaction cho price publish; spreadsheet formula injection được xử lý khi export.

R2: upload-intent tạo random object key, presigned PUT 5 phút, bucket quarantine/private; finalize xác nhận HEAD size tối đa 10 MiB/ảnh, magic bytes, decode/re-encode và pixel limit 40 MP chống decompression bomb. Metadata public chỉ sau validate; không tin MIME/extension. SVG user upload không public trực tiếp. Job image CPU có ngân sách; nếu quá giới hạn giữ pending, không xử lý trong lead endpoint. Private export URL 60s, download có quyền/audit; xóa object qua retry job. Không fetch URL tùy ý để tránh SSRF.

Care: opt-out chặn queued sends cả lúc enqueue và lúc deliver; quiet hours/attempt caps theo cấu hình, callback đúng lịch. Complaint mở → stop upsell. Feedback có token scoped không cấp quyền CRM. Referral chống self-referral theo contact_identifier, unique reward theo installation_id; nhân viên duyệt trước payout, chưa tích hợp tiền tự động.

Reports dùng daily_metrics upsert idempotent/rebuild theo ngày + metrics definition version; correction status điều chỉnh ngày tương ứng, không cộng trùng mỗi event. Dashboard đọc aggregate, chưa đếm millions events live. Bắt buộc funnel lead→contacted→qualified→installed; click_call/Zalo không thành lead; hiển thị độ trễ dữ liệu và completeness.

## 10. Security, retention và vận hành

Admin JWT verify signature/JWKS cached có TTL, issuer/audience/exp, thuật toán allowlist; unknown kid refresh bounded, không gọi Auth trên mọi public request. Membership từ DB cho quyền, không user_metadata; MFA AAL2 cho publish price/export/reveal PII/cấu hình integration. Role marketing chỉ aggregate, editor chỉ content, sales scoped assignment, manager scoped branch, owner quyền quản trị có audit.

RLS kiểm tra `auth.uid()` và membership trên đường JWT người dùng; service-role write path backend-only phải kiểm tra scope server và RPC. Không tin actor_id client. RPC privileged revoke PUBLIC/anon/authenticated tùy chức năng, search_path cố định, không dynamic SQL. Browser không gọi RPC intake bypass anti-abuse. RLS tests phải thử Data API trực tiếp, không chỉ FastAPI.

Log redact phone/IP/name/notes/token; tracing dùng request_id/lead opaque ID. HMAC key rotation dual-read/write current, migrate theo batch. Encryption rotation giữ old key đến hết migration/backup retention. Vault/KMS/provider secrets riêng environment; không tự tạo kết nối tài khoản trong plan.

Pilot: raw IP 7 ngày, hành vi optional 90 ngày, idempotency 24h, technical queue/audit payload không PII, contact/lead retention 12 tháng sau lần liên hệ cuối hoặc chính sách đã duyệt; legal/operational retention và consent cần chủ dự án xác nhận trước production. Delete workflow cascade/pseudonymize theo mục đích, xử lý R2/caches/provider và consent revoke; audit không giữ bản sao PII đã xóa. Backup có lịch expiry, restore phải replay deletion tombstones trước mở truy cập.

CI lint/type/unit/integration/SQL RLS/contract; migration SQL tạo bằng Supabase CLI có timestamp thật, không tự đặt timestamp trong plan. Expand→backfill→contract; rollback code không rollback dữ liệu tùy tiện. Tách DB/R2/token preview/staging/prod. Test backup restore trước ra mắt.

## 11. Ngân sách hiệu năng và tiêu chí go-live

Mục tiêu pilot, chưa cam kết: lead API warm p95 <=500ms, p99 <=1s tính từ Function nhận tới response; client thử nghiệm mạng VN p95 <=1,5s tính cả RTT. Đo cold riêng, không loại khỏi báo cáo toàn bộ traffic. Breakdown hướng dẫn: validation/crypto <=30ms, HTTP+DB transaction <=250ms, serialize <=20ms; phần còn lại scheduling/headroom. Sai constraint/đủ quyền quan trọng hơn cố ép deadline bằng fire-and-forget.

Public cached API p95 <=150ms trên điều kiện thử nghiệm đã ghi; admin list server p95 <=500ms; realtime notification p95 <=1s từ commit khi kết nối tốt; local enrichment p95 <=2s từ commit trong normal webhook path (mục tiêu cũ dưới khoảng 1s là stretch), external <=5s xử lý cộng queue wait. Ghi metric queue_wait riêng; fallback cron không nằm trong SLO realtime thường.

Benchmark staging synthetic: 50 concurrent users/5 lead requests mỗi giây trong 15 phút; 100 concurrency burst 60s, lặp NAT/IPv6 và webhook loss/provider429. Scale test dựa quota sau pilot, không tuyên bố stack đáp ứng mọi mức tải. Sizing use Little's Law `concurrency≈arrival_rate*service_time`; connections/request counts và oldest job age phải nằm trong quota.

Cache public explicit ETag/version, không cache admin/PII/auth/POST; bounded HTTP pools: API max connections 20/instance, keepalive 10 khởi đầu, timeout tổng 2s cho Data API lead, không retry vô hạn; tune bằng đo. JS/browser event gộp batch, không enrich mỗi event. Avoid heavy imports ML/pandas ở boot, bundle audit MMDB và ảnh; không preload dịch vụ ngoài trên request đầu.

Go-live: không lost lead khi crash; idempotency/concurrency tests pass; constraint price overlap; snapshot stale rõ; cross-branch/anon denied; worker crash/retry/fencing pass; no PII logs/realtime/ads; restore test; latency/error/queue alerts và rollback runbook. Mọi tích hợp chưa có credentials có fake adapter và disabled flag, không báo như đã chạy thật.

## 12. Tài liệu chính thức đã đối chiếu

- [Vercel Python](https://vercel.com/docs/functions/runtimes/python): hỗ trợ ASGI/FastAPI; chọn Python và bundle rõ.
- [Supabase Queues](https://supabase.com/docs/guides/queues): message bền vững/visibility window; side effect bên ngoài vẫn cần idempotency.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres): serverless transaction pooling và giới hạn prepared statements.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private channel và quyền truy cập.
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/): signed uploads và CORS.
- [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing): tần suất phụ thuộc gói; phải kiểm tra trước rollout.

Changelog Markdown Supabase không đọc được trong phiên này; trước code cần kiểm tra changelog/release và API pgmq/Auth đang dùng. Mọi ngưỡng/weights trên là cấu hình versioned để thử pilot, không trình bày như độ chính xác đã hiệu chuẩn.
