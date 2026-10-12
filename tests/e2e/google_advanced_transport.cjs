// Limited real Google transport check: no lead submission or customer data.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
if (
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) &&
  origin !== "https://fpt-vungtau.com"
)
  throw Error(
    "Use the disposable loopback fixture or the verified production domain",
  );
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  const received = [],
    errors = [],
    forbidden = ["qa-private@example.test", "0981234567", "Private address"];
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (
      u.origin === origin ||
      u.hostname === "www.googletagmanager.com" ||
      /(^|\.)google-analytics\.com$/.test(u.hostname)
    )
      return r.continue();
    return r.abort();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (
      !/(^|\.)google-analytics\.com$/.test(u.hostname) ||
      u.pathname !== "/g/collect"
    )
      return;
    const body = r.request().postData() || "";
    for (const line of body.split("\n")) {
      const params = new URLSearchParams(u.search);
      for (const [key, value] of new URLSearchParams(line))
        params.set(key, value);
      for (const [key, value] of params)
        if (forbidden.some((v) => decodeURIComponent(value).includes(v)))
          errors.push(
            "PII transport field: " + key + ", event: " + params.get("en"),
          );
      received.push({
        status: r.status(),
        id: params.get("tid"),
        event: params.get("en"),
        storage: params.get("gcs"),
        plan: params.has("ep.plan_id"),
      });
    }
  });
  async function waitEvent(name, storage, from) {
    for (let i = 0; i < 100; i++) {
      const found = received
        .slice(from)
        .find((r) => r.event === name && r.storage === storage);
      if (found) {
        assert.equal(found.status, 204);
        assert.equal(found.id, "G-D0J0XLJ891");
        return found;
      }
      await page.waitForTimeout(150);
    }
    throw Error(
      "No successful collect: " +
        name +
        " " +
        storage +
        " " +
        JSON.stringify(received) +
        " errors=" +
        JSON.stringify(errors),
    );
  }
  async function selectPlan() {
    await page.evaluate(() =>
      window.PageFPTGoogle.track("select_plan", {
        plan_id: "11111111-1111-4111-8111-111111111111",
        phone: "0981234567",
        email: "qa-private@example.test",
        address: "Private address",
      }),
    );
  }
  try {
    await page.goto(
      origin + "/do-toc-do?email=qa-private%40example.test&phone=0981234567",
    );
    await page.waitForFunction(() => !!window.PageFPTGoogle);
    await waitEvent("page_view", "G100", 0);
    assert.equal(
      (await context.cookies()).filter((c) => /^_ga(?:_|$)/.test(c.name))
        .length,
      0,
      "No GA cookies before choice",
    );
    await page.locator("[data-consent-choice=deny]").click();
    await page.waitForFunction(
      () => document.getElementById("cookie-consent-banner").hidden,
    );
    let start = received.length;
    await selectPlan();
    assert.equal((await waitEvent("select_plan", "G100", start)).plan, false);
    assert.equal(
      (await context.cookies()).filter((c) => /^_ga(?:_|$)/.test(c.name))
        .length,
      0,
      "No GA cookies after refusal",
    );
    await page.locator("[data-open-consent]").click();
    await page.locator("#consent-analytics").check();
    await page.locator("#data-consent-form [type=submit]").click();
    await page.waitForFunction(() => getAnalyticsContext().analytics_opt_in);
    start = received.length;
    await selectPlan();
    assert.equal((await waitEvent("select_plan", "G101", start)).plan, true);
    assert.ok(
      (await context.cookies()).some((c) => /^_ga(?:_|$)/.test(c.name)),
      "Cookies only after permission",
    );
    await page.locator("[data-open-consent]").click();
    await page.locator("#consent-analytics").uncheck();
    await page.locator("#data-consent-form [type=submit]").click();
    await page.waitForFunction(() => !getAnalyticsContext().analytics_opt_in);
    start = received.length;
    await selectPlan();
    assert.equal((await waitEvent("select_plan", "G100", start)).plan, false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        origin,
        beforeChoice: "denied, no GA cookies",
        refused: "denied, no GA cookies",
        granted: "analytics only",
        withdrawn: "denied",
        collect: received,
        leadSubmitted: false,
        propertyConsole: "not accessed",
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
