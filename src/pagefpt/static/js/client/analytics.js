/**
 * PAGEFPT ANALYTICS & INTERACTIVE UI HELPERS
 * Lightweight event tracking (batching) & dynamic UI interactions
 * Zero fake pricing maps; strict whitelist tracking
 */

const eventQueue = [];
let flushTimeout = null;
let analyticsContext = {
  analytics_opt_in: false,
  marketing_opt_in: false,
  session_token: null,
  attribution_token: null,
};

const eventNames = new Set([
  "view_plan",
  "select_plan",
  "select_region",
  "compare_plans",
  "start_form",
  "view_cost",
  "click_call",
  "click_zalo",
  "return_visit",
  "experiment_exposure",
  "view_landing",
]);

/**
 * Initialize client session with backend (default analytics=false, marketing=false)
 */
let sessionInitialization = null;
let consentRevision = 0;
function analyticsPreview() {
  try {
    return (
      JSON.parse(
        document.getElementById("pagefpt-google-config")?.textContent || "{}",
      ).preview === true || document.body?.dataset?.landingPreview === "true"
    );
  } catch (_) {
    return true;
  }
}
async function initClientSession(restoreChoice = true) {
  if (analyticsPreview()) return null;
  if (analyticsContext.session_token) return analyticsContext.session_token;
  if (sessionInitialization) return sessionInitialization;
  sessionInitialization = (async () => {
    const revision = consentRevision;
    const choice = restoreChoice
      ? window.PageFPTConsentPreferences?.read()
      : null;
    try {
      const res = await fetch("/api/v1/sessions", {
        signal: AbortSignal.timeout(3000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analytics: choice?.analytics === true,
          marketing: choice?.marketing === true,
          consent_version: "2026-10-v2",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session_token) {
          analyticsContext.session_token = data.session_token;
          if (revision === consentRevision) {
            analyticsContext.analytics_opt_in = choice?.analytics === true;
            analyticsContext.marketing_opt_in = choice?.marketing === true;
          }
          window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
          if (analyticsContext.analytics_opt_in) await initAttribution();
        }
      }
    } catch (_) {
      /* Form use remains available during a session network failure. */
    }
    return analyticsContext.session_token;
  })();
  try {
    return await sessionInitialization;
  } finally {
    sessionInitialization = null;
  }
}

// Call only after an explicit user choice in the consent interface.
async function setAnalyticsConsent(analytics, marketing = false) {
  if (analyticsPreview()) throw new Error("Bản xem trước không bật đo lường.");
  consentRevision += 1;
  // Restrict immediately, even offline. Permission increases still require an acknowledgement.
  if (!analytics || (!marketing && analyticsContext.marketing_opt_in)) {
    analyticsContext.analytics_opt_in &&= Boolean(analytics);
    analyticsContext.marketing_opt_in &&= Boolean(marketing);
    analyticsContext.attribution_token = null;
    if (!analytics) eventQueue.length = 0;
    window.PageFPTConsentPreferences?.write(
      analyticsContext.analytics_opt_in,
      analyticsContext.marketing_opt_in,
    );
    window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
  }
  await initClientSession(false);
  const previous = analyticsContext.session_token;
  const path = previous ? "/api/v1/consent" : "/api/v1/sessions";
  const response = await fetch(path, {
    signal: AbortSignal.timeout(5000),
    method: previous ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      analytics: Boolean(analytics),
      marketing: Boolean(marketing),
      consent_version: "2026-10-v2",
      ...(previous ? { session_token: previous } : {}),
    }),
  });
  if (!response.ok) throw new Error("Chưa lưu được lựa chọn dữ liệu.");
  const data = await response.json();
  if (!(previous || data.session_token))
    throw new Error("Chưa xác nhận được phiên dữ liệu.");
  analyticsContext = {
    analytics_opt_in: Boolean(analytics),
    marketing_opt_in: Boolean(marketing),
    session_token: previous || data.session_token,
    attribution_token: null,
  };
  window.PageFPTConsentPreferences?.write(
    Boolean(analytics),
    Boolean(marketing),
  );
  window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
  if (!analytics) {
    eventQueue.length = 0;
    return;
  }
  try {
    await initAttribution();
  } catch (_) {}
}

