/* Google tag: explicit consent controls storage; advanced mode permits limited cookieless measurement. */
(() => {
  if (window.PageFPTGoogle) return;
  let config;
  try {
    config = JSON.parse(
      document.getElementById("pagefpt-google-config")?.textContent || "{}",
    );
  } catch (_) {
    return;
  }
  const id = config.measurement_id;
  if (
    !/^G-[A-Z0-9]+$/.test(id || "") ||
    config.preview ||
    /^\/admin(?:\/|$)/.test(window.location.pathname)
  )
    return;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function () {
      window.dataLayer.push(arguments);
    };
  const gtag = window.gtag;
  const advanced = config.consent_mode === "advanced";
  const disable = "ga-disable-" + id;
  window[disable] = !advanced;
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("set", "ads_data_redaction", true);
  gtag("set", "url_passthrough", false);
  const context = () =>
    typeof getAnalyticsContext === "function" ? getAnalyticsContext() : {};
  const uuid = (value) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  const names = new Set([
    "view_plan",
    "select_plan",
    "select_region",
    "compare_plans",
    "form_open",
    "form_start",
    "view_cost",
    "click_call",
    "click_zalo",
    "click_messenger",
    "return_visit",
    "experiment_exposure",
    "view_landing",
    "select_billing_period",
    "select_accessory",
  ]);
  let loaded = false,
    pageViewed = false,
    observer;
  const receipts = new Set(),
    viewedPlans = new Set(),
    startedForms = new Set();
  function safeUrl(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : "";
    } catch (_) {
      return "";
    }
  }
  function pageFields() {
    const url = new URL(window.location.href),
      fields = {
        page_location: safeUrl(url.href),
        page_referrer: safeUrl(document.referrer),
      };
    if (context().analytics_opt_in && context().marketing_opt_in) {
      for (const [key, field] of Object.entries({
        utm_source: "campaign_source",
        utm_medium: "campaign_medium",
        utm_campaign: "campaign_name",
        utm_content: "campaign_content",
      })) {
        const value = url.searchParams.get(key);
        if (value && /^[a-zA-Z0-9_.-]{1,100}$/.test(value))
          fields[field] = value;
      }
    }
    return fields;
  }
  function properties(data = {}) {
    const clean = { measurement_mode: context().analytics_opt_in ? "consented" : "limited" };
    if (!context().analytics_opt_in) {
      // No region, campaign, experiment or product IDs in unconsented events.
      if (
        [
          "consultation",
          "landing_hero",
          "landing_footer",
          "landing_direct",
        ].includes(data.form_location)
      )
        clean.form_location = data.form_location;
      return clean;
    }
    for (const key of ["plan_id", "region_id", "accessory_id", "experiment_id"])
      if (uuid(data[key])) clean[key] = data[key];
    if (["home", "landing", "speedtest", "product"].includes(data.placement))
      clean.placement = data.placement;
    if ([1, 6, 12].includes(data.billing_months))
      clean.billing_months = data.billing_months;
    if (
      Number.isInteger(data.accessory_count) &&
      data.accessory_count >= 0 &&
      data.accessory_count <= 100
    )
      clean.accessory_count = data.accessory_count;
    if (typeof data.selected === "boolean") clean.selected = data.selected;
    if (
      Number.isInteger(data.experiment_version) &&
      data.experiment_version > 0
    )
      clean.experiment_version = data.experiment_version;
    if (/^[a-z0-9_-]{1,50}$/.test(data.variant || ""))
      clean.variant = data.variant;
    if (/^[a-z0-9-]{1,100}$/.test(data.landing_slug || ""))
      clean.landing_slug = data.landing_slug;
    if (
      [
        "consultation",
        "landing_hero",
        "landing_footer",
        "landing_direct",
      ].includes(data.form_location)
    )
      clean.form_location = data.form_location;
    return clean;
  }
  function send(name, data = {}) {
    if (
      !loaded ||
      (!advanced && !context().analytics_opt_in) ||
      window[disable]
    )
      return false;
    gtag("event", name, { ...properties(data), ...pageFields(), send_to: id });
    return true;
  }
  let observedCards = new WeakSet();
  let lastAnalyticsConsent = false;
  let mutationObserver;
  function observePlans() {
    if (typeof IntersectionObserver === "undefined") return;
    if (!observer)
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const plan =
              entry.target.dataset.analyticsPlanId ||
              entry.target.dataset.planId;
            const placement = entry.target.dataset.analyticsPlacement || "home";
            const key = (context().analytics_opt_in ? "consented:" : "limited:") + placement + ":" + plan;
            if (
              !entry.isIntersecting ||
              entry.intersectionRatio < 0.5 ||
              !uuid(plan) ||
              viewedPlans.has(key)
            )
              continue;
            if (send("view_plan", { plan_id: plan, placement }))
              viewedPlans.add(key);
          }
        },
        { threshold: 0.5 },
      );
    document
      .querySelectorAll(
        "[data-analytics-plan-id]:not([data-analytics-action]),.plan-card-3d-wrapper[data-plan-id],.plan-card[data-plan-id]",
      )
      .forEach((card) => {
        if (!observedCards.has(card)) {
          observedCards.add(card);
          observer.observe(card);
        }
      });
    if (!mutationObserver && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver((changes) => {
        if (changes.some((change) => change.addedNodes.length)) observePlans();
      });
      mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }
  function updateConsent() {
    const allowed = !!context().analytics_opt_in;
    if (allowed && !lastAnalyticsConsent && observer) {
      observer.disconnect?.();
      observer = undefined;
      observedCards = new WeakSet();
    }
    lastAnalyticsConsent = allowed;
    window[disable] = !advanced && !allowed;
    if (!advanced && !allowed && !loaded) return;
    // HTML's implicit form action includes the raw query. Enhanced measurement
    // can capture it even though our manual events use sanitized page fields.
    document.querySelectorAll?.("form:not([action])").forEach((form) => {
      form.setAttribute("action", safeUrl(window.location.href));
    });
    // Consent updates can emit automatic hits; apply URL sanitization globally first.
    gtag("set", {
      campaign_source: "",
      campaign_medium: "",
      campaign_name: "",
      campaign_content: "",
      ...pageFields(),
    });
    gtag("consent", "update", {
      analytics_storage: allowed ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    if (!advanced && !allowed) return;
    if (loaded)
      gtag("config", id, {
        send_page_view: false,
        campaign_source: "",
        campaign_medium: "",
        campaign_name: "",
        campaign_content: "",
        ...pageFields(),
      });
    if (!loaded) {
      loaded = true;
      gtag("js", new Date());
      gtag("config", id, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        ...pageFields(),
      });
      const script = document.createElement("script");
      script.async = true;
      script.referrerPolicy = "strict-origin";
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
      document.head.appendChild(script);
    }
    if (!pageViewed) {
      send("page_view");
      pageViewed = true;
    }
    observePlans();
  }
  window.PageFPTGoogle = {
    track(name, data) {
      if (name === "start_form") name = "form_open";
      if (name === "view_plan" && !uuid(data?.plan_id)) return false;
      if (names.has(name)) {
        if (context().analytics_opt_in && !loaded) updateConsent();
        return send(name, data);
      }
      return false;
    },
  };
  window.addEventListener("pagefpt-consent-change", updateConsent);
  window.addEventListener("pagefpt:lead-accepted", (event) => {
    const data = event.detail || {};
    if (
      !uuid(data.event_id) ||
      receipts.has(data.event_id) ||
      (!advanced && !context().analytics_opt_in)
    )
      return;
    if (send("generate_lead", data)) {
      receipts.add(data.event_id);
      if (receipts.size > 100) receipts.delete(receipts.values().next().value);
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(
      "[data-analytics-action=select_plan],.btn-select-plan[data-plan-id]",
    );
    if (button)
      send("select_plan", {
        plan_id: button.dataset.analyticsPlanId || button.dataset.planId,
        placement: button.dataset.analyticsPlacement || "home",
      });
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (/^tel:/i.test(href)) send("click_call");
    else if (/^https:\/\/(?:www\.)?zalo\.me\//i.test(href)) send("click_zalo");
    else if (/^https:\/\/(?:www\.)?(?:m\.me|messenger\.com)\//i.test(href))
      send("click_messenger");
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.matches?.("[data-billing-months]"))
      send("select_billing_period", {
        plan_id: el.dataset.billingMonths,
        billing_months: Number(el.value),
      });
    if (el.matches?.("[data-accessory-id]"))
      send("select_accessory", {
        plan_id: el.dataset.planId,
        accessory_id: el.dataset.accessoryId,
        selected: el.checked,
      });
    if (
      [
        "home-province-select",
        "home-ward-select",
        "form-lead-province",
        "form-lead-ward",
      ].includes(el.id)
    )
      send("select_region", { region_id: el.value });
  });
  document.addEventListener("focusin", (event) => {
    const form = event.target.closest?.(
      "#lead-intake-form,[data-lp-form],#direct-lead-form",
    );
    if (
      !form ||
      !event.target.matches?.("input,select,textarea") ||
      startedForms.has(form)
    )
      return;
    const form_location =
      form.id === "lead-intake-form"
        ? "consultation"
        : form.classList.contains("lp-consult-form")
          ? "landing_hero"
          : form.hasAttribute("data-lp-form")
            ? "landing_footer"
            : "landing_direct";
    if (send("form_start", { form_location })) startedForms.add(form);
  });
  updateConsent();
})();
