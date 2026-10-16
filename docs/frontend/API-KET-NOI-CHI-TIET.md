# API và tham số kết nối frontend

Sinh từ code hiện tại bằng `uv run python tools/export_frontend_contract.py`. Không truy cập tài khoản cloud. Quyền trong bảng là kiểm tra Python; SQL còn kiểm tra scope/assignee/global. Response OpenAPI của phần lớn API chưa có DTO: xem response map trong prompt, không coi schema `{}` là hợp đồng đầy đủ.

Tổng 266 method/path: 259 có trong OpenAPI và 7 route ngoài OpenAPI.

## Toàn bộ method, URL, quyền và body

| Method | URL | Caller/quyền Python | MFA | Body model | Nguồn |
|---|---|---|---|---|---|
| GET | `/` | public_html | — | — | `src/pagefpt/web/client_routes.py:35` |
| GET | `/admin` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:59` |
| GET | `/admin/accessories` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:163` |
| GET | `/admin/account` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:81` |
| GET | `/admin/appearance` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:168` |
| GET | `/admin/content` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:140` |
| GET | `/admin/dashboard` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:94` |
| GET | `/admin/landing-pages` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:178` |
| GET | `/admin/leads` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:104` |
| GET | `/admin/leads/detail` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:109` |
| GET | `/admin/link-performance` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:196` |
| GET | `/admin/login` | public_admin_login | — | — | `src/pagefpt/web/admin_routes.py:76` |
| GET | `/admin/marketing` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:135` |
| GET | `/admin/measurement` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:203` |
| GET | `/admin/navigation` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:173` |
| GET | `/admin/operations` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:147` |
| GET | `/admin/pricing` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:116` |
| GET | `/admin/reports` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:123` |
| GET | `/admin/settings` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:128` |
| GET | `/admin/vouchers` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:191` |
| GET | `/admin/workbench` | server_guarded_admin_html | — | — | `src/pagefpt/web/admin_routes.py:99` |
| GET | `/api/v1/accessories` | public | — | — | `src/pagefpt/modules/catalog/routes.py:61` |
| GET | `/api/v1/admin/address-options` | lead.write | — | — | `src/pagefpt/modules/leads/profile.py:47` |
| PATCH | `/api/v1/admin/appointments/{id}` | lead.write | — | AppointmentUpdate | `src/pagefpt/modules/leads/appointments.py:58` |
| GET | `/api/v1/admin/assignees` | lead.assign | — | — | `src/pagefpt/modules/leads/admin.py:240` |
| GET | `/api/v1/admin/audit` | governance.audit | AAL2 | — | `src/pagefpt/modules/reporting/routes.py:69` |
| GET | `/api/v1/admin/campaigns` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:102` |
| POST | `/api/v1/admin/campaigns` | marketing.write | — | CampaignInput | `src/pagefpt/api/v1/resources.py:49` |
| GET | `/api/v1/admin/campaigns/{id}` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/campaigns/{id}` | marketing.write | — | CampaignInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/campaigns/{id}/retire` | marketing.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/changes` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:162` |
| GET | `/api/v1/admin/costs` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:102` |
| POST | `/api/v1/admin/costs` | marketing.write | — | CostInput | `src/pagefpt/modules/governance/routes.py:19` |
| GET | `/api/v1/admin/costs/{id}` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/costs/{id}` | marketing.write | — | CostInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/costs/{id}/retire` | marketing.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/deliveries` | marketing.write | AAL2 | — | `src/pagefpt/modules/integrations/routes.py:29` |
| POST | `/api/v1/admin/deliveries/{id}/reconcile` | marketing.write | AAL2 | ReconcileConversion | `src/pagefpt/modules/integrations/routes.py:41` |
| GET | `/api/v1/admin/experiments` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:102` |
| POST | `/api/v1/admin/experiments` | marketing.write | — | ExperimentInput | `src/pagefpt/api/v1/resources.py:49` |
| GET | `/api/v1/admin/experiments/{id}` | marketing.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/experiments/{id}` | marketing.write | — | ExperimentInput | `src/pagefpt/api/v1/resources.py:68` |
| GET | `/api/v1/admin/experiments/{id}/results` | marketing.write | — | — | `src/pagefpt/modules/marketing/routes.py:201` |
| POST | `/api/v1/admin/experiments/{id}/retire` | marketing.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| POST | `/api/v1/admin/exports` | governance.export | AAL2 | ExportInput | `src/pagefpt/modules/governance/routes.py:48` |
| GET | `/api/v1/admin/exports/{id}` | governance.export | AAL2 | — | `src/pagefpt/modules/governance/routes.py:61` |
| GET | `/api/v1/admin/followups` | care.write | — | — | `src/pagefpt/modules/care/routes.py:48` |
| POST | `/api/v1/admin/followups` | care.write | — | FollowupInput | `src/pagefpt/modules/care/routes.py:35` |
| POST | `/api/v1/admin/followups/{id}/reconcile` | care.approve | AAL2 | ReconcileInput | `src/pagefpt/modules/care/routes.py:102` |
| GET | `/api/v1/admin/integration-capabilities` | marketing.write | AAL2 | — | `src/pagefpt/modules/integrations/routes.py:14` |
| GET | `/api/v1/admin/integrations` | marketing.write | AAL2 | — | `src/pagefpt/api/v1/resources.py:102` |
| POST | `/api/v1/admin/integrations` | marketing.write | AAL2 | IntegrationInput | `src/pagefpt/api/v1/resources.py:49` |
| GET | `/api/v1/admin/integrations/{id}` | marketing.write | AAL2 | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/integrations/{id}` | marketing.write | AAL2 | IntegrationInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/integrations/{id}/retire` | marketing.write | AAL2 | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/jobs` | workflow.manage | — | — | `src/pagefpt/modules/reporting/routes.py:76` |
| POST | `/api/v1/admin/jobs/{id}/replay` | workflow.manage | AAL2 | — | `src/pagefpt/modules/reporting/routes.py:83` |
| POST | `/api/v1/admin/landing-preview` | content.write | — | PageInput | `src/pagefpt/web/cms_pages.py:85` |
| POST | `/api/v1/admin/lead-assignments` | lead.assign | — | BulkAssignmentCommand | `src/pagefpt/modules/leads/admin.py:247` |
| GET | `/api/v1/admin/lead-counts` | lead.read | — | — | `src/pagefpt/modules/administration/routes.py:226` |
| GET | `/api/v1/admin/lead-views` | lead.read | — | — | `src/pagefpt/modules/administration/routes.py:179` |
| POST | `/api/v1/admin/lead-views` | lead.read | — | LeadViewInput | `src/pagefpt/modules/administration/routes.py:186` |
| DELETE | `/api/v1/admin/lead-views/{id}` | lead.read | — | — | `src/pagefpt/modules/administration/routes.py:213` |
| PUT | `/api/v1/admin/lead-views/{id}` | lead.read | — | LeadViewInput | `src/pagefpt/modules/administration/routes.py:199` |
| GET | `/api/v1/admin/leads` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:101` |
| GET | `/api/v1/admin/leads/{id}` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:176` |
| POST | `/api/v1/admin/leads/{id}/activities` | lead.write | — | ActivityCommand | `src/pagefpt/modules/leads/admin.py:231` |
| GET | `/api/v1/admin/leads/{id}/appointments` | lead.read | — | — | `src/pagefpt/modules/leads/appointments.py:40` |
| POST | `/api/v1/admin/leads/{id}/appointments` | lead.write | — | AppointmentCreate | `src/pagefpt/modules/leads/appointments.py:47` |
| POST | `/api/v1/admin/leads/{id}/assignments` | lead.assign | — | AssignmentCommand | `src/pagefpt/modules/leads/admin.py:191` |
| GET | `/api/v1/admin/leads/{id}/billing` | lead.read | — | — | `src/pagefpt/modules/leads/billing.py:101` |
| PUT | `/api/v1/admin/leads/{id}/billing` | lead.write | AAL2 | DealSave | `src/pagefpt/modules/leads/billing.py:109` |
| POST | `/api/v1/admin/leads/{id}/feedback-token` | care.write | — | — | `src/pagefpt/modules/care/routes.py:55` |
| GET | `/api/v1/admin/leads/{id}/intelligence` | lead.read | — | — | `src/pagefpt/modules/intelligence/routes.py:16` |
| POST | `/api/v1/admin/leads/{id}/observations` | intelligence.write | — | ObservationCommand | `src/pagefpt/modules/leads/admin.py:218` |
| GET | `/api/v1/admin/leads/{id}/payments` | lead.read | — | — | `src/pagefpt/modules/leads/billing.py:123` |
| POST | `/api/v1/admin/leads/{id}/payments` | lead.write | AAL2 | PaymentCreate | `src/pagefpt/modules/leads/billing.py:146` |
| PUT | `/api/v1/admin/leads/{id}/preferences` | care.write | — | PreferencesInput | `src/pagefpt/modules/care/routes.py:22` |
| GET | `/api/v1/admin/leads/{id}/profile` | admin | — | — | `src/pagefpt/modules/leads/profile.py:68` |
| PUT | `/api/v1/admin/leads/{id}/profile` | admin | — | ProfileInput | `src/pagefpt/modules/leads/profile.py:77` |
| POST | `/api/v1/admin/leads/{id}/quotes/confirm` | lead.write | — | ConfirmQuote | `src/pagefpt/modules/pricing/routes.py:116` |
| POST | `/api/v1/admin/leads/{id}/recompute` | intelligence.write | — | — | `src/pagefpt/modules/intelligence/routes.py:23` |
| POST | `/api/v1/admin/leads/{id}/reveal` | lead.pii | AAL2 | — | `src/pagefpt/modules/leads/admin.py:183` |
| POST | `/api/v1/admin/leads/{id}/transitions` | lead.write | — | TransitionCommand | `src/pagefpt/modules/leads/admin.py:209` |
| GET | `/api/v1/admin/leads/{id}/voucher` | lead.write | — | — | `src/pagefpt/modules/vouchers/routes.py:295` |
| POST | `/api/v1/admin/leads/{id}/voucher/reserve` | lead.write | — | ReserveInput | `src/pagefpt/modules/vouchers/routes.py:301` |
| POST | `/api/v1/admin/leads/{id}/voucher/{action}` | lead.write | — | ActionInput | `src/pagefpt/modules/vouchers/routes.py:368` |
| GET | `/api/v1/admin/link-performance` | marketing.write (global SQL scope) | — | — | `src/pagefpt/modules/link_analytics/routes.py:99` |
| POST | `/api/v1/admin/link-performance` | marketing.write (global SQL scope) | — | pagefpt__modules__link_analytics__schemas__LinkInput | `src/pagefpt/modules/link_analytics/routes.py:105` |
| POST | `/api/v1/admin/link-performance/bulk` | marketing.write (global SQL scope) | — | pagefpt__modules__link_analytics__schemas__BulkInput | `src/pagefpt/modules/link_analytics/routes.py:126` |
| GET | `/api/v1/admin/link-performance/options` | marketing.write (global SQL scope) | — | — | `src/pagefpt/modules/link_analytics/routes.py:93` |
| GET | `/api/v1/admin/link-performance/report` | marketing.write (global SQL scope) | — | — | `src/pagefpt/modules/link_analytics/routes.py:38` |
| PUT | `/api/v1/admin/link-performance/{id}` | marketing.write (global SQL scope) | — | LinkUpdate | `src/pagefpt/modules/link_analytics/routes.py:113` |
| GET | `/api/v1/admin/locations` | catalog.write | — | — | `src/pagefpt/modules/catalog/routes.py:118` |
| GET | `/api/v1/admin/locations/source` | catalog.write | — | — | `src/pagefpt/modules/catalog/geography_routes.py:29` |
| POST | `/api/v1/admin/locations/sync` | catalog.write | AAL2 | GeographySyncInput | `src/pagefpt/modules/catalog/geography_routes.py:44` |
| GET | `/api/v1/admin/me` | admin | — | — | `src/pagefpt/modules/identity/routes.py:9` |
| POST | `/api/v1/admin/measurement/bulk` | measurement.publish | AAL2 | pagefpt__modules__measurement__schemas__BulkInput | `src/pagefpt/modules/measurement/routes.py:301` |
| GET | `/api/v1/admin/measurement/campaigns` | marketing.write; measurement.read | — | — | `src/pagefpt/modules/measurement/campaigns.py:26` |
| PUT | `/api/v1/admin/measurement/campaigns/{id}/mapping` | marketing.write; measurement.configure | AAL2 | CampaignMapping | `src/pagefpt/modules/measurement/campaigns.py:33` |
| POST | `/api/v1/admin/measurement/campaigns/{id}/sync-apply` | marketing.write; measurement.external_write | AAL2 | ApplyUpdate | `src/pagefpt/modules/measurement/external_updates.py:129` |
| POST | `/api/v1/admin/measurement/campaigns/{id}/sync-preview` | marketing.write; measurement.external_write | AAL2 | VersionInput | `src/pagefpt/modules/measurement/external_updates.py:101` |
| GET | `/api/v1/admin/measurement/campaigns/{id}/tracking` | marketing.write; measurement.read | — | — | `src/pagefpt/modules/measurement/campaigns.py:60` |
| GET | `/api/v1/admin/measurement/capabilities` | measurement.read | — | — | `src/pagefpt/modules/measurement/accounts.py:62` |
| GET | `/api/v1/admin/measurement/configs` | measurement.read | — | — | `src/pagefpt/modules/measurement/routes.py:91` |
| POST | `/api/v1/admin/measurement/configs` | measurement.configure | AAL2 | ConfigInput | `src/pagefpt/modules/measurement/routes.py:97` |
| PUT | `/api/v1/admin/measurement/configs/{id}` | measurement.configure | AAL2 | ConfigUpdate | `src/pagefpt/modules/measurement/routes.py:110` |
| POST | `/api/v1/admin/measurement/configs/{id}/publish` | measurement.publish | AAL2 | VersionInput | `src/pagefpt/modules/measurement/routes.py:172` |
| POST | `/api/v1/admin/measurement/configs/{id}/simulate` | measurement.configure | AAL2 | SimulationInput | `src/pagefpt/modules/measurement/routes.py:142` |
| POST | `/api/v1/admin/measurement/configs/{id}/validate` | measurement.configure | AAL2 | VersionInput | `src/pagefpt/modules/measurement/routes.py:135` |
| GET | `/api/v1/admin/measurement/connections` | measurement.read | — | — | `src/pagefpt/modules/measurement/routes.py:36` |
| POST | `/api/v1/admin/measurement/connections` | measurement.configure | AAL2 | ConnectionInput | `src/pagefpt/modules/measurement/routes.py:42` |
| PUT | `/api/v1/admin/measurement/connections/{id}` | measurement.configure | AAL2 | ConnectionUpdate | `src/pagefpt/modules/measurement/routes.py:55` |
| POST | `/api/v1/admin/measurement/connections/{id}/check` | measurement.configure | AAL2 | — | `src/pagefpt/modules/measurement/accounts.py:74` |
| POST | `/api/v1/admin/measurement/connections/{id}/credentials` | measurement.credentials | AAL2 | CredentialsInput | `src/pagefpt/modules/measurement/routes.py:68` |
| POST | `/api/v1/admin/measurement/connections/{id}/disable` | measurement.publish | AAL2 | VersionInput | `src/pagefpt/modules/measurement/routes.py:204` |
| POST | `/api/v1/admin/measurement/connections/{id}/oauth/start` | measurement.credentials | AAL2 | — | `src/pagefpt/modules/measurement/accounts.py:150` |
| POST | `/api/v1/admin/measurement/cost-imports/apply` | measurement.configure | AAL2 | CostApply | `src/pagefpt/modules/measurement/reporting.py:43` |
| POST | `/api/v1/admin/measurement/cost-imports/preview` | measurement.configure | AAL2 | CostImport | `src/pagefpt/modules/measurement/reporting.py:22` |
| GET | `/api/v1/admin/measurement/deliveries` | measurement.read | — | — | `src/pagefpt/modules/measurement/routes.py:272` |
| POST | `/api/v1/admin/measurement/deliveries/{id}/retry` | measurement.replay | AAL2 | — | `src/pagefpt/modules/measurement/routes.py:278` |
| GET | `/api/v1/admin/measurement/oauth/callback` | measurement.credentials | AAL2 | — | `src/pagefpt/modules/measurement/accounts.py:230` |
| GET | `/api/v1/admin/measurement/releases` | measurement.read | — | — | `src/pagefpt/modules/measurement/routes.py:186` |
| POST | `/api/v1/admin/measurement/releases/{id}/restore` | measurement.publish | AAL2 | VersionInput | `src/pagefpt/modules/measurement/routes.py:192` |
| GET | `/api/v1/admin/measurement/reports` | admin | — | — | `src/pagefpt/modules/measurement/routes.py:288` |
| GET | `/api/v1/admin/measurement/sync-jobs` | measurement.read | — | — | `src/pagefpt/modules/measurement/sync.py:45` |
| POST | `/api/v1/admin/measurement/sync-jobs` | measurement.configure | AAL2 | SyncInput | `src/pagefpt/modules/measurement/sync.py:33` |
| POST | `/api/v1/admin/media/upload-intents` | content.write | — | UploadInput | `src/pagefpt/modules/media/routes.py:24` |
| POST | `/api/v1/admin/media/{id}/finalize` | content.write | — | — | `src/pagefpt/modules/media/routes.py:50` |
| GET | `/api/v1/admin/memberships` | identity.manage | AAL2 | — | `src/pagefpt/modules/identity/routes.py:15` |
| PUT | `/api/v1/admin/memberships` | identity.manage | AAL2 | MembershipInput | `src/pagefpt/modules/identity/routes.py:24` |
| GET | `/api/v1/admin/notifications` | lead.read | — | — | `src/pagefpt/modules/leads/billing.py:188` |
| POST | `/api/v1/admin/notifications/{id}/read` | lead.read | — | — | `src/pagefpt/modules/leads/billing.py:195` |
| GET | `/api/v1/admin/operations/settings` | 'lead.read' if actor.permits('lead.read') else 'workflow.manage' | — | — | `src/pagefpt/modules/administration/routes.py:33` |
| PUT | `/api/v1/admin/operations/settings` | workflow.manage | AAL2 | OperationalSettings | `src/pagefpt/modules/administration/routes.py:40` |
| GET | `/api/v1/admin/operations/status` | workflow.manage | — | — | `src/pagefpt/modules/administration/routes.py:53` |
| GET | `/api/v1/admin/pages` | content.write | — | — | `src/pagefpt/api/v1/resources.py:102` |
| POST | `/api/v1/admin/pages` | content.write | — | PageInput | `src/pagefpt/api/v1/resources.py:49` |
| GET | `/api/v1/admin/pages/{id}` | content.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/pages/{id}` | content.write | — | PageInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/pages/{id}/retire` | content.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| POST | `/api/v1/admin/pages/{id}/schedule` | content.publish | AAL2 | ScheduleInput | `src/pagefpt/modules/content/scheduling.py:24` |
| PATCH | `/api/v1/admin/payments/{id}` | lead.write | AAL2 | PaymentUpdate | `src/pagefpt/modules/leads/billing.py:160` |
| POST | `/api/v1/admin/payments/{id}/collect` | lead.write | AAL2 | PaymentCollect | `src/pagefpt/modules/leads/billing.py:174` |
| GET | `/api/v1/admin/plans` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:88` |
| POST | `/api/v1/admin/plans` | catalog.write | — | PlanInput | `src/pagefpt/modules/catalog/routes.py:185` |
| POST | `/api/v1/admin/plans/reorder` | catalog.write | — | PlanReorderInput | `src/pagefpt/modules/catalog/routes.py:144` |
| GET | `/api/v1/admin/plans/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/plans/{id}` | catalog.write | — | PlanInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/plans/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/prices` | pricing.write | — | — | `src/pagefpt/modules/pricing/routes.py:33` |
| POST | `/api/v1/admin/prices` | pricing.write | — | PriceInput | `src/pagefpt/modules/catalog/routes.py:242` |
| POST | `/api/v1/admin/prices/bulk` | pricing.write; pricing.publish | AAL2 | BulkPriceInput | `src/pagefpt/modules/pricing/routes.py:48` |
| POST | `/api/v1/admin/prices/imports/apply` | pricing.write | AAL2 | ApplyInput | `src/pagefpt/modules/pricing/imports.py:66` |
| POST | `/api/v1/admin/prices/imports/preview` | pricing.write | — | ImportInput | `src/pagefpt/modules/pricing/imports.py:48` |
| GET | `/api/v1/admin/prices/matrix` | pricing.write | — | — | `src/pagefpt/modules/pricing/routes.py:15` |
| POST | `/api/v1/admin/prices/matrix` | pricing.write; pricing.publish | AAL2 | MatrixPriceInput | `src/pagefpt/modules/pricing/routes.py:22` |
| GET | `/api/v1/admin/prices/{id}` | pricing.write | — | — | `src/pagefpt/modules/pricing/routes.py:76` |
| PUT | `/api/v1/admin/prices/{id}` | pricing.write | — | PriceInput | `src/pagefpt/modules/pricing/routes.py:83` |
| POST | `/api/v1/admin/prices/{id}/replace` | pricing.write; pricing.publish | AAL2 | PriceInput | `src/pagefpt/modules/pricing/routes.py:59` |
| POST | `/api/v1/admin/prices/{id}/retire` | pricing.publish | AAL2 | VersionCommand | `src/pagefpt/modules/pricing/routes.py:99` |
| POST | `/api/v1/admin/privacy/requests` | governance.write | AAL2 | PrivacyInput | `src/pagefpt/modules/governance/routes.py:32` |
| POST | `/api/v1/admin/privacy/requests/{id}/execute` | governance.delete | AAL2 | — | `src/pagefpt/modules/governance/routes.py:41` |
| GET | `/api/v1/admin/products` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:88` |
| POST | `/api/v1/admin/products` | catalog.write | — | ProductInput | `src/pagefpt/api/v1/resources.py:49` |
| GET | `/api/v1/admin/products/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/products/{id}` | catalog.write | — | ProductInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/products/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/promotions` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:102` |
| POST | `/api/v1/admin/promotions` | catalog.write | — | PromotionInput | `src/pagefpt/api/v1/resources.py:49` |
| GET | `/api/v1/admin/promotions/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/promotions/{id}` | catalog.write | — | PromotionInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/promotions/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/redirects` | content.write | — | — | `src/pagefpt/modules/content/redirects.py:56` |
| PUT | `/api/v1/admin/redirects` | content.publish | AAL2 | RedirectInput | `src/pagefpt/modules/content/redirects.py:49` |
| POST | `/api/v1/admin/referrals` | care.write | — | ReferralInput | `src/pagefpt/modules/care/routes.py:75` |
| POST | `/api/v1/admin/referrals/{id}/approve` | care.approve | AAL2 | VersionCommand | `src/pagefpt/modules/care/routes.py:84` |
| GET | `/api/v1/admin/regions` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:88` |
| POST | `/api/v1/admin/regions` | catalog.write | — | RegionInput | `src/pagefpt/modules/catalog/routes.py:190` |
| GET | `/api/v1/admin/regions/{id}` | catalog.write | — | — | `src/pagefpt/api/v1/resources.py:107` |
| PUT | `/api/v1/admin/regions/{id}` | catalog.write | — | RegionInput | `src/pagefpt/api/v1/resources.py:68` |
| POST | `/api/v1/admin/regions/{id}/retire` | catalog.write | — | VersionCommand | `src/pagefpt/api/v1/resources.py:112` |
| GET | `/api/v1/admin/reports` | report.read | — | — | `src/pagefpt/modules/governance/routes.py:12` |
| GET | `/api/v1/admin/reports/analytics` | report.read | — | — | `src/pagefpt/modules/reporting/routes.py:28` |
| GET | `/api/v1/admin/reports/branches` | report.read | — | — | `src/pagefpt/modules/reporting/routes.py:19` |
| GET | `/api/v1/admin/reports/daily` | report.read | — | — | `src/pagefpt/modules/reporting/routes.py:62` |
| POST | `/api/v1/admin/reports/rebuild` | report.read | — | RebuildInput | `src/pagefpt/modules/reporting/routes.py:53` |
| GET | `/api/v1/admin/reports/summary` | report.read | — | — | `src/pagefpt/modules/administration/routes.py:139` |
| GET | `/api/v1/admin/staff` | identity.manage | AAL2 | — | `src/pagefpt/modules/identity/accounts.py:295` |
| POST | `/api/v1/admin/staff` | identity.manage; permission | AAL2 | StaffCreate | `src/pagefpt/modules/identity/accounts.py:321` |
| GET | `/api/v1/admin/staff/branches` | identity.manage | AAL2 | — | `src/pagefpt/modules/identity/accounts.py:312` |
| GET | `/api/v1/admin/staff/roles` | identity.manage | AAL2 | — | `src/pagefpt/modules/identity/accounts.py:288` |
| GET | `/api/v1/admin/vouchers` | marketing.write | — | — | `src/pagefpt/modules/vouchers/routes.py:81` |
| POST | `/api/v1/admin/vouchers` | marketing.write | — | VoucherInput | `src/pagefpt/modules/vouchers/routes.py:89` |
| GET | `/api/v1/admin/vouchers/employees` | marketing.write | — | — | `src/pagefpt/modules/vouchers/routes.py:58` |
| GET | `/api/v1/admin/vouchers/inventory` | marketing.write | — | — | `src/pagefpt/modules/vouchers/routes.py:64` |
| PUT | `/api/v1/admin/vouchers/inventory` | marketing.write; pricing.publish | AAL2 | InventoryInput | `src/pagefpt/modules/vouchers/routes.py:70` |
| GET | `/api/v1/admin/vouchers/links/{slug}/qr` | marketing.write | — | — | `src/pagefpt/modules/vouchers/routes.py:161` |
| GET | `/api/v1/admin/vouchers/options` | marketing.write | — | — | `src/pagefpt/modules/vouchers/routes.py:41` |
| GET | `/api/v1/admin/vouchers/report` | marketing.write | — | — | `src/pagefpt/modules/vouchers/routes.py:35` |
| DELETE | `/api/v1/admin/vouchers/{id}` | marketing.write; pricing.publish | AAL2 | — | `src/pagefpt/modules/vouchers/routes.py:134` |
| PUT | `/api/v1/admin/vouchers/{id}` | marketing.write | — | VoucherUpdate | `src/pagefpt/modules/vouchers/routes.py:97` |
| POST | `/api/v1/admin/vouchers/{id}/links` | marketing.write | — | pagefpt__modules__vouchers__schemas__LinkInput | `src/pagefpt/modules/vouchers/routes.py:146` |
| POST | `/api/v1/admin/vouchers/{id}/pause` | marketing.write; pricing.publish | AAL2 | VersionCommand | `src/pagefpt/modules/vouchers/routes.py:122` |
| POST | `/api/v1/admin/vouchers/{id}/publish` | marketing.write; pricing.publish | AAL2 | VersionCommand | `src/pagefpt/modules/vouchers/routes.py:110` |
| GET | `/api/v1/admin/workbench` | lead.read | — | — | `src/pagefpt/modules/leads/admin.py:169` |
| GET | `/api/v1/admin/workspace/{kind}` | RESOURCE_PERMISSIONS[kind] | — | — | `src/pagefpt/modules/administration/routes.py:105` |
| POST | `/api/v1/admin/{kind}/{id}/publish` | prices:pricing.publish; pages:content.publish; experiments:marketing.write; plans/products/regions/promotions:catalog.write | AAL2 | VersionCommand | `src/pagefpt/modules/catalog/routes.py:195` |
| GET | `/api/v1/auth/account` | own active membership; CSRF for writes | — | — | `src/pagefpt/modules/identity/accounts.py:98` |
| POST | `/api/v1/auth/account/password` | own active membership; CSRF for writes | — | PasswordChange | `src/pagefpt/modules/identity/accounts.py:221` |
| POST | `/api/v1/auth/mfa/enroll` | own active membership; CSRF for writes | — | Enroll | `src/pagefpt/modules/identity/accounts.py:116` |
| DELETE | `/api/v1/auth/mfa/{id}` | own active membership; CSRF for writes | — | — | `src/pagefpt/modules/identity/accounts.py:185` |
| POST | `/api/v1/auth/mfa/{id}/verify` | own active membership; CSRF for writes | — | Code | `src/pagefpt/modules/identity/accounts.py:131` |
| POST | `/api/v1/auth/recovery` | active membership after provider proof on reset | — | RecoveryEmail | `src/pagefpt/modules/identity/recovery.py:49` |
| POST | `/api/v1/auth/recovery/reset` | active membership after provider proof on reset | — | ResetPassword | `src/pagefpt/modules/identity/recovery.py:125` |
| POST | `/api/v1/auth/recovery/verify` | active membership after provider proof on reset | — | RecoveryCode | `src/pagefpt/modules/identity/recovery.py:106` |
| DELETE | `/api/v1/auth/session` | login_or_cookie_session | — | — | `src/pagefpt/modules/identity/sessions.py:177` |
| POST | `/api/v1/auth/session` | login_or_cookie_session | — | Login | `src/pagefpt/modules/identity/sessions.py:122` |
| GET | `/api/v1/catalog` | public | — | — | `src/pagefpt/modules/catalog/routes.py:48` |
| PUT | `/api/v1/consent` | public | — | ConsentUpdate | `src/pagefpt/modules/marketing/routes.py:64` |
| POST | `/api/v1/consent/revoke` | public | — | SessionResume | `src/pagefpt/modules/marketing/routes.py:43` |
| POST | `/api/v1/events/batch` | public | — | EventBatch | `src/pagefpt/modules/marketing/routes.py:75` |
| GET | `/api/v1/experiments/{id}/variant` | public | — | — | `src/pagefpt/modules/marketing/routes.py:169` |
| POST | `/api/v1/experiments/{id}/variant` | public | — | VariantRequest | `src/pagefpt/modules/marketing/routes.py:196` |
| POST | `/api/v1/feedback` | public | — | FeedbackInput | `src/pagefpt/modules/care/routes.py:67` |
| GET | `/api/v1/landing/{slug}/activity` | public | — | — | `src/pagefpt/web/cms_pages.py:24` |
| POST | `/api/v1/leads` | public | — | LeadRequest | `src/pagefpt/modules/leads/routes.py:11` |
| POST | `/api/v1/leads/challenges/verify` | public | — | ChallengeInput | `src/pagefpt/modules/abuse/challenges.py:22` |
| GET | `/api/v1/link-tracking/context` | public | — | — | `src/pagefpt/modules/link_analytics/routes.py:179` |
| POST | `/api/v1/link-tracking/engagement` | public | — | EngagementInput | `src/pagefpt/modules/link_analytics/routes.py:232` |
| POST | `/api/v1/link-tracking/revoke` | public | — | RevokeInput | `src/pagefpt/modules/link_analytics/routes.py:245` |
| POST | `/api/v1/link-tracking/visit` | public | — | pagefpt__modules__link_analytics__schemas__VisitInput | `src/pagefpt/modules/link_analytics/routes.py:197` |
| GET | `/api/v1/measurement/config` | public | — | — | `src/pagefpt/modules/measurement/routes.py:216` |
| POST | `/api/v1/measurement/config/session` | public | — | SessionConfigInput | `src/pagefpt/modules/measurement/routes.py:247` |
| GET | `/api/v1/pages/{slug}` | public | — | — | `src/pagefpt/modules/content/routes.py:12` |
| POST | `/api/v1/quotes` | public | — | QuoteRequest | `src/pagefpt/modules/catalog/routes.py:251` |
| GET | `/api/v1/redirects/resolve` | public | — | — | `src/pagefpt/modules/content/redirects.py:63` |
| GET | `/api/v1/regions` | public | — | — | `src/pagefpt/modules/catalog/routes.py:139` |
| GET | `/api/v1/regions/hierarchy` | public | — | — | `src/pagefpt/modules/catalog/routes.py:69` |
| GET | `/api/v1/regions/location-suggestion` | public | — | — | `src/pagefpt/modules/catalog/geography_routes.py:17` |
| GET | `/api/v1/regions/{id}/wards` | public | — | — | `src/pagefpt/modules/catalog/routes.py:100` |
| POST | `/api/v1/sessions` | public | — | ConsentInput | `src/pagefpt/modules/marketing/routes.py:17` |
| POST | `/api/v1/sessions/resume` | public | — | SessionResume | `src/pagefpt/modules/marketing/routes.py:33` |
| GET | `/api/v1/system/display-settings` | public | — | — | `src/pagefpt/modules/content/display_settings.py:229` |
| POST | `/api/v1/system/display-settings` | content.publish | AAL2 | DisplayPatch | `src/pagefpt/modules/content/display_settings.py:234` |
| POST | `/api/v1/touches` | public | — | AttributionInput | `src/pagefpt/modules/marketing/routes.py:128` |
| POST | `/api/v1/visits/assess` | public | — | pagefpt__modules__intelligence__routes__VisitInput | `src/pagefpt/modules/intelligence/routes.py:37` |
| DELETE | `/api/v1/vouchers/context` | public | — | — | `src/pagefpt/modules/vouchers/routes.py:248` |
| GET | `/api/v1/vouchers/context` | public | — | — | `src/pagefpt/modules/vouchers/routes.py:242` |
| POST | `/api/v1/vouchers/context` | public | — | ContextInput | `src/pagefpt/modules/vouchers/routes.py:255` |
| POST | `/api/v1/webhooks/leads/{provider}` | server HMAC signature | — | LeadWebhook | `src/pagefpt/modules/integrations/webhooks.py:27` |
| GET | `/chinh-sach-bao-mat` | public_html | — | — | `src/pagefpt/web/client_routes.py:93` |
| GET | `/do-toc-do` | server_guarded_admin_html | — | — | `src/pagefpt/web/client_routes.py:107` |
| GET | `/health/live` | health_public | — | — | `src/pagefpt/application.py:71` |
| GET | `/health/ready` | health_public | — | — | `src/pagefpt/application.py:75` |
| POST | `/internal/jobs/process` | server worker secret | — | ProcessInput | `src/pagefpt/modules/workflow/routes.py:48` |
| GET | `/internal/jobs/recover` | server worker secret | — | — | `src/pagefpt/modules/workflow/routes.py:63` |
| GET | `/internal/jobs/status` | server worker secret | — | — | `src/pagefpt/modules/workflow/routes.py:31` |
| GET | `/khuyen-mai` | public_html | — | — | `src/pagefpt/web/client_routes.py:71` |
| GET | `/r/{slug}` | public_html | — | — | `src/pagefpt/modules/link_analytics/routes.py:146` |
| HEAD | `/r/{slug}` | public_html | — | — | `src/pagefpt/modules/link_analytics/routes.py:146` |
| GET | `/robots.txt` | seo_public | — | — | `src/pagefpt/modules/content/routes.py:40` |
| GET | `/s/{slug}` | public_html | — | — | `src/pagefpt/modules/vouchers/routes.py:188` |
| GET | `/san-pham/{slug}` | public_html | — | — | `src/pagefpt/web/client_routes.py:51` |
| GET | `/sitemap.xml` | seo_public | — | — | `src/pagefpt/modules/content/routes.py:18` |

## Path, query và header parameters

Thiếu query không bắt buộc → dùng default server. Không gắn query chưa có trong bảng để giả có filter/search.

### GET /admin/leads/detail

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `id` | False | `{"type":"string","default":"","title":"Id"}` |

### GET /api/v1/admin/address-options

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `province_code` | False | `{"anyOf":[{"type":"integer","maximum":999999,"minimum":1},{"type":"null"}],"title":"Province Code"}` |

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

### GET /api/v1/admin/experiments/{id}/results

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

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

### GET /api/v1/admin/leads/{id}/billing

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/leads/{id}/billing

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

### GET /api/v1/admin/leads/{id}/payments

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### POST /api/v1/admin/leads/{id}/payments

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/leads/{id}/preferences

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/leads/{id}/profile

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/leads/{id}/profile

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

### GET /api/v1/admin/leads/{id}/voucher

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/voucher/reserve

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/leads/{id}/voucher/{action}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| path | `action` | True | `{"type":"string","title":"Action"}` |

### GET /api/v1/admin/link-performance/report

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `start` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"Start"}` |
| query | `end` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"End"}` |
| query | `platform` | False | `{"type":"string","maxLength":40,"default":"","title":"Platform"}` |
| query | `creator` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Creator"}` |
| query | `kind` | False | `{"enum":["","content","voucher"],"type":"string","default":"","title":"Kind"}` |
| query | `q` | False | `{"type":"string","maxLength":100,"default":"","title":"Q"}` |
| query | `order` | False | `{"enum":["title","platform","creator_name","created_at","clicks","forms","closed","installed","closed_rate","average_engagement_ms","ranking_score"],"type":"string","default":"created_at","title":"Order"}` |
| query | `direction` | False | `{"enum":["asc","desc"],"type":"string","default":"desc","title":"Direction"}` |
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":25,"title":"Limit"}` |
| query | `offset` | False | `{"type":"integer","maximum":1000000,"minimum":0,"default":0,"title":"Offset"}` |
| query | `link_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Link Id"}` |

