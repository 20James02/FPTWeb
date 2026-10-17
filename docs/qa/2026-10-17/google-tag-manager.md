# Google Tag Manager — 17/10/2026

## Change

Installed the user-supplied `GTM-55F7ZTBZ` head loader and body noscript iframe through shared Jinja partials in the standard client layout and standalone telecom landing layout. Both saved/unsaved previews and Admin exclude the container. Google consent defaults are queued as denied before the loader; existing native GA4 remains the measurement owner. No database, provider account, secrets or published measurement rules changed.

## Verification

- Red: six expected missing-container failures, one exclusion test passed.
- Green: seven integration tests cover public routes, both published landing templates, saved/unsaved previews and Admin.
- Full Python suite: **640 passed**, 251 seconds.
- Three relevant JavaScript contract groups passed: measurement runtime, measurement behavior, plan measurement.
- Chromium fixture: four public routes, single GTM load, denied defaults before container start, consent acceptance/revocation, unchanged native GA4 page-view count, Admin exclusion and noscript fallback with JavaScript disabled. External analytics transport blocked.
- Ruff, Python test formatting, JavaScript syntax and git diff whitespace checks passed.
- Independent read-only review found no critical or important issues. GTM itself loads before choice; Basic mode continues gating the existing native GA4 integration. Future tags added to the externally managed container need their own consent and duplicate-event review.

## Deployment

Production deployment `dpl_65HajgNh4zjMC7peMQAgHk5oT8H6`, built with production environment and initially without domain aliases. Authenticated Vercel candidate checks passed for five public routes, Admin login and readiness; public measurement configuration retained `G-MDBC01VK8Z` with the same published release and 17 targets. Promoted successfully to `https://fpt-vungtau.com`.

Live Chromium confirmed real GTM script HTTP 200 and `google_tag_manager['GTM-55F7ZTBZ']` on home and speedtest, one attempted GA4 page_view per document to `G-MDBC01VK8Z`, no browser errors and no GTM on Admin login. Analytics collection requests were intercepted during this final check, so this proves container loading and event construction, not newly received events in Google reports. No test leads or conversions were created. The public GTM container had no tags when inspected; no tags were added or published in the user's GTM account.

Local evidence (ignored by Git): `.local/qa/gtm-20261017/`, `.local/qa/gtm-*-20261017.log`.
