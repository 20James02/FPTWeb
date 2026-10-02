# Hợp đồng API backend

Schema đầy đủ, gồm kiểu dữ liệu/bắt buộc/giới hạn: `openapi.json`, tái tạo bằng `uv run python tools/export_openapi.py`. Các URL dưới đây dùng JSON; timestamps yêu cầu timezone, tiền VND là số nguyên. UUID của gói/khu vực phải lấy từ catalog đã publish. Mã địa phương trong giao diện preview không thay UUID sản phẩm. `/regions/hierarchy` dựng từ khu vực đã publish, code của option là UUID; khi chưa có catalog công bố, endpoint trả rỗng. Chỉ tải tỉnh/thành; xã/phường tải qua `/api/v1/regions/{id}/wards` có cursor. Xem `../frontend/GIA-THEO-DIA-BAN.md` về applicability, bulk/replace và quote theo địa bàn.

Đồng bộ tỉnh/thành, xã/phường qua API: xem [hợp đồng geography](../frontend/DANH-MUC-DIA-BAN-API.md), gồm quyền/MFA, nguồn dự phòng và migration11.

## HTTP, xác thực và lỗi

Public lead cần `Idempotency-Key` UUID cho mỗi ý định gửi; giữ nguyên key và body khi retry. Request ghi dữ liệu thường tối đa 16 KiB; imports 1 MiB. Response có `X-Request-ID`. Lỗi `{code,message,fields,request_id}` không echo phone/IP/input nhạy cảm. 422 sai schema, 401 chưa xác thực, 403 quyền/MFA/CSRF, 404 không thấy, 409 version/idempotency/price conflict, 429 có Retry-After, 503 dependency/busy/uncertain. Khi 409 cần reload và cho người dùng quyết định, không biến thành success.

Admin hỗ trợ Bearer JWT Supabase đã xác minh hoặc opaque cookie session. POST `/api/v1/auth/session` nhận `{email,password,otp}`; TOTP cần khi tài khoản chưa đạt AAL2. Cookie HttpOnly/SameSite=Strict, Secure trên staging/production; response không trả token Supabase. Mutation bằng cookie phải gửi `X-CSRF-Token` từ cookie CSRF; Bearer không dùng CSRF. DELETE cùng URL thu hồi session bền vững. GET `/api/v1/admin/me` lấy actor/permissions thật từ membership. Các thao tác publish/reveal/export/privacy/quản lý quyền/tích hợp yêu cầu MFA theo route.

Khôi phục admin: POST `/api/v1/auth/recovery` nhận `{email}`; POST `/api/v1/auth/recovery/reset` nhận `{email,otp,password,totp}`. Provider proof/membership/MFA được kiểm tra server, mọi BFF session bị thu hồi trước PUT mật khẩu; chỉ báo `changed:true` sau hoàn tất. Cấu hình OTP email và thứ tự lỗi tại [password-recovery.md](password-recovery.md).

## Luồng client chính

1. GET `/api/v1/catalog` và `/api/v1/regions` lấy items đã publish.
2. POST `/api/v1/quotes` với plan/region/billing term. Kết quả có snapshot và quote token được ký, revision và hạn hiệu lực. Không thấy giá phù hợp thì không tự tạo giá.
3. POST `/api/v1/leads`, ví dụ tối thiểu:

```http
Content-Type: application/json
Idempotency-Key: 65776f26-84a5-42bc-b8f7-3d43e627c3b6
```

```json
{"phone":"0901234567","consent_version":"2026-09-v1","analytics_opt_in":false,"marketing_opt_in":false}
```

201 có `{receipt,event_id,quote_status,next_action}` sau transaction commit. Cùng key/body trả receipt cũ; cùng key/body khác trả 409. Cùng số điện thoại nhưng địa chỉ/yêu cầu khác được giữ thành lead riêng. `quote_status=needs_confirmation` cần tư vấn xác nhận, không có nghĩa giá đã được chấp nhận. Điện thoại ví dụ chỉ là fixture kiểm thử.

