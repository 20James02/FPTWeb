const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  try {
    const page = await browser.newPage();
    await page.setContent(`<main class="admin-content">
      <input id="pricing-search"><select id="pricing-status"><option value=""></option></select>
      <select id="location-province-filter"><option value=""></option></select>
      <section id="pricing-prices"><table><tbody id="prices-tbody"></tbody></table></section>
      <section id="pricing-plans"><div id="plans-list"></div></section>
      <section id="pricing-locations"><div id="locations-list"></div></section>
      <span id="prices-count-badge"></span><button id="pricing-load-more"></button>
      <button id="pricing-add"></button>
    </main>`);
    await page.addScriptTag({ path: "src/pagefpt/static/js/dates_vn.js" });
    await page.addScriptTag({
      path: "src/pagefpt/static/js/admin/list_tools.js",
    });
    await page.addScriptTag({ path: "src/pagefpt/static/js/admin/pricing.js" });
    await page.evaluate(() => {
      availablePlans = [
        {
          id: "plan-1",
          version: 2,
          published_version: 2,
          status: "published",
          payload: {
            name: "Internet 300",
            service: "internet",
            speed_mbps: 300,
          },
        },
        {
          id: "plan-2",
          version: 1,
          status: "draft",
          payload: {
            name: "Internet 500",
            service: "internet",
            speed_mbps: 500,
          },
        },
      ];
      pricingRows = [
        {
          id: "price-1",
          version: 1,
          plan_id: "plan-1",
          status: "draft",
          scope_kind: "default",
          monthly_vnd: 220000,
          monthly_coefficient: "0.95",
          billing_months: 12,
          setup_vnd: 0,
          equipment_vnd: 0,
          vat_bps: 1000,
          vat_included: true,
          start: "2026-10-09T00:00:00+07:00",
        },
      ];
      renderPricing();
    });
    assert.equal(await page.locator("#prices-tbody tr").count(), 1);
    assert.match(await page.locator("#prices-tbody").textContent(), /209\.000/);
    assert.match(
      await page.locator("#prices-tbody").textContent(),
      /09\/10\/2026/,
    );
    assert.equal(await page.locator("#plans-list [data-plan-id]").count(), 2);
    const metadata = await page
      .locator("#plans-list [data-plan-id]")
      .evaluateAll((rows) => rows.map((r) => ({ ...r.dataset })));
    for (const row of metadata) {
      assert.equal(row.bulkKind, "plans");
      assert.equal(row.bulkGroup, "plans");
    }
    await page.evaluate(() => pricingTab("plans"));
    assert.equal(await page.locator("#pricing-plans").isVisible(), true);
    await page.evaluate(() => {
      document.getElementById("pricing-search").value = "500";
      renderPricing();
    });
    assert.equal(await page.locator("#plans-list [data-plan-id]").count(), 1);
    assert.match(
      await page.locator("#plans-list").textContent(),
      /Internet 500/,
    );
    await page.evaluate(() => {
      document.getElementById("pricing-search").value = "";
      pricingRows = [];
      renderPricing();
    });
    assert.equal(await page.locator("#plans-list [data-plan-id]").count(), 2);
    assert.match(
      await page.locator("#prices-tbody").textContent(),
      /Chưa có bản ghi/,
    );
    console.log(
      `${type.name()}: populated prices, plans, metadata, tabs, filtering and empty-price rendering passed`,
    );
    if (process.env.PAGEFPT_QA_SERVER) {
      const origin = "http://127.0.0.1:8098";
      await page.route("**/*", (route) =>
        route
          .request()
          .url()
          .startsWith(origin + "/")
          ? route.continue()
          : route.abort(),
      );
      const session = await page
        .context()
        .request.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        });
      assert.equal(session.status(), 200);
      await page.goto(origin + "/admin/pricing", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForFunction(() =>
        document
          .getElementById("prices-count-badge")
          .textContent.includes("bản ghi"),
      );
      assert.equal(
        await page.locator("#pricing-page-error").isVisible(),
        false,
      );
      const seed = await page.evaluate(async () => {
        const suffix = Date.now().toString(36);
        const region = (await pricingApi("/api/v1/regions")).items[0];
        const plan = await pricingApi("/api/v1/admin/plans", "POST", {
          name: "QA Bootstrap " + suffix,
          code: "qa-bootstrap-" + suffix,
          service: "internet",
          speed_mbps: 300,
          description: "Synthetic regression fixture",
        });
        const price = await pricingApi("/api/v1/admin/prices", "POST", {
          plan_id: plan.id,
          scope_kind: "region",
          scope_id: region.id,
          monthly_vnd: 220000,
          billing_months: 1,
          monthly_coefficient: "1",
          start: "2026-01-01T00:00:00+07:00",
          source: "Synthetic QA only",
        });
        await loadPricesList();
        return { plan: plan.id, price: price.id };
      });
      assert.equal(
        await page.locator("#pricing-page-error").isVisible(),
        false,
      );
      await page.evaluate(() => pricingTab("plans"));
      const planRow = page.locator(`[data-plan-id="${seed.plan}"]`);
      await planRow.getByRole("button", { name: "Sửa", exact: true }).click();
      await page.locator("#plan-dialog[open]").waitFor();
      assert.match(
        await page.locator("#plan-name").inputValue(),
        /QA Bootstrap/,
      );
      await page.keyboard.press("Escape");
      await planRow
        .getByRole("button", { name: "Công bố", exact: true })
        .click();
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-plan-id="${id}"]`)?.dataset
            .bulkStatus === "published",
        seed.plan,
      );
      await page.evaluate(() => pricingTab("prices"));
      const priceRow = page.locator(`[data-price-id="${seed.price}"]`);
      await priceRow.getByRole("button", { name: "Sửa", exact: true }).click();
      await page.locator("#create-price-backdrop[open]").waitFor();
      assert.equal(await page.locator("#inp-plan-id").inputValue(), seed.plan);
      await page.keyboard.press("Escape");
      await priceRow
        .getByRole("button", { name: "Công bố", exact: true })
        .click();
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-price-id="${id}"]`)?.dataset
            .bulkStatus === "published",
        seed.price,
      );
      assert.equal(
        await page.locator("#pricing-page-error").isVisible(),
        false,
      );
      await priceRow.locator("[data-bulk-select]").waitFor();
      assert.equal(await priceRow.locator("[data-bulk-select]").count(), 1);
      console.log(
        `${type.name()}: authenticated bootstrap, plan/price edit dialogs, publication and bulk checkbox passed`,
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
