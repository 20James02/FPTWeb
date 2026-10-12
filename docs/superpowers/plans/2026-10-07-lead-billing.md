# Lead billing implementation plan

> Execution: inline with executing-plans; independent review at completion. Existing user request authorizes implementation. Preserve current FastAPI/Jinja2 stack and unrelated working-tree changes.

**Goal:** Record the agreed package and payment terms, maintain dated payment entries, notify the current assigned employee, and simplify lead detail.

**Architecture:** Private PostgreSQL tables for one deal per lead, payment installments and per-user notices. FastAPI validates/authenticates/encrypts notes; SQL enforces lead scope, CAS and atomic collection/next installment. Existing five-minute recovery tick and scoped inbox refresh generate durable notices with deduplication. No customer messages or automatic charges.

**Spec:** User request, 07/10/2026; design reflected in commentary. Default notification channel is Admin pending optional clarification.

## Constraints and decisions

- Published package selection; billing_months exactly 1, 6 or 12. Keep original enquiry/quote unchanged; do not change lead workflow automatically.
- Due dates use Vietnam calendar dates; amounts are positive integer VND, at most 1,000,000,000. Staff enters the actual agreed amount.
- Multiple explicit payment entries; paid/cancelled entries immutable. Pending entries editable with their own version. Duplicate live date per deal rejected.
- Paid confirmation optionally creates the next cycle atomically; calendar arithmetic clamps month-end and retains original anchor day. Changing package/term does not rewrite prior entries.
- Notes encrypted; plaintext read only after lead.pii + AAL2 and scoped lead access. No plaintext notes in audit, inbox or Telegram. Financial mutations require AAL2.
- Notice recipient is the current assignee with active scoped access, including installed customers. Old assignee loses visibility after handoff; new assignee receives outstanding due entry. Read acknowledgements persist per recipient/payment revision.
- GET inbox generates only the caller's due notices (bounded 100) as recovery; scheduled tick covers offline generation. Paid/cancelled and invalid/duplicate/rejected lead entries stop alerts.
- No promise of OS push or offline sound. Inbox polls only while visible, with backoff and auth gates. Optional external employee messaging needs confirmed channel binding.
- Main score display: short plain Vietnamese summary, two primary signals; source/rules/evidence/technical detail in accessible native dialog. Estimates remain labelled estimates.

## Review focus

Stale forms never overwrite; retries never duplicate charge entries; branch/nonassignee cannot read or mutate; handoff and paid cancellation remove old alerts; month-end next date does not drift; financial notes never leak to read-only/no-PII roles; background refresh preserves open drafts.

### Task 1 — Scoped billing API and database

Files: modules/leads/billing.py, API router, migration, tests/integration/test_lead_billing.py.

- [x] Add failing integration tests for deal save/periods/notes, payment CRUD/CAS/duplicate and paid-next atomicity/calendar, authorization/RLS/privacy cascade.
- [x] Run tests red, implement private tables/functions and Python routes, run green.
- [x] Interface: GET/PUT `/leads/{id}/billing`, POST `/leads/{id}/payments`, PATCH `/payments/{id}`, POST `/payments/{id}/collect`; GET `/leads/{id}/payments` paginated. Deal/payment versions independent from lead.version.

### Task 2 — Durable employee inbox

Files: migration, billing routes, tests/integration/test_lead_billing.py, admin/notifications.js, layouts/admin_base.html, admin-billing.css.

- [x] Write failing due/dedup/read/recipient-change/paid tests; implement bounded tick + inbox SQL and owner-only acknowledgement.
- [x] Interface: GET `/notifications`, POST `/notifications/{id}/read`; schedule_tick invokes billing reminders. Inbox list carries IDs, package snapshot/date/amount only.
- [x] Poll visible tab with backoff, no data browser persistence. Popup accessible, empty/error states, link to scoped lead.

### Task 3 — Lead detail and plain-language scoring

Files: templates/admin/leads/detail.html, admin/billing.js, admin/lead_intelligence.js, admin-billing.css, browser billing test.

- [x] Add browser tests; package/payment labeled dialogs, edits/collection/cancel, keyboard/Escape/focus, 360/768/1440 and dark mode.
- [x] Guard background refresh during open form; preserve drafts on conflict/network failure. Explain amount per whole payment cycle and due reminders to current staff.
- [x] Move score provenance into dialog, plain labels, rename all visible reveal strings “Hiển thị thông tin”.

### Task 4 — Verify and release

- [x] Full Python, JS contracts, ruff/format/mypy/architecture, independent code review.
- [x] Export frontend API contracts, document UI/API and QA evidence.
- [x] Apply compatible migration, confirm private RLS/grants, deploy candidate/test/promote/live checks. Do not modify real customers or send test notices to real staff.

## Ledger

- Planning: inspected CRM scope and installed-lead handling, existing recovery cron every five minutes, native dialog design, role sales has lead.pii; no billing subsystem currently exists.

- Verified: 293 Python tests and 12 JS contract files pass; browser on 1440/768/360 and dark mode passes, separate focus regression passes. Ruff/format/mypy/architecture pass.
- Independent reviews found calendar-anchor drift and focus replacement; both reproduced red then fixed green. Fresh final review found no remaining actionable issues.
- SQL migration applied as 20261007052315; RLS/grants/empty search_path/cron confirmed. No real customer writes performed.
- Frontend contracts exported (176 operations, 68 schemas); workflow documented in docs/backend/lead-billing.md.
- Candidate dpl_Dv66e9tGwEjSkUVF3p3sQPcRkr3t READY, all 14 HTTP/asset SHA checks pass; promoted; live domain passes 16 HTTP/asset checks and inspect confirms the same deployment/READY.