### PUT /api/v1/admin/link-performance/{id}

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

### PUT /api/v1/admin/measurement/campaigns/{id}/mapping

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/campaigns/{id}/sync-apply

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/campaigns/{id}/sync-preview

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/measurement/campaigns/{id}/tracking

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/measurement/configs/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/configs/{id}/publish

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/configs/{id}/simulate

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/configs/{id}/validate

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### PUT /api/v1/admin/measurement/connections/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/connections/{id}/check

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/connections/{id}/credentials

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/connections/{id}/disable

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/connections/{id}/oauth/start

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/measurement/deliveries/{id}/retry

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/measurement/oauth/callback

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `state` | True | `{"type":"string","maxLength":8192,"title":"State"}` |
| query | `code` | True | `{"type":"string","maxLength":2048,"title":"Code"}` |

### POST /api/v1/admin/measurement/releases/{id}/restore

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/measurement/reports

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `start` | True | `{"type":"string","format":"date","title":"Start"}` |
| query | `end` | True | `{"type":"string","format":"date","title":"End"}` |

### POST /api/v1/admin/media/{id}/finalize

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/notifications

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":100,"minimum":1,"default":30,"title":"Limit"}` |

### POST /api/v1/admin/notifications/{id}/read

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

### PATCH /api/v1/admin/payments/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/payments/{id}/collect

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