async function initAttribution() {
  const params = new URLSearchParams(window.location.search);
  const attributes = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = params.get(key) || "";
    if (/^[a-zA-Z0-9_.-]{0,100}$/.test(value)) attributes[key] = value;
  }
  const touch = await fetch("/api/v1/touches", {
    signal: AbortSignal.timeout(3000),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_token: analyticsContext.session_token,
      ...attributes,
    }),
  });
  if (touch.ok)
    analyticsContext.attribution_token = (await touch.json()).attribution_token;
}

function getAnalyticsContext() {
  return { ...analyticsContext };
}

function trackEvent(name, data = {}) {
  if (
    !analyticsContext.analytics_opt_in ||
    !eventNames.has(name) ||
    eventQueue.length >= 100
  )
    return;
  const event = { id: generateUUID(), name };
  if (
    name === "view_landing" &&
    /^[a-z0-9-]{1,100}$/.test(data.landing_slug || "")
  )
    event.landing_slug = data.landing_slug;
  for (const key of ["plan_id", "region_id", "experiment_id"]) {
    if (typeof data[key] === "string" && /^[0-9a-f-]{36}$/i.test(data[key]))
      event[key] = data[key];
  }
  if (
    typeof data.variant === "string" &&
    /^[a-z0-9_-]{1,50}$/.test(data.variant)
  )
    event.variant = data.variant;
  if (Number.isInteger(data.experiment_version) && data.experiment_version > 0)
    event.experiment_version = data.experiment_version;
  eventQueue.push(event);
  window.PageFPTGoogle?.track(name, event);
  if (!flushTimeout) flushTimeout = setTimeout(flushEvents, 3000);
}

async function flushEvents() {
  flushTimeout = null;
  if (!analyticsContext.analytics_opt_in || eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, 20);
  try {
    const response = await fetch("/api/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_token: analyticsContext.session_token,
        events: batch,
      }),
    });
    if (response.status === 503) eventQueue.unshift(...batch);
  } catch (_) {
    eventQueue.unshift(...batch);
  }
  if (eventQueue.length) flushTimeout = setTimeout(flushEvents, 5000);
}

// Plan Segment Filter
function filterPlans(category, tabBtn) {
  document
    .querySelectorAll(".segment-tab-btn")
    .forEach((b) => b.classList.remove("active"));
  if (tabBtn) tabBtn.classList.add("active");

  const cards = document.querySelectorAll(".plan-card-3d-wrapper, .plan-card");
  cards.forEach((card) => {
    if (category === "all" || card.getAttribute("data-category") === category) {
      card.dataset.categoryHidden = "false";
      card.style.display = "flex";
    } else {
      card.dataset.categoryHidden = "true";
      card.style.display = "none";
    }
  });

  if (typeof updatePlans3DMode === "function") {
    updatePlans3DMode();
  }

  trackEvent("view_plan", { category });
}

// FAQ Accordion Toggle
function toggleFaq(button) {
  const item = button.closest(".faq-item");
  if (!item) return;

  const isOpen = item.classList.contains("open");

  // Close other open faqs
  document
    .querySelectorAll(".faq-item")
    .forEach((i) => i.classList.remove("open"));

  if (!isOpen) {
    item.classList.add("open");
  }
}

window.addEventListener("pagehide", () => {
  if (
    analyticsContext.analytics_opt_in &&
    eventQueue.length &&
    navigator.sendBeacon
  ) {
    navigator.sendBeacon(
      "/api/v1/events/batch",
      new Blob(
        [
          JSON.stringify({
            session_token: analyticsContext.session_token,
            events: eventQueue.slice(0, 20),
          }),
        ],
        { type: "application/json" },
      ),
    );
  }
});

// Auto-bootstrap session on page load
document.addEventListener("DOMContentLoaded", () => {
  initClientSession();
});
