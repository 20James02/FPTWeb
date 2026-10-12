# Client speedtest implementation plan

> Execution: executing-plans inline; one fresh final review. User explicitly requests building this feature; project instructions favor completing authorized work without repeated approval. Preserve unrelated working changes; no unsolicited commit/push.

**Goal:** A truthful, smooth mobile speed test opened from navbar, with scoped real package recommendations below.

**Architecture:** FastAPI SSR route, route-specific CSS and small classic JS modules; official Cloudflare SDK lazy-loaded locally after user interaction. Transfer bypasses Python/Vercel. Existing catalog/geography/quotes and intake are reused.

**Tech stack:** Python/FastAPI/Jinja2, CSS/SVG, JavaScript, vendored Cloudflare1.14.1 MIT.

**Spec:** docs/superpowers/specs/2026-10-07-client-speedtest-design.md.

## Global constraints

- No fabricated speed/price/ISP/packet-loss data; no raw IP or test results in advertising or server storage.
- Manual start only, ordinary payload56.4 MB plus metadata, SDK logging disabled;60s total/10s request deadlines, cancel aborts transfers.
- Use current location/quote boundary and plan_id intake; published plans only.
- Existing Python deployment stack unchanged; no external service project needed.

## Review focus

Cancel/restart must fence late metadata/callbacks; slow/blocked/offline tests preserve partial measurements but never claim complete; missing metrics are null, not0; selection changes reject old regional prices/recommendations; unsupported timings/loaded measurements explain unavailable values.

### Task1 — model and SSR surface

Files: client/speed_model.js, templates/client/speedtest.html, CSS client-speedtest.css, web/client_routes.py, header.html; tests/contracts/speedtest.mjs, tests/integration/test_speedtest_ui.py.

- [x] Add and run red tests for snapshot units/null handling, config payload cap/no auto/logging/no packetLoss, deterministic scoped ranking, safe metadata; SSR route/nav/published packages and escaped text.
- [x] Implement model `PageFPTSpeedModel.config/snapshot/rank/gauge/metadata`, SSR route and accessible SVG/panel/metric/detail/region/recommendation skeleton; desktop/mobile navbar link.
- [x] Run model/SSR tests green.

### Task2 — controller and real engine integration

Files: client/speedtest.js, vendor/cloudflare-speedtest-1.14.1.js/license, catalog.js/regions.js only targeted hooks as needed; tests/e2e/speedtest.cjs and fixture server.

- [x] Browser red: new page has no auto-measure, initial unavailable values, play engine, phases/real samples/finish, canceled/blocked/restart/offline/hidden outcomes, scoped prices and CTA.
- [x] Lazy SDK import, generation fencing, metadata with AbortController, deadlines, real-sample dial/SVG plot, visible status, cancel, result details/copy summary without IP, restart. Lifecycle aborts while hidden/offline/navigation.
- [x] Build max3 recommended cards with real quote endpoint and selected-region path; retain old inquiry context; explicit unknown prices and unsupported metrics. Region control reuses home select IDs and geography service.
- [x] Browser green; inspect 360/390/768/1024/1440, reduced motion/focus, failure and retry. Run one bounded live Cloudflare browser test, no real customer writes.

### Task3 — review and deploy

- [x] Full Python/JS contracts, lint/type/architecture; fresh review and fixes verified.
- [x] Export contracts, document method/limits/QA and vendor provenance/hash/license.
- [x] Candidate HTTP/auth/asset tests, promote, live domain route/nav/SHA/status checks. Safe upload manifest validated: 190 regular files, no secrets/operator files, speedtest runtime present. No schema changes required.

## Ledger

- Inspected client navbar/navigation, quote generation fencing, two-level geography and existing form context; no speed tool currently exists.
- Cloudflare official package1.14.1 supports onPhaseChange, pause abort, loaded latencies and configurable logging; GET/POST endpoints CORS/TAO verified. Vendor about55 KB raw; only lazy load after click.
- Ruling: use dedicated `/do-toc-do` page linked from navbar — provides full metrics and packages without cramped mega-menu nesting; existing header remains on page.
- Ruling: measure to Cloudflare, not Python function — Vercel serves only UI/quotes; avoids speed-test traffic through Vercel and one-instance measurement limits.

- Final verification: 295 Python tests (74.80s), all 13 JS contract files (19 node test cases plus script assertions), Ruff/format, mypy94 sources and architecture94 sources passed. Browser reduced-motion and animated runs passed at five widths, navigation regression passed.
- Independent review identified paused-region stale price, dial tick mismatch and SDK empty latency buckets; all reproduced red and fixed green. Reviewer follow-up unavailable due usage limit; fixes verified directly.
- Documentation: `docs/frontend/CLIENT-SPEEDTEST.md`, `docs/qa/2026-10-07-client-speedtest.md`; frontend contract export177 operations/68 schemas.

- Lifecycle follow-up: history restore left a paused run marked preparing; browser pagehide/pageshow regression red → green. Paused quote requests resume only on restored pageshow, no background measurement restart. Final reduced-motion/animated/browser and JS contracts rerun passed.

- Release: dpl_4uwXnMfmk7kGcYu2ePpBdxjL8hK3 READY, candidate23 checks, live25 checks, SHA matches source; promoted and domain inspect confirmed. One production browser Cloudflare run complete (46 requests,56.4MB), no JS errors/customer mutations.