4. Analytics tắt mặc định. Khi khách chủ động chọn, POST `/api/v1/sessions` nhận consent; PUT `/api/v1/consent` cập nhật/rút consent bằng signed session token. POST `/touches` và `/events/batch` chỉ trong scope đồng ý; batch tối đa 20 event, UUID dedup và allowlist, không nhận dữ liệu tùy ý chứa phone/IP. POST `/visits/assess` phân tích phiên được đồng ý; không chứng minh danh tính/vị trí.
5. Anti-abuse có token bucket và Turnstile challenge server. Không retry vô hạn khi 429/challenge. Client hiện giữ pending idempotency trong RAM của tab; đóng tab có thể mất key.

## Luồng admin chính

- CRM: keyset pagination `/admin/leads`, detail, reveal có audit, transitions CAS `expected_version`, activities/notes mã hóa, observations có nguồn/thời hạn, assignment/SLA, intelligence/recompute, appointments CAS.
- Giá và danh mục: draft CRUD, dry-run/apply import, MFA publish, retire; quote confirmation bảo vệ revision. Publish giá không cho overlap cùng gói/scope/term.
- Nội dung: pages draft/revision/publish/schedule, redirects local có chống loop, display settings toàn hệ thống có MFA/CAS/lưu PostgreSQL.
- Marketing: campaigns/experiments/integrations, integration-capabilities, delivery ledger và reconcile kết quả không rõ. Không trả credentials.
- Media: upload-intents → presigned quarantine PUT → finalize kiểm tra/re-encode → ảnh public; không upload arbitrary file trực tiếp public.
- Care: preferences, followup có cap/quiet hours, signed feedback, referrals approval.
- Governance/reporting: memberships, audit, jobs/replay, daily reports/rebuild, privacy requests/execute, export async/download ngắn hạn. Có scope kiểm tra trong Python và DB.

Worker dùng `/internal/jobs/process` POST và `/internal/jobs/recover` GET, yêu cầu worker secret; không nằm trong OpenAPI public. Incoming webhooks là bridge HMAC, không phải native endpoint tùy tiện nhận payload vendor. Webhook và outbound gateway contracts xem tests/contracts và runbook.

## Tính nhất quán và dữ liệu

Các command update phải gửi version hiện tại; stale version nhận 409. Lead receipt là kết quả commit, scoring/chia lead/conversion chạy queue; response intake không đợi provider. List/detail mặc định mask điện thoại và không chứa IP/ciphertext PII. Scoring có lý do, `current_carrier`/home ISP có thể unknown; đầu số và GeoIP chỉ là ước tính. Các event/contact APIs không được dùng để dò danh tính người khác.

Admin realtime hiện có durable cursor và polling 5 giây trên tab đang mở. Broadcast private chỉ có hiệu lực sau cấu hình Supabase Realtime/RLS thực tế; chưa đo độ trễ live.

## Danh mục endpoint được sinh từ code

