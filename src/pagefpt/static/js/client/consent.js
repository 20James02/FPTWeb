/* Explicit, independent choices; form-contact permission never opts into tracking. */
(() => {
  const dialog = document.getElementById("data-consent-dialog"),
    form = document.getElementById("data-consent-form");
  if (!dialog || analyticsPreview()) return;
  const banner = document.getElementById("cookie-consent-banner");
  let busy = false,
    choiceMade = !!window.PageFPTConsentPreferences?.read();
  function openChoices() {
    const ctx = getAnalyticsContext();
    document.getElementById("consent-analytics").checked =
      !!ctx.analytics_opt_in;
    document.getElementById("consent-marketing").checked =
      !!ctx.marketing_opt_in;
    for (const key of ["advertising", "personalization"]) { const input=document.getElementById("consent-"+key); if(input)input.checked=!!ctx[key+"_opt_in"]; }
    document.getElementById("data-consent-error").textContent = "";
    dialog.showModal();
  }
  document
    .querySelectorAll("[data-open-consent]")
    .forEach((button) => (button.onclick = openChoices));
  banner
    ?.querySelector("[data-consent-custom]")
    ?.addEventListener("click", openChoices);
  function hideNotice() {
    choiceMade = true;
    if (banner) banner.hidden = true;
  }
  window.addEventListener("pagefpt-consent-change", () => {
    if (window.PageFPTConsentPreferences?.read()) hideNotice();
  });
  banner?.querySelectorAll("[data-consent-choice]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      const buttons = [...banner.querySelectorAll("button")],
        error = document.getElementById("cookie-consent-error");
      buttons.forEach((b) => (b.disabled = true));
      error.hidden = true;
      try {
        await setAnalyticsConsent(
          button.dataset.consentChoice === "accept",
          false,
        );
        hideNotice();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      } finally {
        busy = false;
        buttons.forEach((b) => (b.disabled = false));
      }
    }),
  );
  if (banner && !window.PageFPTConsentPreferences?.read())
    setTimeout(() => {
      if (!choiceMade) banner.hidden = false;
    }, 1000);
  const toolbar =
    document.getElementById("sticky-bar") ||
    document.querySelector(".lp-mobile-cta");
  function offset() {
    document.documentElement.style.setProperty(
      "--consent-toolbar-offset",
      innerWidth < 768 && toolbar?.getClientRects().length
        ? Math.max(0, innerHeight - toolbar.getBoundingClientRect().top) + "px"
        : "0px",
    );
  }
  offset();
  if (toolbar && "ResizeObserver" in window)
    new ResizeObserver(offset).observe(toolbar);
  window.addEventListener("resize", offset);
  document.getElementById("data-consent-close").onclick = () => {
    if (!busy) dialog.close();
  };
  dialog.addEventListener("cancel", (e) => {
    if (busy) e.preventDefault();
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await setAnalyticsConsent(
        document.getElementById("consent-analytics").checked,
        document.getElementById("consent-marketing").checked,
        document.getElementById("consent-advertising")?.checked || false,
        document.getElementById("consent-personalization")?.checked || false,
      );
      hideNotice();
      dialog.close();
    } catch (e) {
      document.getElementById("data-consent-error").textContent = e.message;
    } finally {
      busy = false;
      submit.disabled = false;
    }
  };
})();
