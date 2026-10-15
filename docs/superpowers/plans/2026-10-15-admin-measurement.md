# Implementation plan: Admin measurement

Spec: `docs/superpowers/specs/2026-10-15-admin-measurement-design.md`.
Execution: inline in branch `codex/admin-measurement-system`; user requested all implementation. Preserve FastAPI/Jinja2 and existing intake/privacy behavior. No production provider writes/test messages without an explicit test action. No invented verified connections. Secrets write-only and server encrypted.

## Task 1 — registry and access
Create `modules/measurement/{schemas,policy,routes}.py`, private registry/secret/release SQL migration via CLI. Wire API router. Cover validation, global scoped permissions/MFA, encryption, no plaintext read, version conflicts and public schema isolation with failing integration tests first.
Expected: registry tests pass with real PostgreSQL; role grants exclude browsers.

## Task 2 — release engine
Implement draft/version, rule validation, effective scope resolution, simulation, publish/restore/disable and ETag public config. Immutable snapshots and active pointer transaction. Bootstrap existing GA4 configuration without a second tag source. Test conflict/concurrency, invalid references, duplicate primary mapping, disabled destinations and secret absence.
Expected: two campaign/landing configs resolve predictably; restore creates new audit/version.

## Task 3 — Admin editor
Add `/admin/measurement`, navigation entry, schema-backed accessible forms for connections/config/rules/policy, release preview/history, campaign parameter builder and destination selection. Reuse existing campaign/link management. No raw JSON editing required. Include date formatting, safe DOM rendering, busy/error state, bulk per-item results and mobile layout.
Expected: browser flow creates, validates, simulates, publishes and restores; four widths without page errors/overflow.

## Task 4 — client runtime and attribution
Replace hardcoded template ID with runtime public config. Retain Google SDK privacy filters and single tag load; add native Google Ads/Meta routing where consent permits. Public config fallback never blocks form. Extend typed touches and campaign context, preserve first/latest non-direct source, click identifiers opaque and encrypted. Keep legacy API compatible.
Expected: consent/preview matrices, source persistence and single event IDs pass JS/integration contracts.

## Task 5 — conversion ledger and worker
SQL occurrence/outbox on committed lead/CRM transitions, per-destination immutable routing and ledger, current consent/disabled recheck, bounded queue processing. Python provider connectors validate partial failures, unknown responses and account config; no direct external call on submit. Keep existing gateway compatibility without duplicate routing.
Expected: replay/concurrency/crash/timeout/withdrawal tests; provider mocks prove correct payloads, no fabricated PII or success.

## Task 6 — cost/reporting
Add idempotent cost preview/apply and source-of-truth grain, campaign report with timezone/completeness/lag, distinct CRM counts, Wilson/cohort maturity and explicit nulls. Index hot paths and use incremental/summary data where justified. Add quality/queue reconciliation dashboard.
Expected: repeated imports do not add cost twice, unknown and zero distinct, simultaneous work consistent.

## Task 7 — account sync
Supported OAuth/token configuration in Admin, bounded read-only campaign/cost sync jobs and preview/apply URL parameter writes with explicit operation approval and provider version conflict handling. Account rights/capability errors surfaced accurately; connected account is an external prerequisite, not a code completeness claim.
Expected: state/CSRF/expiry/scope tests, provider schema fixtures, retries and per-item errors.

## Task 8 — verification and delivery
Run focused tests after each task, then full Python/JS/static/architecture/browser checks. One fresh-context whole-branch reviewer as required by executing-plans/requesting-code-review. Fix important findings with reproductions; document provider tests that require live account permissions. Update API contract, operator guide and QA evidence. Production migration/deployment requires tested additive path and existing authorization; never imply deployment from a local pass.
Expected: clean checks, review and precise completion/remaining-account status.

## Shared interfaces / review focus
Registry release snapshots feed both public SDK and server routing: never include encrypted/plain secrets in releases. Campaign IDs are opaque strings and URL values cannot pick a credential/account. Conversion occurrence identity survives revision/retry; latest disable/consent overrides immutable historical route. Cost fact grains cannot mix account/campaign/ad rollups. Admin and SQL enforce same privilege boundary. Old migrations immutable; rollback web retains compatible old endpoints.