| Method | Path | Operation |
|---|---|---|
| GET | `/` | home__get |
| GET | `/admin` | admin_root_admin_get |
| GET | `/admin/dashboard` | admin_dashboard_admin_dashboard_get |
| GET | `/admin/leads` | admin_leads_admin_leads_get |
| GET | `/admin/leads/detail` | admin_lead_detail_admin_leads_detail_get |
| GET | `/admin/login` | admin_login_admin_login_get |
| GET | `/admin/pricing` | admin_pricing_admin_pricing_get |
| GET | `/admin/reports` | admin_reports_admin_reports_get |
| GET | `/admin/settings` | admin_settings_admin_settings_get |
| PATCH | `/api/v1/admin/appointments/{id}` | update_api_v1_admin_appointments__id__patch |
| GET | `/api/v1/admin/audit` | audit_api_v1_admin_audit_get |
| POST | `/api/v1/admin/campaigns` | create_campaign_api_v1_admin_campaigns_post |
| GET | `/api/v1/admin/campaigns` | list_campaign_api_v1_admin_campaigns_get |
| GET | `/api/v1/admin/campaigns/{id}` | get_campaign_api_v1_admin_campaigns__id__get |
| PUT | `/api/v1/admin/campaigns/{id}` | update_campaign_api_v1_admin_campaigns__id__put |
| POST | `/api/v1/admin/campaigns/{id}/retire` | retire_campaign_api_v1_admin_campaigns__id__retire_post |
| GET | `/api/v1/admin/changes` | changes_api_v1_admin_changes_get |
| POST | `/api/v1/admin/costs` | costs_api_v1_admin_costs_post |
| GET | `/api/v1/admin/deliveries` | deliveries_api_v1_admin_deliveries_get |
| POST | `/api/v1/admin/deliveries/{id}/reconcile` | reconcile_api_v1_admin_deliveries__id__reconcile_post |
| POST | `/api/v1/admin/experiments` | create_experiment_api_v1_admin_experiments_post |
| GET | `/api/v1/admin/experiments` | list_experiment_api_v1_admin_experiments_get |
| GET | `/api/v1/admin/experiments/{id}` | get_experiment_api_v1_admin_experiments__id__get |
| PUT | `/api/v1/admin/experiments/{id}` | update_experiment_api_v1_admin_experiments__id__put |
| POST | `/api/v1/admin/experiments/{id}/retire` | retire_experiment_api_v1_admin_experiments__id__retire_post |
| POST | `/api/v1/admin/exports` | export_api_v1_admin_exports_post |
| GET | `/api/v1/admin/exports/{id}` | export_result_api_v1_admin_exports__id__get |
| GET | `/api/v1/admin/followups` | followup_list_api_v1_admin_followups_get |
| POST | `/api/v1/admin/followups` | followup_api_v1_admin_followups_post |
| POST | `/api/v1/admin/followups/{id}/reconcile` | reconcile_api_v1_admin_followups__id__reconcile_post |
| GET | `/api/v1/admin/integration-capabilities` | capabilities_api_v1_admin_integration_capabilities_get |
| POST | `/api/v1/admin/integrations` | create_integration_api_v1_admin_integrations_post |
| GET | `/api/v1/admin/integrations` | list_integration_api_v1_admin_integrations_get |
| GET | `/api/v1/admin/integrations/{id}` | get_integration_api_v1_admin_integrations__id__get |
| PUT | `/api/v1/admin/integrations/{id}` | update_integration_api_v1_admin_integrations__id__put |
| POST | `/api/v1/admin/integrations/{id}/retire` | retire_integration_api_v1_admin_integrations__id__retire_post |
| GET | `/api/v1/admin/jobs` | jobs_api_v1_admin_jobs_get |
| POST | `/api/v1/admin/jobs/{id}/replay` | replay_api_v1_admin_jobs__id__replay_post |
| GET | `/api/v1/admin/leads` | leads_api_v1_admin_leads_get |
| GET | `/api/v1/admin/leads/{id}` | detail_api_v1_admin_leads__id__get |
| POST | `/api/v1/admin/leads/{id}/activities` | activity_api_v1_admin_leads__id__activities_post |
| GET | `/api/v1/admin/leads/{id}/appointments` | listing_api_v1_admin_leads__id__appointments_get |
| POST | `/api/v1/admin/leads/{id}/appointments` | create_api_v1_admin_leads__id__appointments_post |
| POST | `/api/v1/admin/leads/{id}/assignments` | assign_api_v1_admin_leads__id__assignments_post |
| POST | `/api/v1/admin/leads/{id}/feedback-token` | feedback_token_api_v1_admin_leads__id__feedback_token_post |
| GET | `/api/v1/admin/leads/{id}/intelligence` | intelligence_api_v1_admin_leads__id__intelligence_get |
| POST | `/api/v1/admin/leads/{id}/observations` | observation_api_v1_admin_leads__id__observations_post |
| PUT | `/api/v1/admin/leads/{id}/preferences` | preferences_api_v1_admin_leads__id__preferences_put |
| POST | `/api/v1/admin/leads/{id}/quotes/confirm` | confirm_api_v1_admin_leads__id__quotes_confirm_post |
| POST | `/api/v1/admin/leads/{id}/recompute` | recompute_api_v1_admin_leads__id__recompute_post |
| POST | `/api/v1/admin/leads/{id}/reveal` | reveal_api_v1_admin_leads__id__reveal_post |
| POST | `/api/v1/admin/leads/{id}/transitions` | transition_api_v1_admin_leads__id__transitions_post |
| GET | `/api/v1/admin/me` | me_api_v1_admin_me_get |
| POST | `/api/v1/admin/media/upload-intents` | upload_intent_api_v1_admin_media_upload_intents_post |
| POST | `/api/v1/admin/media/{id}/finalize` | finalize_api_v1_admin_media__id__finalize_post |
| GET | `/api/v1/admin/memberships` | memberships_api_v1_admin_memberships_get |
| PUT | `/api/v1/admin/memberships` | membership_save_api_v1_admin_memberships_put |
| POST | `/api/v1/admin/pages` | create_page_api_v1_admin_pages_post |
| GET | `/api/v1/admin/pages` | list_page_api_v1_admin_pages_get |
| GET | `/api/v1/admin/pages/{id}` | get_page_api_v1_admin_pages__id__get |
| PUT | `/api/v1/admin/pages/{id}` | update_page_api_v1_admin_pages__id__put |
| POST | `/api/v1/admin/pages/{id}/retire` | retire_page_api_v1_admin_pages__id__retire_post |
| POST | `/api/v1/admin/pages/{id}/schedule` | schedule_api_v1_admin_pages__id__schedule_post |
| POST | `/api/v1/admin/plans` | create_plan_api_v1_admin_plans_post |
| GET | `/api/v1/admin/plans` | list_plan_api_v1_admin_plans_get |
| GET | `/api/v1/admin/plans/{id}` | get_plan_api_v1_admin_plans__id__get |
| PUT | `/api/v1/admin/plans/{id}` | update_plan_api_v1_admin_plans__id__put |
| POST | `/api/v1/admin/plans/{id}/retire` | retire_plan_api_v1_admin_plans__id__retire_post |
| POST | `/api/v1/admin/prices` | create_price_api_v1_admin_prices_post |
| GET | `/api/v1/admin/prices` | prices_api_v1_admin_prices_get |
| POST | `/api/v1/admin/prices/imports/apply` | apply_api_v1_admin_prices_imports_apply_post |
| POST | `/api/v1/admin/prices/imports/preview` | preview_api_v1_admin_prices_imports_preview_post |
| GET | `/api/v1/admin/prices/{id}` | price_api_v1_admin_prices__id__get |
| PUT | `/api/v1/admin/prices/{id}` | update_price_api_v1_admin_prices__id__put |
| POST | `/api/v1/admin/prices/{id}/retire` | retire_api_v1_admin_prices__id__retire_post |
| POST | `/api/v1/admin/privacy/requests` | privacy_api_v1_admin_privacy_requests_post |
| POST | `/api/v1/admin/privacy/requests/{id}/execute` | execute_privacy_api_v1_admin_privacy_requests__id__execute_post |
| POST | `/api/v1/admin/products` | create_product_api_v1_admin_products_post |
| GET | `/api/v1/admin/products` | list_product_api_v1_admin_products_get |
| GET | `/api/v1/admin/products/{id}` | get_product_api_v1_admin_products__id__get |
| PUT | `/api/v1/admin/products/{id}` | update_product_api_v1_admin_products__id__put |
| POST | `/api/v1/admin/products/{id}/retire` | retire_product_api_v1_admin_products__id__retire_post |
| POST | `/api/v1/admin/promotions` | create_promotion_api_v1_admin_promotions_post |
| GET | `/api/v1/admin/promotions` | list_promotion_api_v1_admin_promotions_get |
| GET | `/api/v1/admin/promotions/{id}` | get_promotion_api_v1_admin_promotions__id__get |
| PUT | `/api/v1/admin/promotions/{id}` | update_promotion_api_v1_admin_promotions__id__put |
| POST | `/api/v1/admin/promotions/{id}/retire` | retire_promotion_api_v1_admin_promotions__id__retire_post |
| GET | `/api/v1/admin/redirects` | listing_api_v1_admin_redirects_get |
| PUT | `/api/v1/admin/redirects` | save_api_v1_admin_redirects_put |
| POST | `/api/v1/admin/referrals` | referral_api_v1_admin_referrals_post |
| POST | `/api/v1/admin/referrals/{id}/approve` | approve_referral_api_v1_admin_referrals__id__approve_post |
| POST | `/api/v1/admin/regions` | create_region_api_v1_admin_regions_post |
| GET | `/api/v1/admin/regions` | list_region_api_v1_admin_regions_get |
| GET | `/api/v1/admin/regions/{id}` | get_region_api_v1_admin_regions__id__get |
| PUT | `/api/v1/admin/regions/{id}` | update_region_api_v1_admin_regions__id__put |
| POST | `/api/v1/admin/regions/{id}/retire` | retire_region_api_v1_admin_regions__id__retire_post |
| GET | `/api/v1/admin/reports` | reports_api_v1_admin_reports_get |
| GET | `/api/v1/admin/reports/daily` | daily_api_v1_admin_reports_daily_get |
| POST | `/api/v1/admin/reports/rebuild` | rebuild_api_v1_admin_reports_rebuild_post |
| POST | `/api/v1/admin/{kind}/{id}/publish` | publish_api_v1_admin__kind___id__publish_post |
| POST | `/api/v1/auth/session` | login_api_v1_auth_session_post |
| DELETE | `/api/v1/auth/session` | logout_api_v1_auth_session_delete |
| GET | `/api/v1/catalog` | catalog_api_v1_catalog_get |
| PUT | `/api/v1/consent` | consent_api_v1_consent_put |
| POST | `/api/v1/events/batch` | events_api_v1_events_batch_post |
| GET | `/api/v1/experiments/{id}/variant` | variant_api_v1_experiments__id__variant_get |
| POST | `/api/v1/feedback` | feedback_api_v1_feedback_post |
| POST | `/api/v1/leads` | create_lead_api_v1_leads_post |
| POST | `/api/v1/leads/challenges/verify` | verify_api_v1_leads_challenges_verify_post |
| GET | `/api/v1/pages/{slug}` | page_api_v1_pages__slug__get |
| POST | `/api/v1/quotes` | quote_api_v1_quotes_post |
| GET | `/api/v1/redirects/resolve` | resolve_api_v1_redirects_resolve_get |
| GET | `/api/v1/regions` | regions_api_v1_regions_get |
| GET | `/api/v1/regions/hierarchy` | regions_hierarchy_api_v1_regions_hierarchy_get |
| POST | `/api/v1/sessions` | session_api_v1_sessions_post |
| GET | `/api/v1/system/display-settings` | read_api_v1_system_display_settings_get |
| POST | `/api/v1/system/display-settings` | save_api_v1_system_display_settings_post |
| POST | `/api/v1/touches` | touch_api_v1_touches_post |
| POST | `/api/v1/visits/assess` | assess_api_v1_visits_assess_post |
| POST | `/api/v1/webhooks/leads/{provider}` | gateway_lead_api_v1_webhooks_leads__provider__post |
| GET | `/chinh-sach-bao-mat` | privacy_policy_chinh_sach_bao_mat_get |
| GET | `/health/live` | live_health_live_get |
| GET | `/health/ready` | ready_health_ready_get |
| GET | `/khuyen-mai` | landing_page_khuyen_mai_get |
| GET | `/san-pham/{slug}` | product_detail_san_pham__slug__get |
