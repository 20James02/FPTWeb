# Backend PageFPT Implementation Plan

> **For agentic workers:** Dùng skill executing-plans để triển khai từng task trong phiên hiện tại. Không tự tạo agent phụ. Các bước checkbox là trạng thái công việc dự kiến, chưa được thực hiện.

**Goal:** Backend toàn dự án nhận lead nhanh, lưu đúng dữ liệu, quản lý client/admin, phân tích có giải thích và vận hành ổn định.

**Architecture:** Modular monolith FastAPI; Python service/domain, Supabase RPC cho transaction/RLS/queue, Realtime thông báo tối thiểu, R2 cho tệp. Request lead tách khỏi enrichment và tích hợp bên ngoài.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, HTTPX, Jinja2, Supabase PostgreSQL/Auth/Queues/Realtime, Cloudflare R2, pytest/Hypothesis/Locust, uv.

**Spec:** `docs/backend/2026-09-30-backend-design.md`; đối chiếu `KE-HOACH-WEBSITE-CLIENT-ADMIN.md` và `KIEN-TRUC-PYTHON-VERCEL-SUPABASE-R2.md`. Đặc tả mới chi tiết hóa các tài liệu trước; mục tiêu local enrichment <=2s là pilot, dưới khoảng 1s là stretch.

## Global Constraints

- Python 3.12; Pydantic v2; money bigint VND; timestamps aware UTC; hiệu lực `[start,end)`.
- Lead body <=16 KiB, notes <=2.000 ký tự; idempotency TTL 24h; quote TTL <=15 phút và không vượt boundary giá.
- Không I/O provider, NLP/LLM, upload hoặc render ảnh trong đường commit lead.
- Chỉ báo lead thành công sau commit; lead+snapshot+queue+wake nguyên tử; không BackgroundTasks cho việc bền vững.
- Quyền check server và DB; PII không ở logs, URL analytics, public Realtime; preview không gửi conversion/tin nhắn thật.
- Mỗi task phải có migration/RLS test phù hợp, không chỉ mock RPC. Migration tạo bằng CLI sau khi kiểm tra help/version.
- Chưa chạy code sản phẩm trong bước lập kế hoạch. Các ngưỡng là cấu hình pilot cần review, benchmark và điều chỉnh.

## Review Focus

1. Response mất sau commit và retry sau quote hết hạn: trả cùng receipt; kiểm thử task 4.
2. Cùng IP NAT nhưng nhiều khách hợp lệ: không gộp danh tính hoặc block chỉ vì shared IP; kiểm thử task 5.
3. Giá publish lúc submit: lưu lead với trạng thái reconfirm, không nhận snapshot sai; kiểm thử task 3–4.
4. Worker cũ trở lại sau lease hết hạn: không ghi đè/ack kết quả mới; kiểm thử task 6–7.
5. JWT còn hạn khi membership bị thu hồi: API deny; private notification không chứa PII; kiểm thử task 2–8.

## Cấu trúc code và contracts dùng chung

```text
app.py                          # ASGI entrypoint, gọi create_app
pyproject.toml / uv.lock         # dependencies/tooling đã ghim
vercel.json                     # region, maxDuration, routing/cache explicit
src/pagefpt/
  application.py                # app factory, middleware, routers
  core/{config,errors,crypto,clock,logging}.py
  infra/{supabase,http,queue,r2}.py
  identity/{schemas,service,permissions,routes}.py
  catalog/{schemas,service,repository,routes}.py
  pricing/{schemas,engine,tokens,repository,routes}.py
  leads/{schemas,service,repository,state_machine,routes}.py
  intelligence/{schemas,observations,scoring,geoip,phone,nlp,service}.py
  abuse/{schemas,buckets,policy,challenges}.py
  workflow/{schemas,assignment,sla,worker,routes}.py
  marketing/{schemas,attribution,events,experiments,conversions,routes}.py
  integrations/{base,google,meta,tiktok,webhooks,notifications}.py
  content/{schemas,service,repository,routes,seo}.py
  media/{schemas,service,validation,routes}.py
  care/{schemas,service,referrals,routes}.py
  reporting/{schemas,aggregate,service,routes}.py
  governance/{schemas,audit,exports,retention,deletion,routes}.py
supabase/migrations/            # timestamp thật từ CLI; một migration/task khi cần
supabase/tests/                 # SQL permissions, constraints, concurrency helpers
 tests/{unit,integration,contracts,load}/
 tests/conftest.py               # fake clock, HTTPX ASGI client, isolated DB fixtures
 docs/backend/                  # spec, OpenAPI export, operation/runbook
```

