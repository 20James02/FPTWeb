const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict");
const origin = "http://127.0.0.1:8098";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  const p = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    errors = [],
    tags = [];
  let checkingCoverage = true;
  p.on("pageerror", (e) => {
    // Navigating through nine pages deliberately aborts older price requests in WebKit.
    if (
      checkingCoverage &&
      /api\/v1\/quotes due to access control checks\.$/.test(e.message)
    )
      return;
    errors.push(e.message);
  });
  // Inspect queues and load requests without sending test customers to the real GA property.
  await p.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(origin + "/")) return r.continue();
    if (u === "https://www.googletagmanager.com/gtag/js?id=G-D0J0XLJ891") {
      tags.push(u);
      return r.fulfill({
        contentType: "application/javascript",
        body: "/* QA: Google transport intentionally disabled. */",
      });
    }
    return r.abort();
  });
  const events = () =>
    p.evaluate(() =>
      window.dataLayer.filter((x) => x[0] === "event").map((x) => [x[1], x[2]]),
    );
  try {
    for (const path of [
      "/",
      "/do-toc-do",
      "/san-pham/internet-gia-dinh",
      "/san-pham/internet-doanh-nghiep",
      "/san-pham/fpt-play",
      "/san-pham/combo-fpt-play",
      "/san-pham/camera-fpt",
      "/khuyen-mai",
      "/chinh-sach-bao-mat",
    ]) {
      await p.goto(origin + path);
      await p.waitForFunction(() => !!window.PageFPTGoogle);
      assert.equal(await p.locator("#pagefpt-google-config").count(), 1, path);
      assert.equal(
        await p
          .locator('script[src="/static/js/client/google_analytics.js"]')
          .count(),
        1,
        path,
      );
      assert.equal(await p.evaluate(() => !!window.PageFPTGoogle), true, path);
    }
    assert.equal(
      tags.length,
      9,
      "One advanced tag per client route before consent",
    );
    await p.goto(origin + "/admin/login");
    assert.equal(
      await p.locator("#pagefpt-google-config").count(),
      0,
      "Admin excluded",
    );
    await p.goto(
      origin +
        "/?phone=0912345678&email=customer@example.test&utm_source=facebook&utm_medium=paid_social&utm_campaign=camera",
    );
    await p.waitForFunction(() => getAnalyticsContext().session_token);
    checkingCoverage = false;
    if (await p.locator("#cookie-consent-banner").isVisible())
      await p.locator("[data-consent-custom]").click();
    else await p.locator("[data-open-consent]").click();
    await p.locator("#consent-analytics").check();
    await p.locator("#data-consent-form [type=submit]").click();
    await p.waitForFunction(() => getAnalyticsContext().analytics_opt_in);
    await p.waitForFunction(() =>
      window.dataLayer.some((x) => x[0] === "event" && x[1] === "page_view"),
    );
    assert.equal(tags.length, 10, "Consent does not reload the tag");
    const term = p.locator("[data-billing-months]").first();
    await term.selectOption("12");
    assert.equal(
      (await events()).filter((x) => x[0] === "select_billing_period").at(-1)[1]
        .billing_months,
      12,
    );
    const accessory = p.locator("[data-accessory-id]").first();
    if (await accessory.count()) {
      await accessory.check();
      assert.equal(
        (await events()).filter((x) => x[0] === "select_accessory").at(-1)[1]
          .selected,
        true,
      );
    }
    await p.locator(".btn-select-plan[data-plan-id]").first().click();
    await p.locator("#lead-name").fill("Khách QA analytics");
    await p
      .locator("#lead-phone")
      .fill("091" + Date.now().toString().slice(-7));
    await p.locator("#lead-address").fill("Địa chỉ QA analytics riêng tư");
    await p.locator("#lead-consent").check();
    await p.route("**/api/v1/leads", (r) =>
      r.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ code: "VALIDATION_ERROR" }),
      }),
    );
    await p.locator("#btn-submit-lead").click();
    await p.waitForFunction(
      () => !document.getElementById("btn-submit-lead").disabled,
    );
    assert.equal(
      (await events()).filter((x) => x[0] === "generate_lead").length,
      0,
      "Rejected submission is not a conversion",
    );
    await p.unroute("**/api/v1/leads");
    const responsePromise = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/leads") && r.request().method() === "POST",
    );
    await p.locator("#btn-submit-lead").click();
    const response = await responsePromise,
      receipt = await response.json();
    assert.ok(
      [200, 201, 202].includes(response.status()),
      JSON.stringify(receipt),
    );
    await p.locator("#confirmation-backdrop.active").waitFor();
    assert.equal(
      (await events()).filter((x) => x[0] === "generate_lead").length,
      1,
    );
    await p.evaluate(
      (detail) =>
        window.dispatchEvent(
          new CustomEvent("pagefpt:lead-accepted", { detail }),
        ),
      { event_id: receipt.event_id },
    );
    assert.equal(
      (await events()).filter((x) => x[0] === "generate_lead").length,
      1,
      "Repeated receipt deduped",
    );
    const all = JSON.stringify(await p.evaluate(() => window.dataLayer));
    for (const value of [
      "customer@example.test",
      "0912345678",
      "Khách QA analytics",
      "Địa chỉ QA analytics riêng tư",
    ])
      assert.equal(all.includes(value), false, value);
    await p.keyboard.press("Escape");
    await p.locator("[data-open-consent]").click();
    await p.locator("#consent-analytics").uncheck();
    await p.locator("#data-consent-form [type=submit]").click();
    await p.waitForFunction(() => !getAnalyticsContext().analytics_opt_in);
    const count = (await events()).length;
    await p.locator(".btn-select-plan[data-plan-id]").first().click();
    assert.ok(
      (await events()).length > count,
      "Withdrawal retains limited events",
    );
    assert.equal((await events()).at(-1)[1].plan_id, undefined);
    assert.equal(
      await p.evaluate(() => window["ga-disable-G-D0J0XLJ891"]),
      false,
    );
    await p.goto(origin + "/khuyen-mai");
    await p.waitForFunction(() => getAnalyticsContext().session_token);
    await p.evaluate(() => setAnalyticsConsent(true, false));
    await p.locator("#direct-lead-form input").first().focus();
    assert.equal(
      (await events()).filter((x) => x[0] === "form_start").at(-1)[1]
        .form_location,
      "landing_direct",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        browser: type.name(),
        passed: true,
        clientRoutes: 9,
        adminExcluded: true,
        tagLoads: tags.length,
        realLeadReceipt: true,
        conversionCount: 1,
        transport: "blocked during QA",
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