### GET /api/v1/admin/prices/matrix

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

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
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

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

### GET /api/v1/admin/reports/analytics

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `start` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"Start"}` |
| query | `end` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"End"}` |
| query | `branch_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Branch Id"}` |
| query | `campaign` | False | `{"anyOf":[{"type":"string","maxLength":100},{"type":"null"}],"title":"Campaign"}` |

### GET /api/v1/admin/reports/summary

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `start` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"Start"}` |
| query | `end` | False | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}],"title":"End"}` |
| query | `branch_id` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Branch Id"}` |
| query | `campaign` | False | `{"anyOf":[{"type":"string","maxLength":100},{"type":"null"}],"title":"Campaign"}` |

### GET /api/v1/admin/staff

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `q` | False | `{"type":"string","maxLength":100,"default":"","title":"Q"}` |
| query | `offset` | False | `{"type":"integer","maximum":100000,"minimum":0,"default":0,"title":"Offset"}` |

### GET /api/v1/admin/vouchers

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `before` | False | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}],"title":"Before"}` |

### GET /api/v1/admin/vouchers/links/{slug}/qr

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

### DELETE /api/v1/admin/vouchers/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `expected_version` | True | `{"type":"integer","minimum":1,"title":"Expected Version"}` |

### PUT /api/v1/admin/vouchers/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/vouchers/{id}/links

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/vouchers/{id}/pause

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/admin/vouchers/{id}/publish

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/admin/workbench

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `limit` | False | `{"type":"integer","maximum":20,"minimum":1,"default":6,"title":"Limit"}` |

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

### DELETE /api/v1/auth/mfa/{id}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### POST /api/v1/auth/mfa/{id}/verify

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/experiments/{id}/variant

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |
| query | `session_token` | False | `{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Session Token"}` |

### POST /api/v1/experiments/{id}/variant

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `id` | True | `{"type":"string","format":"uuid","title":"Id"}` |

### GET /api/v1/landing/{slug}/activity

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

### POST /api/v1/leads

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| header | `Idempotency-Key` | False | `{"type":"string","default":"","title":"Idempotency-Key"}` |

### GET /api/v1/measurement/config

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `path` | False | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/","title":"Path"}` |
| query | `campaign` | False | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":"","title":"Campaign"}` |
| query | `platform` | False | `{"type":"string","maxLength":20,"pattern":"^(google\|meta\|facebook\|instagram)?$","default":"","title":"Platform"}` |

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

### GET /api/v1/vouchers/context

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| query | `code` | False | `{"anyOf":[{"type":"string","maxLength":40},{"type":"null"}],"title":"Code"}` |

### POST /api/v1/webhooks/leads/{provider}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `provider` | True | `{"enum":["google","meta","tiktok","crm"],"type":"string","title":"Provider"}` |

### GET /r/{slug}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

### GET /s/{slug}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

### GET /san-pham/{slug}

| Vị trí | Tên | Bắt buộc | Schema/giới hạn |
|---|---|---|---|
| path | `slug` | True | `{"type":"string","title":"Slug"}` |

## Tất cả request schemas và fields

`additionalProperties=false`: chỉ gửi whitelist fields, không spread DTO response vào request. Null khác bỏ field. Validator Python về thời gian/fit/redirect/CSV không thể hiện hết bằng JSON Schema; xem prompt và source.

### ActionInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `reason` | Có | `{"type":"string","maxLength":500,"minLength":3}` |
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

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

### ApplyUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `preview_token` | Có | `{"type":"string","maxLength":8192}` |
| `confirm` | Có | `{"type":"boolean","const":true}` |

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
| `click_id_type` | Không | `{"type":"string","pattern":"^(\|gclid\|gbraid\|wbraid\|fbclid)$","default":""}` |
| `utm_content` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_.-]*$","default":""}` |
| `utm_term` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_.-]*$","default":""}` |
| `campaign_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `adgroup_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `adset_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `ad_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `landing_path` | Không | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/"}` |
| `ga_client_id` | Không | `{"type":"string","pattern":"^(\|[0-9]{1,20}\\.[0-9]{1,20})$","default":""}` |
| `fbp` | Không | `{"type":"string","maxLength":300,"pattern":"^(\|fb\\.[0-9]+\\.[0-9]{10,16}\\.[a-zA-Z0-9_-]{1,256})$","default":""}` |
| `fbc` | Không | `{"type":"string","maxLength":300,"pattern":"^(\|fb\\.[0-9]+\\.[0-9]{10,16}\\.[a-zA-Z0-9_-]{1,256})$","default":""}` |

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
| `connection_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `external_campaign_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `landing_path` | Không | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/"}` |
| `content_note` | Không | `{"type":"string","maxLength":1000,"default":""}` |

