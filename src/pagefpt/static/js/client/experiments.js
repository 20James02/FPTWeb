/* Experiment runs only after explicit analytics consent; no session token in URL. */
(() => {
  let id = null;
  try {
    id = JSON.parse(
      document.getElementById("hero-experiment-config")?.textContent || "null",
    );
  } catch (_) {}
  const buttons = [...document.querySelectorAll("[data-experiment-cta]")],
    original = buttons.map((b) => b.textContent);
  let generation = 0,
    exposed = new Set();
  async function apply() {
    const seq = ++generation,
      ctx =
        typeof getAnalyticsContext === "function" ? getAnalyticsContext() : {};
    if (!id || !ctx.analytics_opt_in || !ctx.session_token) {
      buttons.forEach((b, i) => (b.textContent = original[i]));
      return;
    }
    try {
      const r = await fetch("/api/v1/experiments/" + id + "/variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({ session_token: ctx.session_token }),
      });
      if (!r.ok) return;
      const v = await r.json();
      if (seq !== generation || !getAnalyticsContext().analytics_opt_in) return;
      if (v.cta_label) buttons.forEach((b) => (b.textContent = v.cta_label));
      const key = ctx.session_token + ":" + v.experiment_version;
      const shown = buttons.some((b) => b.getClientRects().length);
      if (v.trackable && shown && !exposed.has(key)) {
        exposed.add(key);
        trackEvent("experiment_exposure", {
          experiment_id: id,
          variant: v.variant,
          experiment_version: v.experiment_version,
        });
      }
    } catch (_) {}
  }
  window.addEventListener("pagefpt-consent-change", apply);
  apply();
})();
