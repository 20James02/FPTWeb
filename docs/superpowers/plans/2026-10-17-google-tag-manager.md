# Google Tag Manager implementation plan

**Goal:** Install the supplied `GTM-55F7ZTBZ` web container on public client pages.

**Architecture:** Shared Jinja head/body partials cover the regular client layout and the standalone telecom landing layout. Initialize denied Google consent before loading the container. Keep the existing published GA4 integration as the measurement owner; the inspected GTM live container currently contains no tags. Admin and draft previews must not load GTM.

**Constraints:** Python/FastAPI/Jinja2, no dependencies or database migrations. Do not change the published GA4 destination, inject customer information, or create lead conversions during QA. Future GTM tags require separate consent and duplicate-event review.

- [x] Add regression coverage for public routes, both published landing templates, previews and Admin; observe failure before implementation.
- [x] Add shared head/body snippets, default denied consent before the GTM loader, and operational instructions.
- [x] Verify browser loading, consent transitions, noscript placement and unchanged GA4 event counting with external event transport intercepted in fixtures.
- [x] Run Python suite and relevant JavaScript checks; review the diff, deploy, and verify the live container and GA4 requests.

Evidence: `docs/qa/2026-10-17/google-tag-manager.md`. Python 640 passed; browser and three JavaScript groups passed. Independent review found no critical/important defects. Deployed and live-checked `dpl_65HajgNh4zjMC7peMQAgHk5oT8H6`. Initial CLI deployment failed authorization, confirmed valid account/project access and retried with explicit `pettravel` scope successfully; protected candidate inspected with authenticated Vercel curl before promotion.

Implementation is inline for this small integration. User supplied the exact container and snippets; no unresolved design decision requires another approval.
