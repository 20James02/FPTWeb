/* Store only the visitor's explicit data choices; no session tokens or contact data. */
(() => {
  const key = "pagefpt-data-choice",
    version = "2026-10-v2",
    ttl = 180 * 24 * 60 * 60 * 1000;
  window.PageFPTConsentPreferences = {
    read() {
      try {
        const value = JSON.parse(window.localStorage.getItem(key) || "null");
        if (
          !value ||
          value.version !== version ||
          typeof value.analytics !== "boolean" ||
          typeof value.marketing !== "boolean" ||
          !Number.isFinite(value.expires) ||
          value.expires <= Date.now() ||
          value.expires > Date.now() + ttl + 60000
        )
          return null;
        return {
          analytics: value.analytics,
          marketing: value.marketing,
          expires: value.expires,
        };
      } catch (_) {
        return null;
      }
    },
    write(analytics, marketing) {
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version,
            analytics: analytics === true,
            marketing: marketing === true,
            expires: Date.now() + ttl,
          }),
        );
      } catch (_) {}
    },
  };
})();
