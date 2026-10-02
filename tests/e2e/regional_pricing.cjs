const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8092";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Loopback fixture required");
const output = "docs/qa/2026-10-02/regional-pricing";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Ho_Chi_Minh",
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(origin + "/") || route.request().url().startsWith("data:")
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const report = {
    environment:
      "Loopback Chrome + real PostgreSQL; synthetic Auth and geographic/price data",
    checks: [],
    errors: [],
    mobile: [],
  };
  page.on("pageerror", (e) => report.errors.push(e.message));
  const save = () =>
    fs.writeFileSync(output + "/browser.json", JSON.stringify(report, null, 2));
  async function check(name, fn) {
    try {
      await fn();
      report.checks.push({ name, status: "passed" });
      console.log("passed: " + name);
    } catch (e) {
      report.checks.push({ name, status: "failed", error: e.message });
      console.log("failed: " + name + " " + e.message);
      save();
      throw e;
    }
    save();
  }
  async function api(path, method = "GET", body) {
    return page.evaluate(
      async ({ path, method, body }) => {
        const csrf = document.cookie
          .split("; ")
          .find((c) => c.startsWith("pagefpt_csrf="));
        const r = await fetch(path, {
          method,
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(csrf
              ? { "X-CSRF-Token": decodeURIComponent(csrf.split("=")[1]) }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, data: await r.json() };
      },
      { path, method, body },
    );
  }
  async function ready() {
    await page.waitForFunction(
      () => availablePlans.length > 0 && pricingProvinces.length > 0,
    );
  }
  async function submitDialog(id, responsePath, method = "POST") {
    const response = page.waitForResponse(
      (r) => r.url().includes(responsePath) && r.request().method() === method,
    );
    await page.locator("#" + id + " button[type=submit]").click();
    const r = await response;
    assert.ok(r.ok(), await r.text());
    await page.locator("#" + id).waitFor({ state: "hidden" });
    await ready();
    return r.json();
  }
  async function publish(kind, row) {
    const r = await api(
      "/api/v1/admin/" + kind + "/" + row.id + "/publish",
      "POST",
      { expected_version: row.version },
    );
    assert.equal(r.status, 200, JSON.stringify(r));
    await page.evaluate(() => loadPricesList());
    return r.data;
  }
  let province, other, ward, plan;
  try {
    await page.goto(origin + "/admin/login");
    assert.equal(
      (
        await api("/api/v1/auth/session", "POST", {
          email: "qa-admin@example.test",
          password: "qa-only-password",
          otp: "123456",
        })
      ).status,
      200,
    );
    await page.goto(origin + "/admin/pricing");
    await ready();
    await check(
      "Geographic CRUD uses named parent and inherited branch",
      async () => {
        await page.evaluate(() => pricingTab("locations"));
        await page.locator("#pricing-add").click();
        await page.locator("#location-name").fill("QA Tỉnh A");
        await page.locator("#location-code").fill("qa-province-a");
        province = await submitDialog(
          "location-dialog",
          "/api/v1/admin/regions",
        );
        province = await publish("regions", province);
        await page.locator("#pricing-add").click();
        await page.locator("#location-name").fill("QA Tỉnh B");
        await page.locator("#location-code").fill("qa-province-b");
        other = await submitDialog("location-dialog", "/api/v1/admin/regions");
        other = await publish("regions", other);
        await page.locator("#pricing-add").click();
        await page.locator("#location-level").selectOption("ward");
        await page.locator("#location-parent").selectOption(province.id);
        await page.locator("#location-name").fill("QA Phường A1");
        await page.locator("#location-code").fill("qa-ward-a1");
        assert.equal(await page.locator("#location-branch").isDisabled(), true);
        ward = await submitDialog("location-dialog", "/api/v1/admin/regions");
        ward = await publish("regions", ward);
      },
    );
    await check(
      "Plan create uses province checkbox and published snapshot",
      async () => {
        await page.evaluate(() => pricingTab("plans"));
        await page.locator("#pricing-add").click();
        await page.locator("#plan-name").fill("QA Gói địa bàn");
        await page.locator("#plan-code").fill("qa-regional-browser");
        await page.locator("#plan-speed").fill("345");
        await page.locator("#plan-all-locations").uncheck();
        await page
          .locator(
            '#plan-location-picker input[type=checkbox][value="' +
              province.id +
              '"]',
          )
          .check();
        await page
          .locator(
            '#plan-location-picker input[type=checkbox][value="' +
              other.id +
              '"]',
          )
          .check();
        plan = await submitDialog("plan-dialog", "/api/v1/admin/plans");
        assert.deepEqual(
          new Set(plan.payload.applicable_region_ids),
          new Set([province.id, other.id]),
        );
        plan = await publish("plans", plan);
      },
    );
    await check(
      "Bulk named province prices publish atomically from UI",
      async () => {
        await page.evaluate(() => pricingTab("prices"));
        await page.locator("#pricing-add").click();
        await page.locator("#inp-plan-id").selectOption(plan.id);
        await page.locator("#inp-scope-kind").selectOption("region");
        for (const id of [province.id, other.id])
          await page
            .locator(
              '#price-location-picker input[type=checkbox][value="' + id + '"]',
            )
            .check();
        await page.locator("#inp-monthly-vnd").fill("210.000");
        await page.locator("#inp-source").fill("Synthetic QA: not commercial");
        await page.locator("#price-publish-now").check();
        const data = await submitDialog(
          "create-price-backdrop",
          "/api/v1/admin/prices/bulk",
        );
        assert.equal(data.items.length, 2);
        assert.ok(
          data.items.every(
            (p) => p.status === "published" && p.monthly_vnd === 210000,
          ),
        );
      },
    );
    await check(
      "Ward override uses lazy named checkbox and VND formatting",
      async () => {
        await page.locator("#pricing-add").click();
        await page.locator("#inp-plan-id").selectOption(plan.id);
        await page.locator("#inp-scope-kind").selectOption("region");
        await page
          .locator(
            '#price-location-picker .location-picker-item[data-id="' +
              province.id +
              '"] button',
          )
          .click();
        await page
          .locator(
            '#price-location-picker input[type=checkbox][value="' +
              ward.id +
              '"]',
          )
          .check();
        await page.locator("#inp-monthly-vnd").fill("230000");
        await page.locator("#inp-source").fill("Synthetic ward price only");
        await page.locator("#price-publish-now").check();
        const data = await submitDialog(
          "create-price-backdrop",
          "/api/v1/admin/prices/bulk",
        );
        assert.equal(data.items[0].monthly_vnd, 230000);
      },
    );
    await check(
      "Client ward price and form selection stay synchronized",
      async () => {
        await page.goto(origin + "/");
        await page
          .locator("#home-zone-select option[value=mien_bac]")
          .waitFor({ state: "attached" });
        await page.locator("#home-zone-select").selectOption("mien_bac");
        await page
          .locator('#home-province-select option[value="' + province.id + '"]')
          .waitFor({ state: "attached" });
        await page.locator("#home-province-select").selectOption(province.id);
        await page
          .locator('#home-ward-select option[value="' + ward.id + '"]')
          .waitFor({ state: "attached" });
        await page.locator("#home-ward-select").selectOption(ward.id);
        await page.waitForFunction(
          (id) =>
            Array.from(document.querySelectorAll("[data-quote-plan]")).some(
              (el) =>
                el.dataset.quotePlan === id &&
                el.textContent.includes("230.000"),
            ),
          plan.id,
        );
        assert.equal(
          await page.locator("#form-lead-ward").inputValue(),
          ward.id,
        );
        await page.evaluate(
          ({ id }) => openBottomSheet("QA Gói địa bàn", "", id),
          { id: plan.id },
        );
        await page.waitForFunction(
          () =>
            typeof activeQuoteToken === "string" && activeQuoteToken.length > 0,
        );
        await page.locator("#lead-phone").fill("0908765432");
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/v1/leads") &&
            r.request().method() === "POST",
        );
        await page.locator("#btn-submit-lead").click();
        const r = await response;
        assert.equal(r.status(), 201);
        const payload = r.request().postDataJSON();
        assert.equal(payload.region_id, ward.id);
        assert.equal(payload.plan_id, plan.id);
        assert.ok(payload.quote_token);
      },
    );
    await check(
      "Province fallback clears ward and updates prices",
      async () => {
        await page.goto(origin + "/");
        await page
          .locator("#home-zone-select option[value=mien_bac]")
          .waitFor({ state: "attached" });
        await page.locator("#home-zone-select").selectOption("mien_bac");
        await page
          .locator('#home-province-select option[value="' + other.id + '"]')
          .waitFor({ state: "attached" });
        await page.locator("#home-province-select").selectOption(other.id);
        assert.equal(await page.locator("#form-lead-ward").inputValue(), "");
        await page.waitForFunction(
          (id) =>
            Array.from(document.querySelectorAll("[data-quote-plan]")).some(
              (el) =>
                el.dataset.quotePlan === id &&
                el.textContent.includes("210.000"),
            ),
          plan.id,
        );
      },
    );
    await check(
      "Campaign landing sends selected ward and confirmed quote",
      async () => {
        await page.goto(origin + "/khuyen-mai");
        await page.locator("#lp-plan").selectOption(plan.id);
        await page.locator("#lp-region").selectOption(province.id);
        await page
          .locator('#lp-ward option[value="' + ward.id + '"]')
          .waitFor({ state: "attached" });
        await page.locator("#lp-ward").selectOption(ward.id);
        await page.waitForFunction(() =>
          document.getElementById("lp-quote").textContent.includes("1.380.000"),
        );
        assert.equal(
          (
            await api("/api/v1/quotes", "POST", {
              plan_id: plan.id,
              region_id: ward.id,
            })
          ).data.monthly_vnd,
          230000,
        );
      },
    );
    await page.goto(origin + "/admin/pricing");
    await ready();
    await check(
      "Published ward price replacement preserves version history",
      async () => {
        const rows = (await api("/api/v1/admin/prices?limit=100")).data.items;
        const old = rows.find(
          (r) =>
            r.plan_id === plan.id &&
            r.scope_id === ward.id &&
            r.status === "published",
        );
        await page.evaluate((row) => openCreatePriceModal(row), old);
        await page.locator("#inp-monthly-vnd").fill("240000");
        await page.locator("#inp-start").evaluate(
          (el, start) => {
            el.value = start;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          },
          await page.evaluate(
            (start) =>
              pricingLocalDate(Math.ceil(Date.parse(start) / 1000) * 1000),
            old.start,
          ),
        );
        const fresh = await submitDialog("create-price-backdrop", "/replace");
        assert.equal(fresh.status, "published");
        assert.notEqual(fresh.id, old.id);
        assert.equal(
          (
            await api("/api/v1/quotes", "POST", {
              plan_id: plan.id,
              region_id: ward.id,
            })
          ).data.monthly_vnd,
          240000,
        );
      },
    );
    await check(
      "Plan edit requires republish and keeps geographic selection",
      async () => {
        await page.evaluate(
          (id) => openPlanDialog(availablePlans.find((p) => p.id === id)),
          plan.id,
        );
        assert.equal(
          await page.locator("#plan-all-locations").isChecked(),
          false,
        );
        await page.locator("#plan-name").fill("QA Gói địa bàn đã sửa");
        const updated = await submitDialog(
          "plan-dialog",
          "/api/v1/admin/plans/" + plan.id,
          "PUT",
        );
        assert.equal(updated.published_payload.name, "QA Gói địa bàn");
        await publish("plans", updated);
        assert.equal(
          (await api("/api/v1/catalog")).data.items.find(
            (p) => p.id === plan.id,
          ).name,
          "QA Gói địa bàn đã sửa",
        );
      },
    );
    await check(
      "Dialogs support keyboard Escape, focus and mobile layout",
      async () => {
        for (const width of [360, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => openCreatePriceModal());
          await page.locator("#inp-source").focus();
          const metrics = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            dialogWidth: document
              .getElementById("create-price-backdrop")
              .getBoundingClientRect().width,
            inputHeight: document
              .getElementById("inp-monthly-vnd")
              .getBoundingClientRect().height,
            font: getComputedStyle(document.getElementById("inp-monthly-vnd"))
              .fontSize,
          }));
          assert.equal(metrics.overflow, false);
          assert.ok(metrics.dialogWidth <= width);
          assert.ok(metrics.inputHeight >= 44);
          assert.equal(metrics.font, "16px");
          report.mobile.push({ width, ...metrics });
          if (width === 390) {
            await page.screenshot({
              path: output + "/admin-price-mobile.png",
              fullPage: true,
            });
          }
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator("#create-price-backdrop").isVisible(),
            false,
          );
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({
          path: output + "/admin-prices-desktop.png",
          fullPage: true,
        });
      },
    );
    await check("Soft delete plan removes it from public catalog", async () => {
      await page.evaluate(
        (id) =>
          confirmPricingRetire(
            "plans",
            availablePlans.find((p) => p.id === id),
          ),
        plan.id,
      );
      await page.locator("#confirm-action").click();
      await page.locator("#pricing-confirm").waitFor({ state: "hidden" });
      assert.equal(
        (await api("/api/v1/catalog")).data.items.some((p) => p.id === plan.id),
        false,
      );
    });
    assert.deepEqual(report.errors, []);
    save();
  } finally {
    save();
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
