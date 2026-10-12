/* Published campaign context, real deadlines and opt-in aggregate activity. */
(() => {
  let config = {};
  try {
    config = JSON.parse(
      document.getElementById("landing-config")?.textContent || "{}",
    );
  } catch (_) {}
  const campaign = config.campaign || {},
    preview = !!config.preview;
  window.PageFPTLanding = {
    preview,
    quoteContext: () => (preview ? {} : { landing_slug: config.slug }),
  };
  const serverStart = Date.parse(config.server_now) || Date.now(),
    monoStart = performance.now();
  const now = () => serverStart + performance.now() - monoStart;
  const status = document.getElementById("lp-campaign-status"),
    timer = document.getElementById("lp-countdown");
  let lastState = config.campaign_state,
    interval,
    activityTimer;
  function tick() {
    if (!campaign.enabled) return;
    const current = now(),
      start = Date.parse(campaign.start),
      end = Date.parse(campaign.end);
    const state =
      start > current
        ? "scheduled"
        : end <= current
          ? "ended"
          : campaign.stock_remaining === 0
            ? "sold_out"
            : "active";
    if (status)
      status.textContent = {
        scheduled: "Sắp bắt đầu",
        active: "Đang áp dụng",
        ended: "Đã kết thúc",
        sold_out: "Đã hết suất",
      }[state];
    if (timer) {
      timer.hidden =
        !campaign.show_countdown || ["ended", "sold_out"].includes(state);
      const seconds = Math.max(
        0,
        Math.floor(((state === "scheduled" ? start : end) - current) / 1000),
      );
      const values = [
        Math.floor(seconds / 86400),
        Math.floor((seconds % 86400) / 3600),
        Math.floor((seconds % 3600) / 60),
        seconds % 60,
      ];
      timer
        .querySelectorAll("[data-time-unit]")
        .forEach(
          (el, i) => (el.textContent = String(values[i]).padStart(2, "0")),
        );
      const label = document.getElementById("lp-countdown-label");
      if (label)
        label.textContent =
          state === "scheduled" ? "Bắt đầu sau" : "Ưu đãi kết thúc sau";
    }
    if (lastState !== state) {
      lastState = state;
      window.PageFPTAccessories?.clearQuotes();
      if (typeof refreshCatalogPrices === "function") refreshCatalogPrices();
    }
  }
  function startClock() {
    clearInterval(interval);
    tick();
    if (!document.hidden && campaign.enabled)
      interval = setInterval(tick, 1000);
  }
  async function activity() {
    if (preview || document.hidden || !campaign.show_activity) return;
    const badge = document.getElementById("lp-activity");
    if (typeof trackEvent === "function")
      trackEvent("view_landing", { landing_slug: config.slug });
    try {
      const r = await fetch(
        "/api/v1/landing/" + encodeURIComponent(config.slug) + "/activity",
        { signal: AbortSignal.timeout(4000) },
      );
      if (!r.ok) throw Error();
      const data = await r.json();
      if (badge) {
        badge.hidden = !(Number.isInteger(data.sessions) && data.sessions >= 3);
        badge.textContent = `${data.sessions} phiên quan tâm trong 5 phút qua`;
      }
    } catch (_) {
      if (badge) badge.hidden = true;
    }
  }
  function startActivity() {
    clearInterval(activityTimer);
    if (!document.hidden && !preview && campaign.show_activity) {
      activity();
      activityTimer = setInterval(activity, 60000);
    }
  }
  document.addEventListener("visibilitychange", () => {
    startClock();
    startActivity();
  });
  window.addEventListener("pagefpt-consent-change", () => activity());
  window.addEventListener("pagehide", () => {
    clearInterval(interval);
    clearInterval(activityTimer);
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      startClock();
      startActivity();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    startClock();
    startActivity();
  });
})();
