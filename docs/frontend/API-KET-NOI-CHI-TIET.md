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