Task 1 tạo common types: `RequestContext(request_id,received_at,actor: Actor|None)`, `Actor(user_id,branch_ids,permissions,aal)`, `VersionConflict`, `PermissionDenied`, `Page[T](items,next_cursor)`. Domain schema dùng Pydantic, repository Protocol để fake unit test; integration dùng DB thật. `Clock.now()->datetime` và injection đảm bảo test decay/expiry deterministic. Không tạo base repository CRUD tự động mở quyền.

## Các đầu việc và thứ tự

### Task 1 — Nền tảng runtime và DB test harness

**Files:** app.py; pyproject.toml; src/pagefpt/application.py, core/*.py, infra/http.py, infra/supabase.py; tests/conftest.py; tests/integration/test_foundation.py.

**Interfaces:** `create_app(settings: Settings)->FastAPI`; `SupabaseGateway.rpc(name: str,payload: dict,actor_token: str|None)->dict`; các common types ở trên. Actor-token client không mutate Authorization của shared client khi request concurrent.

- [ ] Viết `test_health_ready`, `test_error_has_request_id`, `test_two_tokens_never_cross`, `test_secret_redacted`: ready=200 khi DB truy cập được, unavailable=503; error không stack/secrets; requests đồng thời giữ token riêng.
- [ ] Chạy `uv run pytest tests/integration/test_foundation.py -q`, xác nhận test fail vì chưa có implementation.
- [ ] Implement config validated, app factory, HTTP client lifecycle/limits, clock, error mapper, logging redaction; pin lockfile; DB fixture reset schema theo test isolation.
- [ ] Chạy lại test, `uv run ruff check .`, `uv run mypy src`; PASS. Kiểm tra ASGI entrypoint local và Vercel preview configuration bằng tài liệu hiện tại.
- [ ] Commit các file của task sau khi kiểm tra diff, không secrets hay audit crawl artifacts.

### Task 2 — Auth, RBAC, RLS và scope

**Files:** identity/*.py; core/crypto.py; migration identity_permissions; supabase/tests/identity_rls.sql; tests/integration/test_identity.py.

**Interfaces:** `authorize(token: str,permission: str,branch_id: UUID|None)->Actor`; `require_scope(actor: Actor,branch_id: UUID)->None`; JWKS verifier độc lập permissions DB.

- [ ] Viết `test_cross_branch_denied` (403), `test_marketing_cannot_reveal_phone` (403), `test_revoked_membership_with_valid_jwt` (403), `test_publish_requires_aal2` (403 khi aal1), `test_anon_data_api_denied` (không dữ liệu private).
- [ ] Chạy `uv run pytest tests/integration/test_identity.py -q` và SQL test runner đã thiết lập task 1; xác nhận fail đúng hành vi còn thiếu.
- [ ] Implement JWKS issuer/audience/expiry/alg allowlist, membership queries, quyền granular, cookie CSRF nếu dùng server sessions; migration grants/revokes/RLS/view invoker. Owner không thể bỏ audit export.
- [ ] Run tests PASS với JWT thật staging/local, đối chiếu request Data API trực tiếp. Chạy DB security advisors khi CLI hỗ trợ.
- [ ] Commit task.

### Task 3 — Catalog và pricing engine

**Files:** catalog/*.py; pricing/*.py; migration catalog_pricing; tests/unit/test_pricing.py; tests/integration/test_price_publish.py.

**Interfaces:** `resolve_quote(request: QuoteRequest,as_of: datetime)->QuoteProposal`; `sign_quote(quote_id: UUID,revision: int,expires_at: datetime)->str`; `verify_quote(token: str)->QuoteTokenClaims`. QuoteRequest gồm plan_id, region_id nullable, billing_term, addon_ids; QuoteProposal chứa line_items, initial_total_vnd, effective_until, revision, status.

- [ ] Tests: `test_exact_region_beats_group`; `test_unknown_region_needs_quote`; `test_overlap_publish_rejected`; `test_boundary_end_is_exclusive`; `test_promotion_total_never_negative`; `test_vat_not_double_counted`; `test_quote_expiry_before_price_boundary`.
- [ ] Run `uv run pytest tests/unit/test_pricing.py tests/integration/test_price_publish.py -q`, xác nhận fail.
- [ ] Implement integer/Decimal formulas và promotion DSL theo spec; constraints range, revision publish, signed tokens, draft/approve/publish endpoints; catalog includes 5 nhóm dịch vụ từ product spec. Nhập giá approved fixture, không bịa giá live.
- [ ] Run PASS; thêm Hypothesis cho bất biến tổng >=0, fallback đúng scope, boundary; không snapshot nguyên response dễ vỡ.
- [ ] Commit task.

### Task 4 — Tiếp nhận lead nguyên tử và idempotency

**Files:** leads/{schemas,service,repository,routes}.py; core/crypto.py; migration lead_intake; tests/integration/test_lead_intake.py.

**Interfaces:** `submit_lead(request: LeadRequest,key: str,context: RequestContext)->LeadReceipt`; RPC `submit_lead(command: jsonb)->jsonb`; LeadReceipt gồm receipt,event_id,quote_status,next_action. Command là DTO backend-only, chứa phone ciphertext/HMAC, approved proposal hoặc needs_confirmation, request digest, consent; actor/server context không lấy từ client.

- [ ] Tests: 50 concurrent same-key requests => đúng 1 lead/queue logical job và cùng receipt; different-body/same-key=>409; DB failure=>503 không success; response dropped after commit=>retry 200; retry expired quote=>same receipt; stale quote revision=>lead saved needs_confirmation; same phone khác địa chỉ=>2 lead, 1 contact.
- [ ] Run `uv run pytest tests/integration/test_lead_intake.py -q`, fail trước implementation; fixtures giả lỗi mạng sau RPC commit thật.
- [ ] Implement VN normalization, encryption/HMAC, canonical payload digest; RPC contact upsert+lead+snapshot+consent/touch+queue+wake transaction; approved quote guard current time/revision; opaque receipt. Tạm inject abuse policy allow-all cho test intake, production bị khóa cho đến task 5.
- [ ] Run PASS; kiểm tra rollback sau từng write point, queue payload không PII, response không tiết lộ contact existence.
- [ ] Commit task.

### Task 5 — Abuse, token buckets và challenge

**Files:** abuse/*.py; leads/service.py; migration rate_buckets; tests/unit/test_abuse_policy.py; tests/integration/test_rate_limits.py.

**Interfaces:** `assess_submission(signals: AbuseSignals)->AbuseDecision`; `consume_buckets(keys: list[BucketKey],at: datetime)->BucketDecision`; `verify_challenge(token: str,session_id: UUID)->ChallengeResult`. Outcomes allow/light_challenge/strong_challenge/reject với reasons.

- [ ] Tests: exact capacity/refill spec; concurrent bucket consumption không overrun; counter vẫn ghi khi throttle; shared NAT khách khác session dưới aggregate threshold không bị gộp; VPN-only/JS-missing=allow; phone-only threshold=light challenge; expired/replayed challenge rejected.
- [ ] Run `uv run pytest tests/unit/test_abuse_policy.py tests/integration/test_rate_limits.py -q`, fail.
- [ ] Implement trusted proxy parsing dựa header Vercel đã xác minh; SQL atomic buckets trong intake transaction, lock key ordering; honeypot/server evidence; challenge provider interface fake mặc định, OTP chỉ khi có credentials/chi phí limit. Không cho anon gọi intake RPC trực tiếp.
- [ ] Run PASS; nối abuse vào task 4, rerun intake tests; tạo WAF/runbook config cho pilot, không bật reject score-only.
- [ ] Commit task.

### Task 6 — Worker serverless, fencing và recovery

**Files:** infra/queue.py; workflow/{worker,routes}.py; workflow/schemas.py; migration job_ledger; tests/integration/test_worker.py.

**Interfaces:** `process_jobs(queue: str,max_messages: int=10,deadline_seconds: int=20)->WorkerSummary`; `handle_job(job: JobEnvelope)->JobResult`; `claim_jobs(queue,limit,lease_seconds)->list[ClaimedJob]`; `complete_job(job_id,fencing_token,result)->bool`. JobEnvelope gồm id,kind,entity_id,evidence_version,attempt; ClaimedJob thêm fencing_token/lease_until.

- [ ] Tests: duplicate wake không duplicate job effect; crash sau commit trước ack replay an toàn; stale fencing complete=false; provider retry next_attempt bounded; permanent failure archived+failure row; deadline thiếu budget không claim thêm; expired global permit reclaimed.
- [ ] Run `uv run pytest tests/integration/test_worker.py -q`, fail; pgmq thật không chỉ fake list.
- [ ] Implement 5 queues, claim/complete transaction, retry jitter max6, bounded permit, wake secret và cron recovery mỗi phút khi được hỗ trợ; no daemon/no task sau response. Settings queue allowlist, max_duration margin và job kill/timeout.
- [ ] Run PASS; fault injection Function terminate, webhook lost, cron duplicate. Kiểm tra API pgmq version thật trước dùng visibility extension.
- [ ] Commit task.

### Task 7 — Intelligence và scoring có giải thích

**Files:** intelligence/*.py; migration observations_scores; tests/unit/test_scoring.py; tests/integration/test_enrichment.py.

**Interfaces:** `score_lead(evidence: EvidenceSet,as_of: datetime,ruleset: Ruleset)->ScoreBundle`; `enrich_lead(lead_id: UUID,evidence_version: int)->JobResult`; `extract_needs(text: str)->list[NeedObservation]`. ScoreBundle đúng spec contact_confidence, intent, fit nullable, completeness, automation_risk, reasons, versions.

- [ ] Tests: valid_phone_only confidence=20; knownfit=0 =>fit=null/completeness=0; 1 yes/2 unknown=>fit100/completeness1/3; latest intent event mới trọng số25, sau3 ngày=12,5 trước round; repeated clicks không tăng; event ngoài7 ngày bỏ; VPN-only risk0; stale evidence không commit; confirmed home_isp không bị ASN overwrite.
- [ ] Run `uv run pytest tests/unit/test_scoring.py tests/integration/test_enrichment.py -q`, fail.
- [ ] Implement pure scoring và evidence precedence, MMDB IPv4/v6/reserved unknown, phone provider adapter optional, cache+quotas+timeouts; NLP rules/evidence span; recompute CAS+version và encrypted identifier access scoped. Không cài mô hình ML lớn vào Function.
- [ ] Run PASS; Hypothesis invariants 0..100/determinism/monotonic fresh positive evidence; provider timeout vẫn local result, missing provider unknown. Measure score CPU và bundle size.
- [ ] Commit task.

### Task 8 — CRM, phân công, SLA và Realtime

**Files:** leads/{state_machine,routes}.py; workflow/{assignment,sla}.py; migration crm_workflow; tests/integration/test_crm.py; tests/contracts/test_realtime.py.

**Interfaces:** `transition_lead(id: UUID,command: TransitionCommand,actor: Actor)->LeadDetail`; `assign_lead(id: UUID,expected_version: int)->AssignmentResult`; `compute_sla(start: datetime,calendar: ShiftCalendar)->datetime`; `resync_changes(cursor: str|None,actor: Actor)->Page[LeadChange]`.

- [ ] Tests: concurrent assign=>1 active assignment; no shift=>unassigned manager task; reassignment không reset SLA; outside shift start next working period; stale version=>409; installed thiếu record=>409; revoked membership API deny; broadcast payload không phone/IP; reconnect nhận update lead cũ qua change cursor.
- [ ] Run `uv run pytest tests/integration/test_crm.py tests/contracts/test_realtime.py -q`, fail.
- [ ] Implement state machine theo spec sản phẩm, activity/appointment CRUD scoped, capacity assignment lock, SLA job dedup, private Broadcast notifications; keyset list và detail selective fields/reveal audit. Phiên Realtime phải revalidate/đóng khi revoke theo khả năng provider.
- [ ] Run PASS và test browser admin reconnect dựa contract, measure admin list query plan trên synthetic 100k leads.
- [ ] Commit task.

### Task 9 — Tracking, attribution, A/B và conversion adapters

**Files:** marketing/*.py; integrations/{base,google,meta,tiktok,webhooks}.py; migration marketing; tests/integration/test_marketing.py; tests/contracts/test_ads.py.

**Interfaces:** `ingest_events(batch: EventBatch,context: RequestContext)->IngestResult`; `attribute_lead(id: UUID)->Attribution`; `assign_variant(experiment: Experiment,session_id: UUID)->VariantAssignment`; `deliver(command: ConversionCommand)->DeliveryResult` với sent/unknown/retry/permanent_failure.

- [ ] Tests: optout không persist optional tracking; repeated event ID=>1 row; intake replay=>1 conversion; exposure assignment stable; first touch không overwrite; webhook same provider ID=>1 lead; timeout sau provider nhận=>unknown, không blind retry notification; PII không trong event payload.
- [ ] Run `uv run pytest tests/integration/test_marketing.py tests/contracts/test_ads.py -q`, fail.
- [ ] Implement consent gates, touches/UTM/click-ID sanitize, assignment HMAC, delivery ledger và webhooks signatures; fake adapters cho ba ads platforms, bật một kênh pilot sau kiểm chứng API/credentials. Không hardcode API cũ hoặc tính click_call thành lead.
- [ ] Run PASS với fake HTTP/respx và sandbox provider khi được cung cấp; schema whitelist và event dedup browser/server contract.
- [ ] Commit task.

### Task 10 — CMS, SEO, import và media R2

**Files:** content/*.py; media/*.py; migration cms_media_import; tests/integration/test_content_media.py.

**Interfaces:** `publish_page(page_id: UUID,expected_version: int,actor: Actor)->PublishedPage`; `create_upload_intent(command: UploadRequest,actor: Actor)->UploadIntent`; `finalize_upload(asset_id: UUID,actor: Actor)->MediaAsset`; `preview_import(file_id: UUID,kind: str)->ImportPreview`.

- [ ] Tests: script/unsafe URL block rejected; draft absent public; sitemap excludes private/admin; invalid magic bytes/quarantine không publish; oversized/pixel bomb denied; presign denied wrong role; import overlap rows errors không publish một phần; signed URL expiry correct.
- [ ] Run `uv run pytest tests/integration/test_content_media.py -q`, fail.
- [ ] Implement immutable CMS revision, schedule publish queue, canonical/redirect/sitemap; upload direct R2 intent/finalize validation+bounded image job; dry-run CSV, price import qua task3 approval; không generic URL fetch.
- [ ] Run PASS với isolated R2 bucket hoặc S3-compatible test container rồi contract test staging R2; assert CORS origin và private/export không public.
- [ ] Commit task.

### Task 11 — Care, feedback và referral

**Files:** care/*.py; integrations/notifications.py; migration care_referral; tests/integration/test_care.py.

**Interfaces:** `schedule_followup(command: FollowupCommand,actor: Actor)->Followup`; `can_deliver(contact_id: UUID,channel: str,at: datetime)->DeliveryPermission`; `record_feedback(token: str,input: FeedbackInput)->Feedback`; `approve_referral(claim_id: UUID,actor: Actor)->ReferralDecision`.

- [ ] Tests: unsubscribe sau enqueue chặn send; quiet hours defer; complaint stops upsell; feedback token không đọc CRM; self-referral rejected; cùng installation chỉ1 reward eligibility; no provider configured=>disabled không giả sent.
- [ ] Run `uv run pytest tests/integration/test_care.py -q`, fail.
- [ ] Implement preference gates ở enqueue+deliver, cap/quiet-hour calendars, followup workflow, feedback token scopes, referral conditions và manual approval. Không triển khai payout tự động.
- [ ] Run PASS; channel-specific adapter sandbox nếu được cấp quyền, unknown delivery reconciliation theo task6.
- [ ] Commit task.

### Task 12 — Reports, audit, export và vòng đời dữ liệu

**Files:** reporting/*.py; governance/*.py; migration reporting_governance; tests/integration/test_governance.py; tests/integration/test_reports.py.

**Interfaces:** `rebuild_metrics(day: date,scope: UUID)->MetricSnapshot`; `request_export(command: ExportRequest,actor: Actor)->ExportJob`; `execute_deletion(request_id: UUID)->DeletionResult`; `run_retention(as_of: datetime,max_rows: int)->RetentionSummary`.

- [ ] Tests: replay aggregate không tăng số; đổi status sửa đúng cohort; marketing không export phone; export private URL60s; CSV cell '=' an toàn; rawIP quá7 ngày xóa; consent revoke dừng queued send; delete không để PII ở audit/provider cache/R2; restore replay tombstones trước mở dữ liệu.
- [ ] Run `uv run pytest tests/integration/test_governance.py tests/integration/test_reports.py -q`, fail.
- [ ] Implement funnel metrics definition version, daily incremental+rebuild, cost CSV import; scoped audit/export chunks; retention policies config, deletion workflow/retries và backup runbook. Thời hạn lead12 tháng là pilot cần duyệt policy trước production.
- [ ] Run PASS; backup/restore rehearsal với synthetic data, chứng minh deletion replay và export permissions.
- [ ] Commit task.

### Task 13 — Hiệu năng, quan sát và rollout

**Files:** tests/load/locustfile.py; tests/integration/test_faults.py; vercel.json; docs/backend/{operations,rollout,performance-results}.md; CI workflow; core/logging.py.

**Interfaces:** Metrics `lead_commit_ms`, `api_latency_ms`, `queue_wait_ms`, `job_duration_ms`, `oldest_job_age_s`, `provider_error_total`, `realtime_lag_ms` với labels bounded không PII; readiness checks chỉ dependencies tối thiểu.

- [ ] Viết fault tests DB unavailable, stale cache price, provider429, lost wake, worker termination, JWT revoke và mobile retry; Locust workload như spec, synthetic-only staging.
- [ ] Chạy fault suite, ghi baseline warm/cold và query plans trước optimize. Lỗi correctness phải sửa task sở hữu trước, không tăng timeout để giấu lỗi.
- [ ] Tune cache revision/ETag, query indexes, HTTP pools, RPC call count, region, Function bundle; bounded batch/concurrency; add alarms API error/oldest job age/delivery failures/quota. Không microservice/Redis mặc định.
- [ ] Run full suite và benchmark 50concurrency/5lead-rps15min, burst100concurrency60s; ghi p50/p95/p99, cold-start, client RTT, quota/cost; verify API warm p95<=500ms, p99<=1s hoặc báo chưa đạt với bottleneck cụ thể.
- [ ] Hoàn tất preview/staging acceptance, expand/contract migrations, restore/rollback rehearsal; production credentials và dữ liệu giá được xác nhận rồi mới thực hiện rollout theo quyền cấp. Commit report kết quả thật, không điền PASS trước khi chạy.

## Ưu tiên và dependency

`1→2→3→4→5→6→7→8` tạo luồng intake/admin/intelligence đáng tin. Task9 cần4+6; task10 cần2+3+6; task11 cần8+9; task12 cần8–11; task13 tổng hợp sau các module nhưng observability cơ bản có từ1.

MVP: task1–8 đầy đủ; task9 event/attribution và một ads adapter được xác nhận; task10 CMS/media cơ bản; task11 callback/preferences, feedback/referral bật sau khi điều kiện được duyệt; task12 audit/report/retention cơ bản. Bản toàn dự án hoàn thiện toàn bộ task. NLP LLM, phone carrier paid lookup, ML, ads API spend sync và payout tự động không phải điều kiện intake MVP.

Ước tính để lập lịch: backend nền/intake 8–12 ngày công; queue/intelligence/CRM 10–15; marketing/CMS/care/governance 15–22; hardening/rollout 5–8. Tổng 38–57 ngày công kỹ thuật, chưa gồm frontend và thời gian chờ tài khoản/dữ liệu. Đây là ước lượng, cần hiệu chỉnh sau task1–4; không coi như cam kết giao hàng.

## Rà soát kế hoạch

- [x] Phạm vi product: catalog/giá/lead/admin/CMS/quảng cáo/chăm sóc/referral/reporting/governance có task sở hữu.
- [x] Bất biến: atomic intake, price interval, idempotency, scoped access, worker fencing có tests dự kiến.
- [x] Interface chung và version/timestamps/tiền thống nhất; score unknown nullable và có completeness.
- [x] Năm Review Focus có test ở task tương ứng.
- [x] Phân biệt ngưỡng pilot, mục tiêu benchmark và kết quả chưa đo; chưa có backend code/test/deploy được báo hoàn thành.

Handoff lịch sử trước triển khai: kế hoạch đã được dùng làm đầu vào thực thi. Trạng thái mới nhất ở phần cập nhật cuối tài liệu.


## Trạng thái thực thi 01/10/2026

Người dùng đã cấp quyền triển khai toàn bộ và tự tiếp tục. Tasks 1–13 có code theo modular monolith và tests; các checkbox phía trên giữ nguyên checklist gốc, không phản ánh rằng những bước cần cloud account/commit đã chạy. 102 local tests pass, lint/type/architecture/browser/mobile/build kiểm chứng; xem `../../backend/verification.md` và ledger `../../backend/progress.md`.

Không có Git repository nên không có commit theo từng task. Không có credentials nên các mục live Supabase/R2/vendor, staging/production acceptance, backup restore và cold/mobile RTT chưa được xác minh. Burst100 p95 local gần nhất 512.684ms, không coi tất cả SLO đã đạt. Backend implementation hoàn tất cục bộ; rollout có cấu hình reviewable tại `deploy/` và runbook.