### CampaignMapping

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `connection_id` | Có | `{"type":"string","format":"uuid"}` |
| `external_campaign_id` | Có | `{"type":"string","maxLength":40,"pattern":"^[0-9]+$"}` |
| `landing_path` | Không | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/"}` |
| `content_note` | Không | `{"type":"string","maxLength":1000,"default":""}` |

### CampaignPrice

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `billing_months` | Có | `{"type":"integer","enum":[1,6,12]}` |
| `monthly_vnd` | Có | `{"type":"integer","maximum":1000000000.0,"minimum":0.0}` |

### CardLabels

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `badge` | Không | `{"type":"string","maxLength":40,"default":"Gói đang cung cấp"}` |
| `speed` | Không | `{"type":"string","maxLength":24,"minLength":1,"default":"Tốc độ"}` |
| `offers` | Không | `{"type":"string","maxLength":40,"minLength":1,"default":"Ưu đãi đi kèm"}` |
| `equipment` | Không | `{"type":"string","maxLength":40,"minLength":1,"default":"Thiết bị"}` |
| `register` | Không | `{"type":"string","maxLength":32,"minLength":1,"default":"Đăng ký gói"}` |
| `details` | Không | `{"type":"string","maxLength":32,"minLength":1,"default":"Chi tiết gói"}` |

### ChallengeInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |
| `phone` | Có | `{"type":"string","maxLength":40}` |
| `provider_token` | Có | `{"type":"string","maxLength":2048,"minLength":1}` |

### Code

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `code` | Có | `{"type":"string","pattern":"^[0-9]{6}$"}` |

### ConfigInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `scope` | Không | `{"type":"string","enum":["global","domain","landing","campaign"],"default":"global"}` |
| `scope_key` | Không | `{"type":"string","maxLength":150,"default":"*"}` |
| `environment` | Có | `{"type":"string","enum":["test","staging","production"]}` |
| `policy` | Không | `{"$ref":"#/components/schemas/MeasurementPolicy"}` |
| `rules` | Không | `{"anyOf":[{"items":{"$ref":"#/components/schemas/ConversionRule"},"type":"array","maxItems":20},{"type":"null"}]}` |

### ConfigUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `scope` | Không | `{"type":"string","enum":["global","domain","landing","campaign"],"default":"global"}` |
| `scope_key` | Không | `{"type":"string","maxLength":150,"default":"*"}` |
| `environment` | Có | `{"type":"string","enum":["test","staging","production"]}` |
| `policy` | Không | `{"$ref":"#/components/schemas/MeasurementPolicy"}` |
| `rules` | Không | `{"anyOf":[{"items":{"$ref":"#/components/schemas/ConversionRule"},"type":"array","maxItems":20},{"type":"null"}]}` |
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### ConfirmQuote

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `quote_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |

### ConnectionInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `provider` | Có | `{"type":"string","enum":["ga4","google_ads","meta"]}` |
| `environment` | Có | `{"type":"string","enum":["test","staging","production"]}` |
| `enabled` | Không | `{"type":"boolean","default":false}` |
| `settings` | Có | `{"$ref":"#/components/schemas/ConnectionSettings"}` |

### ConnectionSettings

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `measurement_id` | Không | `{"type":"string","pattern":"^(G-[A-Z0-9]{3,30})?$","default":""}` |
| `property_id` | Không | `{"type":"string","pattern":"^[0-9]{0,30}$","default":""}` |
| `stream_id` | Không | `{"type":"string","pattern":"^[0-9]{0,30}$","default":""}` |
| `tag_id` | Không | `{"type":"string","pattern":"^(AW-[0-9]{3,30})?$","default":""}` |
| `customer_id` | Không | `{"type":"string","pattern":"^[0-9]{0,30}$","default":""}` |
| `login_customer_id` | Không | `{"type":"string","pattern":"^[0-9]{0,30}$","default":""}` |
| `pixel_id` | Không | `{"type":"string","pattern":"^[0-9]{0,30}$","default":""}` |
| `ad_account_id` | Không | `{"type":"string","pattern":"^[0-9]{0,30}$","default":""}` |
| `api_version` | Không | `{"type":"string","pattern":"^(v[0-9]{1,2}\\.0)?$","default":""}` |
| `ads_api_version` | Không | `{"type":"string","pattern":"^(v[0-9]{1,2})?$","default":""}` |
| `currency` | Không | `{"type":"string","enum":["VND","USD"],"default":"VND"}` |
| `browser_enabled` | Không | `{"type":"boolean","default":false}` |
| `server_enabled` | Không | `{"type":"boolean","default":false}` |
| `sync_interval_minutes` | Không | `{"type":"integer","maximum":1440.0,"minimum":0.0,"default":0}` |
| `sync_lookback_days` | Không | `{"type":"integer","maximum":31.0,"minimum":1.0,"default":3}` |
| `test_event_code` | Không | `{"type":"string","maxLength":50,"pattern":"^[a-zA-Z0-9_-]*$","default":""}` |

### ConnectionUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `provider` | Có | `{"type":"string","enum":["ga4","google_ads","meta"]}` |
| `environment` | Có | `{"type":"string","enum":["test","staging","production"]}` |
| `enabled` | Không | `{"type":"boolean","default":false}` |
| `settings` | Có | `{"$ref":"#/components/schemas/ConnectionSettings"}` |
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### ConsentInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `analytics` | Không | `{"type":"boolean","default":false}` |
| `marketing` | Không | `{"type":"boolean","default":false}` |
| `advertising` | Không | `{"type":"boolean","default":false}` |
| `personalization` | Không | `{"type":"boolean","default":false}` |
| `consent_version` | Có | `{"type":"string","maxLength":50,"minLength":1}` |

### ConsentUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `analytics` | Không | `{"type":"boolean","default":false}` |
| `marketing` | Không | `{"type":"boolean","default":false}` |
| `advertising` | Không | `{"type":"boolean","default":false}` |
| `personalization` | Không | `{"type":"boolean","default":false}` |
| `consent_version` | Có | `{"type":"string","maxLength":50,"minLength":1}` |
| `session_token` | Có | `{"type":"string","maxLength":8192}` |

### ContextInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `code` | Có | `{"type":"string","maxLength":40,"minLength":3,"pattern":"^[A-Z0-9_-]+$"}` |

### ConversionRule

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `id` | Không | `{"type":"string","format":"uuid"}` |
| `event` | Có | `{"type":"string","enum":["lead","qualified","closed","installed"]}` |
| `connection_id` | Có | `{"type":"string","format":"uuid"}` |
| `provider_event` | Có | `{"type":"string","maxLength":40,"minLength":1,"pattern":"^[A-Za-z][A-Za-z0-9_]*$"}` |
| `conversion_label` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-zA-Z0-9_-]*$","default":""}` |
| `conversion_action` | Không | `{"type":"string","maxLength":100,"pattern":"^(customers/[0-9]+/conversionActions/[0-9]+)?$","default":""}` |
| `primary` | Không | `{"type":"boolean","default":false}` |
| `route` | Không | `{"type":"string","enum":["browser","server","ga4_import"],"default":"browser"}` |
| `value_vnd` | Không | `{"type":"integer","maximum":1000000000.0,"minimum":0.0,"default":0}` |

### CostApply

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `connection_id` | Có | `{"type":"string","format":"uuid"}` |
| `rows` | Có | `{"items":{"$ref":"#/components/schemas/CostRow"},"type":"array","maxItems":50,"minItems":1}` |
| `preview_token` | Có | `{"type":"string","maxLength":8192}` |

### CostImport

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `connection_id` | Có | `{"type":"string","format":"uuid"}` |
| `rows` | Có | `{"items":{"$ref":"#/components/schemas/CostRow"},"type":"array","maxItems":50,"minItems":1}` |

### CostInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `campaign_id` | Có | `{"type":"string","format":"uuid"}` |
| `day` | Có | `{"type":"string","format":"date"}` |
| `cost_vnd` | Có | `{"type":"integer","maximum":100000000000.0,"minimum":0.0}` |

### CostRow

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `day` | Có | `{"type":"string","format":"date"}` |
| `campaign_id` | Có | `{"type":"string","maxLength":40,"minLength":1,"pattern":"^[0-9]+$"}` |
| `adgroup_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `ad_id` | Không | `{"type":"string","maxLength":40,"pattern":"^[0-9]*$","default":""}` |
| `cost_vnd` | Có | `{"type":"integer","maximum":100000000000.0,"minimum":0.0}` |
| `clicks` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":0.0},{"type":"null"}]}` |
| `impressions` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":0.0},{"type":"null"}]}` |

### CredentialsInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `values` | Có | `{"additionalProperties":{"type":"string","format":"password","writeOnly":true},"type":"object","maxProperties":6,"minProperties":1}` |
| `expires_at` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |

### DealSave

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":0.0}` |
| `plan_id` | Có | `{"type":"string","format":"uuid"}` |
| `billing_months` | Có | `{"type":"integer"}` |
| `notes` | Không | `{"anyOf":[{"type":"string","maxLength":2000},{"type":"null"}]}` |

### DisplayPatch

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `navigation_items` | Không | `{"anyOf":[{"items":{"$ref":"#/components/schemas/NavigationItem"},"type":"array","maxItems":12},{"type":"null"}]}` |
| `expected_version` | Có | `{"type":"integer","minimum":0.0}` |
| `contact_phone` | Không | `{"anyOf":[{"type":"string","maxLength":32},{"type":"null"}]}` |
| `fpt_anim` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `fpt_anim_style` | Không | `{"anyOf":[{"type":"string","enum":["wave","bounce","glow"]},{"type":"null"}]}` |
| `runline_enabled` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `runline_speed` | Không | `{"anyOf":[{"type":"string","enum":["slow","normal","fast"]},{"type":"null"}]}` |
| `runline_text` | Không | `{"anyOf":[{"type":"string","maxLength":2000},{"type":"null"}]}` |
| `banner_zones` | Không | `{"anyOf":[{"additionalProperties":{"type":"boolean"},"type":"object"},{"type":"null"}]}` |
| `lenis_scroll` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `tilt_parallax` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `hero_experiment_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `promo_slides` | Không | `{"anyOf":[{"items":{"$ref":"#/components/schemas/PromoSlideInput"},"type":"array","maxItems":12},{"type":"null"}]}` |
| `plan_categories` | Không | `{"anyOf":[{"items":{"$ref":"#/components/schemas/PlanCategory"},"type":"array","maxItems":3,"minItems":3},{"type":"null"}]}` |

### EngagementInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `visit_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |
| `session_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |
| `page_id` | Có | `{"type":"string","format":"uuid"}` |
| `sequence` | Có | `{"type":"integer","maximum":100000.0,"minimum":1.0}` |
| `total_ms` | Có | `{"type":"integer","maximum":28800000.0,"minimum":0.0}` |

### Enroll

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":60,"minLength":1}` |

### EventBatch

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |
| `events` | Có | `{"items":{"$ref":"#/components/schemas/EventInput"},"type":"array","maxItems":20}` |

### EventInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `id` | Có | `{"type":"string","format":"uuid"}` |
| `name` | Có | `{"type":"string","enum":["view_plan","select_plan","select_region","compare_plans","start_form","view_cost","click_call","click_zalo","return_visit","experiment_exposure","view_landing"]}` |
| `plan_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `experiment_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `variant` | Không | `{"anyOf":[{"type":"string","maxLength":50},{"type":"null"}]}` |
| `experiment_version` | Không | `{"anyOf":[{"type":"integer","minimum":1.0},{"type":"null"}]}` |
| `landing_slug` | Không | `{"anyOf":[{"type":"string","maxLength":100,"minLength":1,"pattern":"^[a-z0-9-]+$"},{"type":"null"}]}` |

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

### FooterGroup

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `title` | Có | `{"type":"string","maxLength":60,"minLength":1}` |
| `links` | Không | `{"items":{"$ref":"#/components/schemas/NavigationLink"},"type":"array","maxItems":12}` |

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

### InventoryInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `product_id` | Có | `{"type":"string","format":"uuid"}` |
| `stock` | Có | `{"type":"integer","maximum":1000000.0,"minimum":0.0}` |
| `cost_vnd` | Có | `{"type":"integer","maximum":1000000000.0,"minimum":0.0}` |
| `expected_version` | Không | `{"type":"integer","minimum":0.0,"default":0}` |

### LandingCampaign

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `enabled` | Không | `{"type":"boolean","default":false}` |
| `title` | Không | `{"type":"string","maxLength":100,"default":"Ưu đãi đăng ký"}` |
| `start` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |
| `end` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |
| `gift_label` | Không | `{"type":"string","maxLength":160,"default":""}` |
| `conditions` | Không | `{"type":"string","maxLength":1200,"default":""}` |
| `stock_total` | Không | `{"anyOf":[{"type":"integer","maximum":1000000.0,"minimum":1.0},{"type":"null"}]}` |
| `stock_remaining` | Không | `{"anyOf":[{"type":"integer","maximum":1000000.0,"minimum":0.0},{"type":"null"}]}` |
| `show_countdown` | Không | `{"type":"boolean","default":true}` |
| `show_activity` | Không | `{"type":"boolean","default":false}` |
| `inherit_promotions` | Không | `{"type":"boolean","default":false}` |

### LandingFAQ

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `question` | Có | `{"type":"string","maxLength":180,"minLength":1}` |
| `answer` | Có | `{"type":"string","maxLength":1200,"minLength":1}` |

### LandingFeature

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `title` | Có | `{"type":"string","maxLength":80,"minLength":1}` |
| `text` | Không | `{"type":"string","maxLength":240,"default":""}` |
| `icon` | Không | `{"type":"string","enum":["speed","wifi","support","install","play","camera","users","building","award","shield"],"default":"wifi"}` |

### LandingReview

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":80,"minLength":1}` |
| `location` | Không | `{"type":"string","maxLength":100,"default":""}` |
| `quote` | Có | `{"type":"string","maxLength":500,"minLength":1}` |
| `rating` | Không | `{"type":"integer","maximum":5.0,"minimum":1.0,"default":5}` |
| `avatar_image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### LandingSettings

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `campaign` | Không | `{"$ref":"#/components/schemas/LandingCampaign"}` |
| `contact_phone` | Không | `{"type":"string","maxLength":24,"default":""}` |
| `zalo_url` | Không | `{"type":"string","maxLength":300,"default":""}` |
| `messenger_url` | Không | `{"type":"string","maxLength":300,"default":""}` |
| `contact_label` | Không | `{"type":"string","maxLength":40,"minLength":1,"default":"Liên hệ tư vấn"}` |
| `contact_icon` | Không | `{"type":"string","enum":["support","phone","message"],"default":"support"}` |
| `show_contact_popup` | Không | `{"type":"boolean","default":true}` |
| `footer_groups` | Không | `{"items":{"$ref":"#/components/schemas/FooterGroup"},"type":"array","maxItems":6}` |
| `hero_eyebrow` | Không | `{"type":"string","maxLength":100,"default":"INTERNET CÁP QUANG FPT TELECOM"}` |
| `hero_title` | Không | `{"type":"string","maxLength":160,"minLength":1,"default":"Đăng Ký Lắp Đặt Internet"}` |
| `hero_highlight` | Không | `{"type":"string","maxLength":100,"default":"Tốc Độ Cao FPT"}` |
| `hero_subtitle` | Không | `{"type":"string","maxLength":240,"default":"Kết nối theo nhu cầu – Tư vấn gói phù hợp"}` |
| `hero_image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `hero_mobile_image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `promo_image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `closing_image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `logo_image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `form_title` | Không | `{"type":"string","maxLength":100,"default":"NHẬN TƯ VẤN GÓI INTERNET FPT"}` |
| `form_subtitle` | Không | `{"type":"string","maxLength":160,"default":"Miễn phí tư vấn – Gói phù hợp – Giá rõ ràng"}` |
| `form_cta` | Không | `{"type":"string","maxLength":48,"minLength":1,"default":"Nhận tư vấn ngay"}` |
| `form_privacy` | Không | `{"type":"string","maxLength":180,"default":"Thông tin được dùng để liên hệ tư vấn"}` |
| `cta_label` | Không | `{"type":"string","maxLength":48,"minLength":1,"default":"Đăng ký ngay"}` |
| `plans_title` | Không | `{"type":"string","maxLength":180,"default":"ĐA DẠNG GÓI CƯỚC – PHÙ HỢP MỌI NHU CẦU"}` |
| `plans_subtitle` | Không | `{"type":"string","maxLength":240,"default":"Internet, truyền hình và camera – Chọn khu vực để xem giá áp dụng"}` |
| `compare_title` | Không | `{"type":"string","maxLength":120,"default":"SO SÁNH NHANH CÁC GÓI CƯỚC"}` |
| `promo_title` | Không | `{"type":"string","maxLength":100,"default":"ƯU ĐÃI ĐĂNG KÝ"}` |
| `promo_subtitle` | Không | `{"type":"string","maxLength":180,"default":"Được xác nhận theo gói, khu vực và thời gian"}` |
| `benefits_title` | Không | `{"type":"string","maxLength":160,"default":"VÌ SAO NÊN CHỌN INTERNET FPT TELECOM?"}` |
| `stats_title` | Không | `{"type":"string","maxLength":160,"default":"ĐỒNG HÀNH CÙNG KHÁCH HÀNG"}` |
| `reviews_title` | Không | `{"type":"string","maxLength":160,"default":"KHÁCH HÀNG NÓI GÌ VỀ DỊCH VỤ?"}` |
| `faq_title` | Không | `{"type":"string","maxLength":160,"default":"CÂU HỎI THƯỜNG GẶP"}` |
| `closing_title` | Không | `{"type":"string","maxLength":160,"default":"ĐĂNG KÝ ĐỂ ĐƯỢC TƯ VẤN GÓI PHÙ HỢP"}` |
| `closing_subtitle` | Không | `{"type":"string","maxLength":240,"default":"Chọn gói, kiểm tra địa bàn và xác nhận lịch lắp đặt"}` |
| `footer_text` | Không | `{"type":"string","maxLength":800,"default":"Tư vấn Internet, truyền hình và camera theo nhu cầu và địa bàn lắp đặt."}` |
| `plan_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":24}` |
| `plan_presentations` | Không | `{"items":{"$ref":"#/components/schemas/PlanPresentation"},"type":"array","maxItems":24}` |
| `billing_months` | Không | `{"type":"integer","enum":[1,6,12],"default":6}` |
| `desktop_columns` | Không | `{"type":"integer","enum":[0,3,4,5,6],"default":0}` |
| `hero_features` | Không | `{"items":{"$ref":"#/components/schemas/LandingFeature"},"type":"array","maxItems":6}` |
| `benefits` | Không | `{"items":{"$ref":"#/components/schemas/LandingFeature"},"type":"array","maxItems":8}` |
| `promo_items` | Không | `{"items":{"$ref":"#/components/schemas/LandingFeature"},"type":"array","maxItems":4}` |
| `stats` | Không | `{"items":{"$ref":"#/components/schemas/LandingStat"},"type":"array","maxItems":6}` |
| `reviews` | Không | `{"items":{"$ref":"#/components/schemas/LandingReview"},"type":"array","maxItems":12}` |
| `faqs` | Không | `{"items":{"$ref":"#/components/schemas/LandingFAQ"},"type":"array","maxItems":16}` |
| `nav_items` | Không | `{"items":{"$ref":"#/components/schemas/NavigationLink"},"type":"array","maxItems":8}` |
| `footer_links` | Không | `{"items":{"$ref":"#/components/schemas/NavigationLink"},"type":"array","maxItems":12}` |
| `show_comparison` | Không | `{"type":"boolean","default":true}` |
| `show_promo` | Không | `{"type":"boolean","default":true}` |
| `show_benefits` | Không | `{"type":"boolean","default":true}` |
| `show_stats` | Không | `{"type":"boolean","default":true}` |
| `show_reviews` | Không | `{"type":"boolean","default":true}` |
| `show_faq` | Không | `{"type":"boolean","default":true}` |
| `show_closing` | Không | `{"type":"boolean","default":true}` |
| `theme_preset` | Không | `{"type":"string","enum":["fpt_standard","blue_trust","orange_vibrant","modern_dark","emerald_fresh"],"default":"fpt_standard"}` |
| `theme_radius` | Không | `{"type":"string","enum":["rounded","soft","pill"],"default":"rounded"}` |
| `hero_layout` | Không | `{"type":"string","enum":["split","centered","minimal"],"default":"split"}` |
| `plans_layout` | Không | `{"type":"string","enum":["grid","carousel","list"],"default":"grid"}` |
| `section_order` | Không | `{"items":{"type":"string","enum":["hero","plans","campaign","compare","promo","benefits","stats","reviews","faq","closing"]},"type":"array","maxItems":10}` |

### LandingStat

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `value` | Có | `{"type":"string","maxLength":32,"minLength":1}` |
| `label` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `icon` | Không | `{"type":"string","enum":["speed","wifi","support","install","play","camera","users","building","award","shield"],"default":"users"}` |

### LeadRequest

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `measurement_path` | Không | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/"}` |
| `link_source_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |
| `link_visit_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |
| `voucher_code` | Không | `{"anyOf":[{"type":"string","maxLength":40,"pattern":"^(?:[A-Z0-9_-]{3,40})?$"},{"type":"null"}]}` |
| `voucher_link` | Không | `{"anyOf":[{"type":"string","maxLength":50,"pattern":"^[a-z0-9-]+$"},{"type":"null"}]}` |
| `phone` | Có | `{"type":"string","maxLength":40,"minLength":5}` |
| `name` | Không | `{"type":"string","maxLength":150,"default":""}` |
| `service_ids` | Không | `{"items":{"type":"string","enum":["internet","combo","camera","business","play"]},"type":"array","maxItems":5}` |
| `plan_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `accessory_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":20}` |
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

### LinkUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `title` | Có | `{"type":"string","maxLength":160,"minLength":1}` |
| `slug` | Có | `{"type":"string","maxLength":50,"minLength":3,"pattern":"^[a-z0-9-]+$"}` |
| `target` | Không | `{"type":"string","maxLength":120,"pattern":"^/(?:[a-z0-9-]+(?:/[a-z0-9-]+)?)?$","default":"/"}` |
| `platform` | Không | `{"type":"string","maxLength":40,"pattern":"^[a-zA-Z0-9_-]+$","default":"other"}` |
| `utm_medium` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-z0-9_.-]*$","default":"social"}` |
| `utm_campaign` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-z0-9_.-]*$","default":""}` |
| `utm_content` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-z0-9_.-]*$","default":""}` |
| `content_note` | Không | `{"type":"string","maxLength":2000,"default":""}` |
| `active` | Không | `{"type":"boolean","default":true}` |
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### LocationHint

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `status` | Không | `{"type":"string","enum":["unknown","estimated"],"default":"unknown"}` |
| `source` | Không | `{"anyOf":[{"type":"string","enum":["vercel","geoip"]},{"type":"null"}]}` |
| `country` | Không | `{"anyOf":[{"type":"string"},{"type":"null"}]}` |
| `province_name` | Không | `{"anyOf":[{"type":"string"},{"type":"null"}]}` |
| `subdivision_code` | Không | `{"anyOf":[{"type":"string"},{"type":"null"}]}` |
| `city` | Không | `{"anyOf":[{"type":"string"},{"type":"null"}]}` |
| `accuracy_radius_km` | Không | `{"anyOf":[{"type":"integer"},{"type":"null"}]}` |
| `ward_id` | Không | `{"type":"null"}` |
| `address_confirmed` | Không | `{"type":"boolean","const":false,"default":false}` |

