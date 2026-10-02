# Regional pricing implementation plan
Spec: ../specs/2026-10-02-regional-pricing.md. Inline execution authorized by project/user instructions.

1. RED tests: schemas/hierarchical quote integration, availability, invalid parents/branch, bulk atomicity, replacement history/CAS, paginated locations. Run targeted pytest before implementation.
2. GREEN backend: Region/Plan fields, optional quote region_path, location list endpoints, typed bulk and replacement, new migration preserving older deployments and service_role only. Run tests + permission checks.
3. Admin: reusable style sheet/accessible dialogs, plan CRUD, named location checklist, bulk prices and version replacement, geographic CRUD, currency/VAT/dates/errors, pagination. Browser test real SQL/API.
4. Client: optional ward selector, province fallback, synced location and bounded/stale-safe quote; landing; clear tax placeholder claims. Browser mobile and lead snapshot tests.
5. Verify: full pytest, JS contracts, lint/type/architecture/package, fresh reviewer, address findings. Export OpenAPI contracts, documentation and QA evidence. Restart local demo8000, inspect result.

## Ledger
- Ruling: no new approval request; existing autonomous scope and AGENTS supersede skill handoff approval.
- Ruling: bulk uniform pricing plus separate ward overrides avoids massive editable grid on mobile; all fees/periods remain configurable per selected location.
- Ruling: no Git commits because workspace is not a Git repository; pre-change source snapshot saved in /tmp/pagefpt-pre-regional-pricing-src.
- Official Supabase changelog read2026-10-02; recent pg upgrades/btree_gist advisory noted. No hosted DB changes. RPC invoker/search_path permissions retained.
- Backend RED:4 tests rejected new hierarchy fields. GREEN: hierarchy/availability, atomically bulk/replace, branch checks and local snapshots.
- Client RED:missing ward controls. GREEN: ward choices on home/intake/campaign.
- Fresh review found4 UI/performance issues: draft scope editing, ward name cache, landing disabled race, eager full region catalog. Fixed with Node2/2 RED→GREEN, API province-only RED→GREEN and price scope label RED→GREEN.
- Review follow-up: keep explicit UUID DESC in enriched price aggregation for stable cursors; added named-price pagination and121-ward pagination tests.
- Ruling: filter public_catalog(region) at SQL to provinces; explicit ward endpoint is the lookup path. This replaces the legacy empty-catalog geography fallback rather than inventing a current administrative list.
- Ruling: preserve scope in price edit UI; different scope uses Add price. Backend draft update still accepts valid re-scoping with permission checks.
- Visual QA found admin toast container participating in flex layout; positioned notifications over the shell with consistent styles.
- Browser evidence: baseline31/31 and48 viewport checks; new feature11/11 plus4 dialog/mobile viewport sizes, no uncaught page errors. Diagnostic7/7.
- Static/package: Ruff, mypy86files, architecture86files and isolated wheel smoke passed; contract export135 operations/53 schemas.
- Final verification:161 pytest passed (28.26s), Ruff/format/mypy/layering/build/wheel passed; Node8 script contracts passed. Local8000 smoke verified healthy SQL, logged-in UI, fixed toast, mobile390px/no document overflow and Escape. All five implementation steps complete; hosted deployment remains outside this task.
