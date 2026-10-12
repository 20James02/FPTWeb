/* Real browser + real quote engine; only the visitor's edge hint is synthetic. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""))
  throw Error("Loopback required");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PAGEFPT_CHROME_BINARY,
    args: ["--no-sandbox"],
  });
  const setup = await browser.newContext();
  try {
    const login = await setup.request.post(origin + "/api/v1/auth/session", {
      data: {
        email: "qa-admin@example.test",
        password: "qa-only-password",
        otp: "123456",
      },
    });
    assert.equal(login.status(), 200);
    const csrf = (await setup.cookies()).find(
      (c) => c.name === "pagefpt_csrf",
    ).value;
    async function api(path, method = "GET", data) {
      const response = await setup.request.fetch(origin + "/api/v1" + path, {
        method,
        data,
        headers: { "X-CSRF-Token": csrf, Origin: origin },
      });
      assert.ok(response.ok(), await response.text());
      return response.json();
    }
    async function publish(kind, data) {
      const row = await api("/admin/" + kind, "POST", data);
      return api(`/admin/${kind}/${row.id}/publish`, "POST", {
        expected_version: row.version,
      });
    }
    const branch_id = "00000000-0000-0000-0000-000000000000";
    const a = await publish("regions", {
      name: "Tỉnh Đồng Nai",
      code: "qa-ip-dong-nai",
      branch_id,
    });
    const b = await publish("regions", {
      name: "Thành phố Hồ Chí Minh",
      code: "qa-ip-hcm",
      branch_id,
      aliases: ["VN-SG"],
    });
    const ward = await publish("regions", {
      name: "Phường kiểm thử",
      code: "qa-ip-ward",
      level: "ward",
      parent_id: b.id,
      branch_id,
    });
    const plan = await publish("plans", {
      name: "QA IP Location",
      code: "qa-ip-plan",
      service: "internet",
      speed_mbps: 300,
    });
    await api("/admin/prices/bulk", "POST", {
      publish: true,
      rows: [
        [a, 180000],
        [b, 220000],
        [ward, 230000],
      ].map(([scope, monthly_vnd]) => ({
        plan_id: plan.id,
        scope_kind: "region",
        scope_id: scope.id,
        billing_months: 6,
        monthly_vnd,
        source: "Synthetic browser QA",
        start: new Date(Date.now() - 86400000).toISOString(),
      })),
    });
    await publish("pages", {
      title: "QA IP Landing",
      slug: "qa-ip-landing",
      blocks: [],
      template: "telecom",
      landing: { hero_title: "QA", plan_ids: [plan.id] },
    });
    const hint = {
      status: "estimated",
      source: "vercel",
      country: "VN",
      province_name: "Thành phố Hồ Chí Minh",
      subdivision_code: "VN-SG",
      city: "Ho Chi Minh City",
      ward_id: null,
      address_confirmed: false,
    };
    let views = 0;
    fs.mkdirSync(".local/qa/ip-location", { recursive: true });
    for (const width of [320, 390, 1440])
      for (const path of ["/", "/qa-ip-landing", "/do-toc-do"]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          reducedMotion: "reduce",
        });
        await context.route("**/*", (r) =>
          r
            .request()
            .url()
            .startsWith(origin + "/")
            ? r.continue()
            : r.abort(),
        );
        let detections = 0;
        await context.route(
          "**/api/v1/regions/location-suggestion",
          async (r) => {
            detections++;
            await r.fulfill({
              contentType: "application/json",
              body: JSON.stringify(hint),
            });
          },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(60000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(origin + path, { waitUntil: "domcontentloaded" });
        assert.equal(new URL(page.url()).pathname, path);
        try {
          await page.waitForFunction(
            (id) =>
              document.querySelector("#home-province-select")?.value === id,
            b.id,
          );
        } catch (error) {
          console.error({
            path,
            width,
            detections,
            errors,
            state: await page.evaluate(() => ({
              province: document.querySelector("#home-province-select")?.value,
              explicit: clientLocationExplicit,
              generation: clientLocationGeneration,
            })),
          });
          throw error;
        }
        const priceSelector =
          path === "/do-toc-do"
            ? `[data-speed-plan="${plan.id}"] .speed-plan-price`
            : `[data-quote-plan="${plan.id}"]`;
        const label = page.locator(priceSelector).first();
        await label.waitFor({ state: "attached" });
        const waitPrice = (value) =>
          page.waitForFunction(
            ({ selector, value }) =>
              document.querySelector(selector)?.textContent === value,
            { selector: priceSelector, value },
          );
        await waitPrice("220.000đ");
        assert.equal(
          await page.locator("#client-location-status").count(),
          1,
          "Every automatic pricing page must label IP geography as an estimate",
        );
        assert.match(
          await page.locator("#client-location-status").innerText(),
          /ước tính.*Hồ Chí Minh/,
        );
        assert.equal(
          await page.locator("#home-ward-select").count(),
          1,
          "Landing must support customer-confirmed wards as well as province estimates",
        );
        assert.equal(await page.locator("#home-ward-select").inputValue(), "");
        await page.locator("#home-ward-select").selectOption(ward.id);
        await waitPrice("230.000đ");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          (id) => document.querySelector("#home-ward-select")?.value === id,
          ward.id,
        );
        assert.equal(
          detections,
          1,
          "Reload must preserve the customer-confirmed ward without IP lookup",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "Mobile page must not overflow horizontally",
        );
        assert.deepEqual(errors, []);
        await page.locator("#home-province-select").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `.local/qa/ip-location/${path === "/" ? "home" : path === "/do-toc-do" ? "speedtest" : "landing"}-${width}.png`,
        });
        await context.close();
        views++;
      }
    // A slow IP response cannot change a selection made while it was in flight.
    const race = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await race.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(origin + "/")
        ? r.continue()
        : r.abort(),
    );
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await race.route("**/api/v1/regions/location-suggestion", async (r) => {
      await gate;
      await r
        .fulfill({
          contentType: "application/json",
          body: JSON.stringify(hint),
        })
        .catch(() => {});
    });
    const page = await race.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (id) =>
        [...document.querySelector("#home-province-select").options].some(
          (x) => x.value === id,
        ),
      a.id,
    );
    await page.locator("#home-province-select").selectOption(a.id);
    release();
    await page.waitForFunction(
      (id) =>
        [...document.querySelectorAll("[data-quote-plan]")].some(
          (x) => x.dataset.quotePlan === id && x.textContent === "180.000đ",
        ),
      plan.id,
    );
    assert.equal(
      await page.locator("#home-province-select").inputValue(),
      a.id,
    );
    await race.close();
    console.log(
      `IP pricing browser: ${views} home/landing/speedtest layouts; real province and ward prices; reload priority and late-result fencing.`,
    );
  } finally {
    await setup.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
