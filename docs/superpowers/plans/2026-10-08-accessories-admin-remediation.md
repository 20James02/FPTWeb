# Accessories and Admin Remediation Implementation Plan

> Execute inline with executing-plans; preserve existing user changes. No automatic commits.

**Goal:** Fix reproduced CMS/A/B/workspace gaps and implement configurable fixed-price accessories and consistent cards.
**Architecture:** Existing product JSON resource, FastAPI validation, shared server quote calculation, Jinja SSR and small JS modules; additive SQL dispatch guards.
**Tech Stack:** Python 3.12, FastAPI, Jinja2, PostgreSQL/Supabase, existing R2 media.
**Spec:** docs/superpowers/specs/2026-10-08-accessories-admin-remediation-design.md

## Global constraints
No fabricated production offers; no client prices trusted; no provider messages/exports for tests; MFA/version/CSRF retained. Each price explicitly one-time or monthly and includes its tax. Lead captures selected IDs and server-derived snapshot.

## Tasks
- [x] Accessory backend: RED integration tests CRUD/public catalog/calculation/lead snapshots/stale/security; extend ProductInput, add product payload validation, accessory selection helper; extend QuoteRequest/LeadRequest and quote/intake; SQL revision/scope/slug guards. GREEN against real disposable PostgreSQL.
- [x] Accessory UI: Admin page CRUD/media checkbox plan applicability/price/mode/publish, nav links; SSR choices/shared JS state 1/6/12 billing and immediate estimates then server quote; form passes IDs and admin lead shows snapshot; equal card CSS. Browser test with varied content and multiple selections.
- [x] CMS: RED HTML 404/preview/reserved/duplicate tests; add safe renderer/preview and canonical/sitemap validation. HTML blocks headings/text/CTA/image/pricing/FAQ responsive and escaped.
- [x] A/B and delivery/workspace: RED consent/exposure/variant reporting tests; configure CTA experiments with labels, connect only after consent; report actual counts; delivery reconciliation UI with evidence and readable states/filter. No external sends.
- [x] Verify full pytest, contracts, browser flows, lint/mypy/architecture; regenerate contracts; report all Admin functions and customization coverage. Apply verified migration/deploy candidate then promote only after smoke checks, record exact results.
- [x] User steering: checkbox selection/select-all on Admin lists; accessible bidirectional sorting of table columns; supported bulk publish/retire/retry/lead assignment with per-item version/permission, bounded concurrency, confirmation, partial failure reporting, no bulk PII reveal/export without authorized existing workflow.

- [x] Assigned employee profile: name/address/plan/accessories, immutable phone, MFA/assignment/CAS checks; province/ward lookup and parent validation, encrypted history and catalog transaction compatibility checks.
- [x] All human date fields dd/mm/yyyy (timestamps include HH:mm), shared parsing/validation/native picker/reset adaptation; API ISO preserved.

Verification so far: 330 pytest passed; full Ruff/mypy/architecture and JS contracts passed. Browser Chromium/WebKit equipment totals/card sizes passed; Chromium profile/consent, bulk CAS partial failures, dates, sorting, billing and home mobile passed. Remote migrations applied and normalized to remote versions 20261008052906 / 20261008052911. Final candidate dpl_8snwAGtLUEXjizX8VpjJEmpqG2nU passed 50 checks, promoted; live passed 52 HTTP/SHA checks plus 7 Chromium checkpoints. Chromium/WebKit home tests passed with compact footer and no empty-catalog height transition.