### Login

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |
| `password` | Có | `{"type":"string","maxLength":1024,"minLength":1}` |
| `otp` | Không | `{"type":"string","pattern":"^([0-9]{6})?$","default":""}` |
| `factor_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### MatrixPriceInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `rows` | Có | `{"items":{"$ref":"#/components/schemas/MatrixPriceRow"},"type":"array","maxItems":500,"minItems":1}` |
| `publish` | Không | `{"type":"boolean","default":false}` |

### MatrixPriceRow

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `price` | Có | `{"$ref":"#/components/schemas/PriceInput"}` |
| `id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `expected_version` | Không | `{"anyOf":[{"type":"integer","minimum":1.0},{"type":"null"}]}` |

### MeasurementPolicy

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `ga4_connection_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `ga4_enabled` | Không | `{"anyOf":[{"type":"boolean"},{"type":"null"}]}` |
| `consent_mode` | Không | `{"anyOf":[{"type":"string","enum":["basic","advanced"]},{"type":"null"}]}` |
| `consent_title` | Không | `{"anyOf":[{"type":"string","maxLength":80,"minLength":1},{"type":"null"}]}` |
| `consent_description` | Không | `{"anyOf":[{"type":"string","maxLength":400,"minLength":1},{"type":"null"}]}` |
| `event_enabled` | Không | `{"anyOf":[{"items":{"type":"string"},"type":"array","maxItems":30},{"type":"null"}]}` |
| `attribution_window_days` | Không | `{"anyOf":[{"type":"integer","maximum":90.0,"minimum":1.0},{"type":"null"}]}` |
| `minimum_samples` | Không | `{"anyOf":[{"type":"integer","maximum":10000.0,"minimum":30.0},{"type":"null"}]}` |
| `maturity_days` | Không | `{"anyOf":[{"type":"integer","maximum":90.0,"minimum":1.0},{"type":"null"}]}` |
| `refresh_seconds` | Không | `{"anyOf":[{"type":"integer","maximum":300.0,"minimum":30.0},{"type":"null"}]}` |
| `retention_days` | Không | `{"anyOf":[{"type":"integer","maximum":90.0,"minimum":1.0},{"type":"null"}]}` |

### MembershipInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Không | `{"anyOf":[{"type":"integer","minimum":1.0},{"type":"null"}]}` |
| `display_name` | Không | `{"type":"string","maxLength":100,"default":""}` |
| `user_id` | Có | `{"type":"string","format":"uuid"}` |
| `branch_id` | Có | `{"type":"string","format":"uuid"}` |
| `permissions` | Có | `{"items":{"type":"string","enum":["*","identity.manage","catalog.write","pricing.write","pricing.publish","content.write","content.publish","lead.read","lead.write","lead.all","lead.assign","lead.pii","intelligence.write","marketing.write","measurement.read","measurement.configure","measurement.publish","measurement.credentials","measurement.replay","measurement.external_write","care.write","care.approve","report.read","governance.write","governance.delete","governance.export","governance.audit","workflow.manage"]},"type":"array","maxItems":30}` |
| `capacity` | Không | `{"type":"integer","maximum":1000.0,"minimum":1.0,"default":20}` |
| `active` | Không | `{"type":"boolean","default":true}` |
| `shift` | Không | `{"$ref":"#/components/schemas/Shift"}` |

### NavigationItem

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `label` | Có | `{"type":"string","maxLength":40,"minLength":1}` |
| `href` | Có | `{"type":"string","maxLength":300,"minLength":1}` |
| `id` | Có | `{"type":"string","maxLength":40,"minLength":1,"pattern":"^[a-z0-9-]+$"}` |
| `preset` | Không | `{"type":"string","enum":["internet","play","camera","smart-home","speedtest","promotions","custom"],"default":"custom"}` |
| `enabled` | Không | `{"type":"boolean","default":true}` |
| `children` | Không | `{"items":{"$ref":"#/components/schemas/NavigationLink"},"type":"array","maxItems":12}` |

### NavigationLink

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `label` | Có | `{"type":"string","maxLength":40,"minLength":1}` |
| `href` | Có | `{"type":"string","maxLength":300,"minLength":1}` |

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
| `title` | Có | `{"maxLength":200,"minLength":1,"type":"string"}` |
| `slug` | Có | `{"maxLength":100,"minLength":1,"pattern":"^[a-z0-9-]+$","type":"string"}` |
| `blocks` | Có | `{"items":{"$ref":"#/$defs/Block"},"maxItems":100,"type":"array"}` |
| `description` | Không | `{"default":"","maxLength":300,"type":"string"}` |
| `canonical_path` | Không | `{"anyOf":[{"maxLength":200,"pattern":"^/[a-z0-9/-]*$","type":"string"},{"type":"null"}],"default":null}` |
| `template` | Không | `{"default":"blocks","enum":["blocks","telecom"],"type":"string"}` |
| `landing` | Không | `{"anyOf":[{"$ref":"#/$defs/LandingSettings"},{"type":"null"}],"default":null}` |

### PasswordChange

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `current_password` | Có | `{"type":"string","maxLength":1024,"minLength":1}` |
| `password` | Có | `{"type":"string","maxLength":128,"minLength":12}` |
| `otp` | Không | `{"type":"string","pattern":"^([0-9]{6})?$","default":""}` |
| `factor_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### PaymentCollect

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `create_next` | Không | `{"type":"boolean","default":false}` |

### PaymentCreate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `payment_id` | Có | `{"type":"string","format":"uuid"}` |
| `due_date` | Có | `{"type":"string","format":"date"}` |
| `amount_vnd` | Có | `{"type":"integer","maximum":1000000000.0,"minimum":1.0}` |
| `notes` | Không | `{"type":"string","maxLength":2000,"default":""}` |

### PaymentUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `status` | Không | `{"type":"string","enum":["pending","cancelled"],"default":"pending"}` |
| `due_date` | Không | `{"anyOf":[{"type":"string","format":"date"},{"type":"null"}]}` |
| `amount_vnd` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":1.0},{"type":"null"}]}` |
| `notes` | Không | `{"anyOf":[{"type":"string","maxLength":2000},{"type":"null"}]}` |

### PlanCategory

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":40,"minLength":1}` |
| `short_name` | Có | `{"type":"string","maxLength":12,"minLength":1}` |
| `plan_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":100}` |
| `services` | Không | `{"items":{"type":"string","enum":["internet","business","combo","play","camera"]},"type":"array","maxItems":5}` |
| `all_plans` | Không | `{"type":"boolean","default":false}` |

### PlanInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `name` | Có | `{"type":"string","maxLength":200,"minLength":1}` |
| `service` | Có | `{"type":"string","enum":["internet","combo","camera","business","play"]}` |
| `code` | Có | `{"type":"string","maxLength":60,"minLength":1,"pattern":"^[a-z0-9-]+$"}` |
| `description` | Không | `{"type":"string","maxLength":4000,"default":""}` |
| `card_labels` | Không | `{"$ref":"#/components/schemas/CardLabels"}` |
| `speed_mbps` | Không | `{"anyOf":[{"type":"integer","maximum":100000.0,"minimum":1.0},{"type":"null"}]}` |
| `upload_speed_mbps` | Không | `{"anyOf":[{"type":"integer","maximum":100000.0,"minimum":1.0},{"type":"null"}]}` |
| `equipment` | Không | `{"items":{"type":"string"},"type":"array","maxItems":20}` |
| `applicable_region_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":500}` |
| `image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `image_alt` | Không | `{"type":"string","maxLength":200,"default":""}` |
| `sort_order` | Không | `{"type":"integer","maximum":9999.0,"minimum":0.0,"default":0}` |

### PlanPresentation

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `plan_id` | Có | `{"type":"string","format":"uuid"}` |
| `subtitle` | Không | `{"type":"string","maxLength":100,"default":""}` |
| `badge` | Không | `{"type":"string","maxLength":40,"default":""}` |
| `accent` | Không | `{"type":"string","enum":["blue","orange"],"default":"blue"}` |
| `features` | Không | `{"items":{"type":"string"},"type":"array","maxItems":8}` |
| `card_labels` | Không | `{"additionalProperties":{"type":"string"},"propertyNames":{"enum":["badge","speed","offers","equipment","register","details"]},"type":"object"}` |
| `campaign_prices` | Không | `{"items":{"$ref":"#/components/schemas/CampaignPrice"},"type":"array","maxItems":3}` |

### PlanReorderInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `plan_ids` | Có | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":100,"minItems":1}` |

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
| `monthly_coefficient` | Không | `{"anyOf":[{"type":"number","maximum":100.0,"minimum":0.0},{"type":"string","pattern":"^(?!^[-+.]*$)[+-]?0*\\d*\\.?\\d{0,4}0*$"}],"default":"1"}` |
| `setup_vnd` | Không | `{"type":"integer","maximum":1000000000.0,"minimum":0.0,"default":0}` |
| `equipment_vnd` | Không | `{"type":"integer","maximum":1000000000.0,"minimum":0.0,"default":0}` |
| `display_monthly_vnd` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":0.0},{"type":"null"}]}` |
| `equipment` | Không | `{"anyOf":[{"items":{"type":"string","maxLength":200,"minLength":1},"type":"array","maxItems":20},{"type":"null"}]}` |
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
| `price_vnd` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":0.0},{"type":"null"}]}` |
| `original_price_vnd` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":0.0},{"type":"null"}]}` |
| `offer_label` | Không | `{"type":"string","maxLength":200,"default":""}` |
| `billing_mode` | Không | `{"type":"string","enum":["one_time","monthly"],"default":"one_time"}` |
| `image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `image_alt` | Không | `{"type":"string","maxLength":200,"default":""}` |

### ProfileInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `name` | Không | `{"type":"string","maxLength":150,"default":""}` |
| `installation_address` | Có | `{"type":"string","maxLength":500,"minLength":1}` |
| `province_code` | Có | `{"type":"integer","maximum":999999.0,"minimum":1.0}` |
| `ward_code` | Có | `{"type":"integer","maximum":999999.0,"minimum":1.0}` |
| `plan_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `accessory_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":20}` |

### PromoSlideInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `title` | Có | `{"type":"string","maxLength":80,"minLength":1}` |
| `description` | Không | `{"type":"string","maxLength":160,"default":""}` |
| `image_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `image_alt` | Không | `{"type":"string","maxLength":120,"default":""}` |
| `cta_label` | Không | `{"type":"string","maxLength":24,"minLength":1,"default":"Nhận tư vấn"}` |
| `plan_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `href` | Không | `{"type":"string","maxLength":300,"default":""}` |
| `video_url` | Không | `{"type":"string","maxLength":300,"default":""}` |
| `enabled` | Không | `{"type":"boolean","default":true}` |
| `start` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |
| `end` | Không | `{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}` |

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
| `voucher_code` | Không | `{"anyOf":[{"type":"string","maxLength":40,"pattern":"^(?:[A-Z0-9_-]{3,40})?$"},{"type":"null"}]}` |
| `landing_slug` | Không | `{"anyOf":[{"type":"string","maxLength":100,"minLength":1,"pattern":"^[a-z0-9-]+$"},{"type":"null"}]}` |
| `plan_id` | Có | `{"type":"string","format":"uuid"}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `billing_months` | Không | `{"type":"integer","maximum":36.0,"minimum":1.0,"default":6}` |
| `accessory_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":20}` |

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

### RecoveryCode

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |
| `otp` | Có | `{"type":"string","pattern":"^[0-9]{6}$"}` |
| `challenge_id` | Có | `{"type":"string","format":"uuid"}` |

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

### ReserveInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `code` | Có | `{"type":"string","maxLength":40,"minLength":3,"pattern":"^[A-Z0-9_-]+$"}` |
| `billing_months` | Không | `{"type":"integer","enum":[1,6,12],"default":6}` |

### ResetPassword

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |
| `otp` | Có | `{"type":"string","pattern":"^[0-9]{6}$"}` |
| `challenge_id` | Có | `{"type":"string","format":"uuid"}` |
| `password` | Có | `{"type":"string","maxLength":1024,"minLength":8}` |
| `totp` | Không | `{"type":"string","pattern":"^([0-9]{6})?$","default":""}` |
| `totp_factor_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### RevokeInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `visit_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |

### Rule

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `key` | Có | `{"type":"string","maxLength":50,"minLength":1,"pattern":"^[a-zA-Z0-9_-]+$"}` |
| `region_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `region_name` | Không | `{"type":"string","maxLength":200,"default":"Toàn quốc"}` |
| `discount_kind` | Không | `{"type":"string","enum":["fixed","percent"],"default":"fixed"}` |
| `amount` | Không | `{"type":"integer","maximum":1000000000.0,"minimum":0.0,"default":0}` |
| `basis` | Không | `{"type":"string","enum":["initial","monthly","setup","equipment"],"default":"initial"}` |
| `cap_vnd` | Không | `{"anyOf":[{"type":"integer","maximum":1000000000.0,"minimum":0.0},{"type":"null"}]}` |
| `quota` | Không | `{"anyOf":[{"type":"integer","maximum":1000000.0,"minimum":1.0},{"type":"null"}]}` |
| `gift_product_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |

### ScheduleInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `publish_at` | Có | `{"type":"string","format":"date-time"}` |

### SessionConfigInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |
| `path` | Không | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/"}` |

### SessionResume

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192}` |

### Shift

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `weekdays` | Không | `{"items":{"type":"integer"},"type":"array","maxItems":7,"default":[0,1,2,3,4,5]}` |
| `start` | Không | `{"type":"string","format":"time","default":"08:00:00"}` |
| `end` | Không | `{"type":"string","format":"time","default":"18:00:00"}` |

### SimulationInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `path` | Không | `{"type":"string","maxLength":150,"pattern":"^/[a-z0-9/-]*$","default":"/"}` |
| `event` | Không | `{"type":"string","enum":["lead","qualified","closed","installed"],"default":"lead"}` |
| `analytics` | Không | `{"type":"boolean","default":false}` |
| `marketing` | Không | `{"type":"boolean","default":false}` |
| `advertising` | Không | `{"type":"boolean","default":false}` |

### StaffCreate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `email` | Có | `{"type":"string","maxLength":254,"minLength":3}` |
| `password` | Có | `{"type":"string","maxLength":128,"minLength":12}` |
| `display_name` | Có | `{"type":"string","maxLength":100,"minLength":1}` |
| `branch_id` | Có | `{"type":"string","format":"uuid"}` |
| `role` | Có | `{"type":"string","enum":["sales","support","marketing","editor","manager"]}` |

### SyncInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `connection_id` | Có | `{"type":"string","format":"uuid"}` |
| `start` | Có | `{"type":"string","format":"date"}` |
| `end` | Có | `{"type":"string","format":"date"}` |

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
| `cta_label` | Không | `{"anyOf":[{"type":"string","maxLength":24,"minLength":1},{"type":"null"}]}` |

### VariantRequest

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |

### VersionCommand

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### VersionInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### VoucherInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `code` | Có | `{"type":"string","maxLength":40,"minLength":3,"pattern":"^[A-Z0-9_-]+$"}` |
| `name` | Có | `{"type":"string","maxLength":150,"minLength":1}` |
| `label` | Không | `{"type":"string","maxLength":80,"default":"Ưu đãi khu vực"}` |
| `terms` | Có | `{"type":"string","maxLength":2000,"minLength":1}` |
| `start` | Có | `{"type":"string","format":"date-time"}` |
| `end` | Có | `{"type":"string","format":"date-time"}` |
| `plan_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":100}` |
| `services` | Không | `{"items":{"type":"string","enum":["internet","combo","camera","business","play"]},"type":"array","maxItems":5}` |
| `billing_months` | Không | `{"items":{"type":"integer","enum":[1,6,12]},"type":"array","maxItems":3,"minItems":1}` |
| `rules` | Có | `{"items":{"$ref":"#/components/schemas/Rule"},"type":"array","maxItems":200,"minItems":1}` |
| `exclusions` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":200}` |
| `quota` | Có | `{"type":"integer","maximum":1000000.0,"minimum":1.0}` |
| `per_contact_limit` | Không | `{"type":"integer","maximum":100.0,"minimum":1.0,"default":1}` |
| `budget_vnd` | Có | `{"type":"integer","maximum":1000000000000.0,"minimum":1.0}` |
| `hold_hours` | Không | `{"type":"integer","maximum":720.0,"minimum":1.0,"default":48}` |
| `redeem_at` | Không | `{"type":"string","enum":["closed","installed"],"default":"installed"}` |
| `stackable` | Không | `{"type":"boolean","default":false}` |

### VoucherUpdate

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `code` | Có | `{"type":"string","maxLength":40,"minLength":3,"pattern":"^[A-Z0-9_-]+$"}` |
| `name` | Có | `{"type":"string","maxLength":150,"minLength":1}` |
| `label` | Không | `{"type":"string","maxLength":80,"default":"Ưu đãi khu vực"}` |
| `terms` | Có | `{"type":"string","maxLength":2000,"minLength":1}` |
| `start` | Có | `{"type":"string","format":"date-time"}` |
| `end` | Có | `{"type":"string","format":"date-time"}` |
| `plan_ids` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":100}` |
| `services` | Không | `{"items":{"type":"string","enum":["internet","combo","camera","business","play"]},"type":"array","maxItems":5}` |
| `billing_months` | Không | `{"items":{"type":"integer","enum":[1,6,12]},"type":"array","maxItems":3,"minItems":1}` |
| `rules` | Có | `{"items":{"$ref":"#/components/schemas/Rule"},"type":"array","maxItems":200,"minItems":1}` |
| `exclusions` | Không | `{"items":{"type":"string","format":"uuid"},"type":"array","maxItems":200}` |
| `quota` | Có | `{"type":"integer","maximum":1000000.0,"minimum":1.0}` |
| `per_contact_limit` | Không | `{"type":"integer","maximum":100.0,"minimum":1.0,"default":1}` |
| `budget_vnd` | Có | `{"type":"integer","maximum":1000000000000.0,"minimum":1.0}` |
| `hold_hours` | Không | `{"type":"integer","maximum":720.0,"minimum":1.0,"default":48}` |
| `redeem_at` | Không | `{"type":"string","enum":["closed","installed"],"default":"installed"}` |
| `stackable` | Không | `{"type":"boolean","default":false}` |
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### pagefpt__modules__intelligence__routes__VisitInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `session_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |

### pagefpt__modules__link_analytics__schemas__BulkInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `action` | Có | `{"type":"string","enum":["pause","activate"]}` |
| `items` | Có | `{"items":{"$ref":"#/components/schemas/pagefpt__modules__link_analytics__schemas__BulkItem"},"type":"array","maxItems":50,"minItems":1}` |

### pagefpt__modules__link_analytics__schemas__BulkItem

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `id` | Có | `{"type":"string","format":"uuid"}` |
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |

### pagefpt__modules__link_analytics__schemas__LinkInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `title` | Có | `{"type":"string","maxLength":160,"minLength":1}` |
| `slug` | Có | `{"type":"string","maxLength":50,"minLength":3,"pattern":"^[a-z0-9-]+$"}` |
| `target` | Không | `{"type":"string","maxLength":120,"pattern":"^/(?:[a-z0-9-]+(?:/[a-z0-9-]+)?)?$","default":"/"}` |
| `platform` | Không | `{"type":"string","maxLength":40,"pattern":"^[a-zA-Z0-9_-]+$","default":"other"}` |
| `utm_medium` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-z0-9_.-]*$","default":"social"}` |
| `utm_campaign` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-z0-9_.-]*$","default":""}` |
| `utm_content` | Không | `{"type":"string","maxLength":100,"pattern":"^[a-z0-9_.-]*$","default":""}` |
| `content_note` | Không | `{"type":"string","maxLength":2000,"default":""}` |
| `active` | Không | `{"type":"boolean","default":true}` |

### pagefpt__modules__link_analytics__schemas__VisitInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `source_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |
| `session_token` | Có | `{"type":"string","maxLength":8192,"minLength":1}` |
| `visit_token` | Không | `{"anyOf":[{"type":"string","maxLength":8192},{"type":"null"}]}` |

### pagefpt__modules__measurement__schemas__BulkInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `action` | Có | `{"type":"string","enum":["disable","publish"]}` |
| `items` | Có | `{"items":{"$ref":"#/components/schemas/pagefpt__modules__measurement__schemas__BulkItem"},"type":"array","maxItems":50,"minItems":1}` |

### pagefpt__modules__measurement__schemas__BulkItem

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `expected_version` | Có | `{"type":"integer","minimum":1.0}` |
| `id` | Có | `{"type":"string","format":"uuid"}` |

### pagefpt__modules__vouchers__schemas__LinkInput

| Field | Bắt buộc | Kiểu và toàn bộ giới hạn |
|---|---|---|
| `preview_image_url` | Không | `{"anyOf":[{"type":"string","maxLength":1500},{"type":"null"}]}` |
| `title` | Không | `{"type":"string","maxLength":160,"default":""}` |
| `content_note` | Không | `{"type":"string","maxLength":2000,"default":""}` |
| `slug` | Có | `{"type":"string","maxLength":50,"minLength":3,"pattern":"^[a-z0-9-]+$"}` |
| `target` | Không | `{"type":"string","maxLength":110,"default":"/"}` |
| `channel` | Không | `{"type":"string","maxLength":40,"minLength":1,"pattern":"^[a-zA-Z0-9_-]+$","default":"direct"}` |
| `employee_id` | Không | `{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]}` |
| `active` | Không | `{"type":"boolean","default":true}` |

