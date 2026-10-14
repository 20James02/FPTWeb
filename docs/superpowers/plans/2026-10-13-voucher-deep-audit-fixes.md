# Voucher deep audit and project verification

Scope: fix the reported production voucher creation failure, all defects reproduced by the deep audit, then review all application source and verify representative client/admin workflows.

Architecture remains FastAPI/Jinja2/PostgreSQL with lightweight JavaScript. Never log credentials/customer PII. Work on `codex/voucher-deep-audit-fixes` and preserve prior changes.

1. Record RED probes and production schema repair evidence. Promote meaningful probes into regression coverage.
2. Fix voucher HTML injection, context mutation ordering, unconfigured promotion claims and inaccurate report descriptions. Verify real browser workflows.
3. Add a forward-only migration: retain anonymized redeemed entitlements on erasure; preserve spent budget/report totals; reject unavailable gift types; atomically reject duplicate campaign codes and cross-campaign slugs; validate link targets and useful benefits.
4. Preserve trusted landing campaign pricing when reserving a voucher; validate zero-value discount configurations. Run targeted RED→GREEN integration tests.
5. Review all application Python/SQL/JavaScript for validation, authorization, concurrency, template injection, pricing and queue faults. Reproduce and fix any additional material defects.
6. Run full Python, JavaScript, architecture checks and appropriate integrated browser suites. Review the final diff independently, address material findings, update frontend contracts and QA notes.
7. Verify cloud configuration and migrate/deploy tested fixes within existing authorization. Verify production public endpoints and record any checks that cannot be completed.

Review focus: privacy erasure versus financial conservation; publication changes while holds exist; stale landing versions; generated CSV/HTML; overlapping cookie mutations; role scopes; public/authenticated operation boundaries. Green tests do not establish that every possible defect is absent.

Baseline: 446 Python tests, 26 JavaScript contracts, existing voucher browser flow passed. Deep audit: eight backend probes reproduced seven failures; six browser probes reproduced four failures. Production schema repair applied missing existing migrations and confirmed rollback-only voucher creation plus public context response.
