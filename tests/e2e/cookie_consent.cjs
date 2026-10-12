const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium,
    browser = await type.launch(
      type === chromium
        ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
        : {},
    );
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage(),
    tags = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) => {
    const url = r.request().url();
    if (url.startsWith(origin + "/")) return r.continue();
    if (url === "https://www.googletagmanager.com/gtag/js?id=G-D0J0XLJ891") {
      tags.push(url);
      return r.fulfill({
        contentType: "application/javascript",
        body: "/* transport disabled in QA */",
      });
    }
    return r.abort();
  });
  try {
    await page.goto(origin + "/");
    await page.locator("#cookie-consent-banner").waitFor({ state: "visible" });
    assert.equal(tags.length, 1);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() => {
        const r = document
          .getElementById("cookie-consent-banner")
          .getBoundingClientRect();
        return (
          r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight
        );
      });
      assert.ok(
        await page
          .locator(".cookie-consent-actions button")
          .evaluateAll((nodes) =>
            nodes.every((n) => n.getBoundingClientRect().height >= 44),
          ),
      );
      if (width < 768) {
        const overlap = await page.evaluate(
          () =>
            document
              .getElementById("cookie-consent-banner")
              .getBoundingClientRect().bottom >
            document.getElementById("sticky-bar").getBoundingClientRect().top,
        );
        assert.equal(overlap, false);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-consent-choice=deny]").click();
    await page.waitForFunction(
      () =>
        !getAnalyticsContext().analytics_opt_in &&
        document.getElementById("cookie-consent-banner").hidden,
    );
    await page.goto(origin + "/do-toc-do");
    await page.waitForFunction(() => getAnalyticsContext().session_token);
    assert.equal(tags.length, 2, "Denied reload still loads cookieless tag");
    assert.equal(
      await page.locator("#cookie-consent-banner").isVisible(),
      false,
    );
    await page.locator("[data-open-consent]").click();
    await page.locator("#consent-analytics").check();
    await page.locator("#data-consent-form [type=submit]").click();
    await page.waitForFunction(() => getAnalyticsContext().analytics_opt_in);
    assert.equal(tags.length, 2, "Consent update keeps one tag per page");
    assert.equal(
      await page.evaluate(() => getAnalyticsContext().marketing_opt_in),
      false,
    );
    await page.goto(origin + "/chinh-sach-bao-mat");
    await page.waitForFunction(() => getAnalyticsContext().analytics_opt_in);
    assert.equal(tags.length, 3, "Approved choice restored on a new page");
    assert.equal(
      await page.locator("#cookie-consent-banner").isVisible(),
      false,
    );
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pagefpt-data-choice")),
    );
    assert.deepEqual(Object.keys(stored).sort(), [
      "analytics",
      "expires",
      "marketing",
      "version",
    ]);
    await page.locator("[data-open-consent]").click();
    await page.locator("#consent-analytics").uncheck();
    await page.locator("#data-consent-form [type=submit]").click();
    await page.waitForFunction(() => !getAnalyticsContext().analytics_opt_in);
    await page.goto(origin + "/khuyen-mai");
    await page.waitForFunction(() => getAnalyticsContext().session_token);
    assert.equal(
      tags.length,
      4,
      "Withdrawal persists with cookieless measurement",
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.dataLayer.filter((x) => x[0] === "consent").at(-1)[2]
            .analytics_storage,
      ),
      "denied",
    );
    await page.goto(origin + "/admin/login");
    assert.equal(await page.locator("#cookie-consent-banner").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        browser: type.name(),
        prompt: true,
        acceptRejectCustomize: true,
        remembered: true,
        withdrawal: true,
        targets44: true,
        toolbarClear: true,
        adminExcluded: true,
        googleTransport: "blocked in QA",
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
