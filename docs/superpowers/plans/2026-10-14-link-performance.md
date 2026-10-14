# Content Link Performance Implementation Plan

> **For agentic workers:** Use executing-plans inline task-by-task; one fresh independent reviewer after implementation.

**Goal:** Link-level creator/content/click/engagement/form/CRM-closed reporting for content and voucher campaigns.
**Architecture:** FastAPI module + private PostgreSQL registry/cohort aggregates + consent-gated lightweight JS and Admin Jinja2; reuse existing voucher, session, lead and CRM transactions.
**Tech Stack:** Python/FastAPI/Jinja2, PostgreSQL/Supabase, vanilla JS, Vercel.
**Spec:** docs/superpowers/specs/2026-10-14-link-performance-design.md

## Global Constraints

No PII/raw IP into measurement or ads; no fabricated historical click/engagement. Form = new persisted lead, closed = CRM closed/installed current success, distinct creator/closer. dd/mm/yyyy; analytics consent for journey/engagement. Keep /s behavior and existing retries/auth/scopes. No framework/dependency replacement; integer money/time, server source and clocks.

## Review Focus

Reordered heartbeat/multiple tabs and consent withdrawal; idempotent lead/replayed request; source edits and forged tokens; cancellation/reclose/privacy deletion; delayed close/new cohorts and misleading low-N ranking.

### Task 1: Signed interfaces and ranking
Files: modules/link_analytics/{schemas,service,metrics}.py; tests/unit/test_link_metrics.py; integration/test_link_performance.py.
Produces: typed CRUD/report/checkpoint inputs, source_context(request,input), rank_measured(visits,forms,closed).
- [x] RED endpoint/metrics/input behavior tests.
- [x] Implement bounded source validation and Wilson/maturity outputs; don't change totals on invalid source.
- [x] Targeted GREEN.

### Task 2: Registry and transactional measurement
Files: CLI-created forward migration; modules/link_analytics/routes.py; router.py; vouchers routes/service; lead schemas/service.
Produces: private.link_dispatch commands; registry sync and source revision; form/current-closed/install/creator/closer count hooks; /r routes; source/visit/checkpoint/revoke APIs.
- [x] RED real SQL tests all spec input classes.
- [x] Implement schema/RPC/trigger and source integration; no history fabrication; enforce permissions/current consent/time bounds.
- [x] GREEN including existing vouchers/leads/CRM cases.

### Task 3: Client tracking
Files: static/js/client/link_tracking.js, analytics/api helpers, client_base template; tests/contracts/link_tracking.mjs.
Consumes: signed context/visit APIs. Produces PageFPTLinkTracking.leadContext(); checkpoint on visibility/pagehide; consent-bound sessionStorage journey.
- [x] RED timers/hidden/idle/consent/retry contracts.
- [x] Implement bounded 15s checkpoint, sequence/cumulative fences, token propagation and retry stable body.
- [x] GREEN contracts and source→real form integration.

### Task 4: Admin dashboard
Files: web/admin_routes.py, admin_base.html, admin/link_performance.html, static/js/admin/link_performance.js, CSS; tests/e2e/link_performance.cjs.
Consumes: scoped registry/report/options/bulk APIs. Produces accessible mobile dashboard, metadata editor, source/creator/date filters, server sort/page/bulk feedback, CSV and truthful rank/coverage.
- [x] RED browser metadata/real-save/report/closed/form/mobile/date interactions.
- [x] Implement UI with existing node/CSRF/date helpers; no unsafe dynamic HTML.
- [x] GREEN and inspect screenshots at 390/1440px.

### Task 5: Verification, review and rollout
Files: QA report, frontend handoff, docs/admin/LINK-PERFORMANCE.md.
- [x] Full pytest, JS contracts, lint/format/mypy/architecture; relevant browser suites.
- [x] One independent whole-change review; fix material findings RED→GREEN.
- [x] Deploy candidate and smoke before promotion; compatible Supabase migration already applied and rollback-only registry/report verified. No real QA forms or notifications.
- [x] Record live proofs and unverified large-load/physical-device/provider boundaries.
