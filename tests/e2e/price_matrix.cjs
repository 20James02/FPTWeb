const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8113";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(type === chromium
    ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] } : {});
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (r) => r.request().url().startsWith(origin + "/") ? r.continue() : r.abort());
      assert.equal((await context.request.post(origin + "/api/v1/auth/session", {
        data: { email: "qa-admin@example.test", password: "qa-only-password", otp: "123456" },
      })).status(), 200);
      await page.goto(origin + "/admin/pricing");
      const api = (path, method = "GET", data) => page.evaluate(async ({ path, method, data }) => {
        const response = await adminFetch("/api/v1" + path, { method, ...(data ? {headers: {"Content-Type": "application/json"}, body: JSON.stringify(data)} : {}) });
        const result = await response.json();
        if (!response.ok) throw Error(JSON.stringify(result));
        return result;
      }, {path, method, data});
      const region = (await api("/regions")).items[0];
      const plan = await api("/admin/plans", "POST", {
        name: "QA Matrix " + width, code: "qa-matrix-" + width + "-" + Date.now(),
        service: "internet", equipment: ["Inherited modem"],
      });
      await api(`/admin/plans/${plan.id}/publish`, "POST", { expected_version: plan.version });
      await page.goto(origin + "/admin/pricing");
      await page.waitForFunction(() => document.getElementById("prices-count-badge").textContent.includes("bản ghi"));
      await page.locator("#pricing-add").click();
      assert.equal(await page.locator("[data-price-period]").count(), 3);
      assert.equal(await page.locator("#inp-monthly-coefficient").count(), 0);
      await page.locator("#inp-plan-id").selectOption(plan.id);
      await page.locator("#inp-source").fill("QA matrix only");
      for (const [months, monthly, display, setup, equipment] of [
        [1, "220000", "220000", "300000", "400000"],
        [6, "210000", "180000", "100000", "200000"],
        [12, "200000", "170000", "0", "100000"],
      ]) {
        await page.locator(`#period-${months}-monthly`).fill(monthly);
        await page.locator(`#period-${months}-display`).fill(display);
        await page.locator(`#period-${months}-setup`).fill(setup);
        await page.locator(`#period-${months}-equipment-fee`).fill(equipment);
        await page.locator(`#period-${months}-inherit`).uncheck();
        await page.locator(`#period-${months}-equipment`).fill("Modem " + months);
      }
      assert.equal(await page.locator("#create-price-backdrop").evaluate(e => e.scrollWidth <= e.clientWidth + 1), true);
      const saving = page.waitForResponse(r => r.url().endsWith("/admin/prices/matrix") && r.request().method() === "POST");
      await page.locator("#btn-submit-price").click();
      const response = await saving;
      assert.equal(response.status(), 200, await response.text());
      const saved = (await response.json()).items;
      assert.equal(saved.length, 3);
      await page.locator("#create-price-backdrop").waitFor({ state: "hidden" });
      await page.locator(`[data-price-id="${saved[0].id}"]`).waitFor();
      await page.locator(`[data-price-id="${saved[0].id}"]`).getByRole("button", { name: "Sửa", exact: true }).click();
      await page.locator("#create-price-backdrop[open]").waitFor();
      for (const months of [1, 6, 12]) {
        assert.equal(await page.locator(`#period-${months}-enabled`).isChecked(), true);
        assert.equal(await page.locator(`#period-${months}-equipment`).inputValue(), "Modem " + months);
      }
      await page.locator("#period-6-display").fill("175000");
      await page.locator("#price-publish-now").check();
      const publishing = page.waitForResponse(r => r.url().endsWith("/admin/prices/matrix") && r.request().method() === "POST");
      await page.locator("#btn-submit-price").click();
      assert.equal((await publishing).status(), 200);
      await page.locator("#create-price-backdrop").waitFor({ state: "hidden" });
      const q = await api("/quotes", "POST", { plan_id: plan.id, region_id: region.id, billing_months: 6 });
      assert.equal(q.display_monthly_vnd, 175000);
      assert.equal(q.initial_total_vnd, 1560000);
      assert.deepEqual(q.equipment, ["Modem 6"]);
      await page.goto(origin + "/");
      await page.locator("#home-province-select").selectOption(region.id);
      await page.waitForFunction((id) => window.PageFPTAccessories?.current(id), plan.id);
      const card = page.locator(`.plan-card-3d-wrapper[data-plan-id="${plan.id}"]`);
      assert.equal(await card.locator("[data-quote-plan]").textContent(), "175.000đ");
      assert.match(await card.locator("[data-period-equipment]").textContent(), /Modem 6/);
      for (const [months, display] of [[1, "220.000đ"], [12, "170.000đ"]]) {
        await card.locator("[data-billing-months]").evaluate((el, months) => {
          el.value = String(months); el.dispatchEvent(new Event("change", {bubbles: true}));
        }, months);
        await page.waitForFunction(({id, display}) => document.querySelector(`[data-quote-plan="${id}"]`).textContent === display, {id: plan.id, display});
        assert.match(await card.locator("[data-period-equipment]").textContent(), new RegExp("Modem " + months));
      }
      await card.locator("[data-plan-detail]").evaluate(el => openPublishedPlanDetails(el));
      assert.match(await page.locator("#plan-details-facts").textContent(), /2.500.000/);
      assert.doesNotMatch(await page.locator("#plan-details-facts").textContent(), /Hệ số/);
      assert.match(await page.locator("#plan-details-equipment").textContent(), /Modem 12/);
      await page.goto(origin + "/admin/pricing");
      const start = new Date(Date.now() - 86400000).toISOString();
      const end = new Date(Date.now() + 2 * 86400000).toISOString();
      const legacy = [];
      for (const [months, coefficient, expiry, source] of [[1, "1", end, "Source 1"], [6, "1.005", null, "Source 6"]]) {
        const created = await api("/admin/prices", "POST", {plan_id: plan.id, scope_kind: "region", scope_id: region.id, billing_months: months, monthly_vnd: 100, monthly_coefficient: coefficient, start, end: expiry, source});
        legacy.push(await api("/admin/prices/" + created.id));
      }
      await page.evaluate(row => openCreatePriceModal(row), legacy[0]);
      await page.locator("#btn-submit-price:not(:disabled)").waitFor();
      assert.equal(await page.locator("#period-6-monthly").inputValue(), "101", "Legacy amount uses exact half-up rounding");
      await page.locator("#period-1-monthly").fill("120");
      const changing = page.waitForResponse(r => r.url().endsWith("/admin/prices/matrix") && r.request().method() === "POST");
      await page.locator("#btn-submit-price").click();
      const changedResponse = await changing;
      assert.equal(changedResponse.status(), 200, await changedResponse.text());
      const changed = (await changedResponse.json()).items;
      assert.equal(changed.find(p => p.billing_months === 6).end, null, "Companion expiry is preserved");
      assert.equal(changed.find(p => p.billing_months === 6).source, "Source 6");
      assert.equal(changed.find(p => p.billing_months === 1).source, "Source 1");
      assert.deepEqual(errors, []);
      console.log(`${type.name()} ${width}px: create/reopen/edit/publish three direct prices and distinct equipment PASS`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
