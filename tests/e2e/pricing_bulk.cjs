/* Real list renderer and browser controls: group identity, filters, header state. */
const { chromium, webkit, request } = require("playwright");
const assert = require("node:assert/strict");
const origin = "http://127.0.0.1:8098";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  try {
    const p = await browser.newPage();
    await p.setContent(
      `<main class="admin-content"><input id="pricing-search" oninput="renderPricing()"><select id="pricing-status" onchange="renderPricing()"><option value="">Đang sử dụng</option><option value="all">Tất cả</option><option value="draft">Bản nháp</option><option value="published">Đã công bố</option><option value="retired">Đã ngừng</option></select><select id="location-province-filter"><option value=""></option></select><section id="pricing-prices"><table><thead><tr><th>Tên</th><th>Giá</th><th>Kỳ</th><th>Hiệu lực</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="prices-tbody"></tbody></table></section><section id="pricing-plans" hidden><div id="plans-list"></div></section><section id="pricing-locations" hidden><div id="locations-list"></div></section><span id="prices-count-badge"></span><button id="pricing-load-more"></button><button id="pricing-add"></button></main>`,
    );
    for (const path of [
      "dates_vn.js",
      "admin/list_tools.js",
      "admin/pricing.js",
    ])
      await p.addScriptTag({ path: "src/pagefpt/static/js/" + path });
    await p.evaluate(() => {
      document.dispatchEvent(new Event("DOMContentLoaded"));
      renderPricing();
      PageFPTAdminLists.enhance();
    });
    await p.evaluate(() => {
      availablePlans = ["draft", "published", "retired"].map((status, i) => ({
        id: "plan-" + i,
        version: 1,
        published_version: status === "published" ? 1 : null,
        status,
        payload: { name: "Test " + i, service: "internet" },
      }));
      pricingRows = [
        ["price-0", "plan-0", "draft"],
        ["price-1", "plan-1", "draft"],
        ["price-2", "plan-2", "published"],
        ["price-3", "plan-1", "retired"],
      ].map(([id, plan_id, status]) => ({
        id,
        plan_id,
        status,
        version: 1,
        scope_kind: "default",
        monthly_vnd: 200000,
        monthly_coefficient: "1",
        billing_months: 6,
        setup_vnd: 0,
        equipment_vnd: 0,
        vat_bps: 0,
        vat_included: true,
        start: "2026-01-01T00:00:00+07:00",
      }));
      renderPricing();
      PageFPTAdminLists.enhance();
    });
    assert.equal(
      await p
        .locator("#pricing-prices [data-bulk-toolbar]")
        .getAttribute("data-bulk-toolbar"),
      "prices",
      "Initially empty table must keep prices bulk identity",
    );
    assert.equal(
      await p.locator("#prices-tbody [data-price-id]").count(),
      2,
      "Retired prices and prices of retired plans hidden by default",
    );
    await p.evaluate(() => pricingTab("plans"));
    assert.equal(await p.locator("#plans-list [data-plan-id]").count(), 2);
    await p.evaluate(() => pricingTab("prices"));
    await p.locator("thead input[type=checkbox]").check();
    assert.equal(
      await p.locator("#prices-tbody [data-bulk-select]:checked").count(),
      2,
    );
    await p.locator("#prices-tbody [data-bulk-select]").first().uncheck();
    assert.equal(
      await p.locator("thead input").evaluate((x) => x.indeterminate),
      true,
      "Header must show partial selection",
    );
    await p.evaluate(() => {
      pricingRows[1].version = 2;
      renderPricing();
      PageFPTAdminLists.enhance();
    });
    await p.locator("thead input").check();
    assert.equal(
      await p.evaluate(
        () => PageFPTAdminLists.selected("prices").get("price-1").version,
      ),
      1,
      "Select-all must preserve the version of an existing selection after refresh",
    );
    await p.locator("#prices-tbody [data-bulk-select]").first().uncheck();
    await p.locator("#pricing-search").fill("Test 0");
    await p.waitForFunction(
      () =>
        document.querySelectorAll("#prices-tbody [data-bulk-select]").length ===
        1,
    );
    assert.equal(
      await p.evaluate(() => PageFPTAdminLists.selected("prices").size),
      0,
      "Filtering must remove hidden selections",
    );
    assert.equal(await p.locator("thead input").isChecked(), false);
    await p.locator("#pricing-search").fill("");
    await p.locator("#pricing-status").selectOption("retired");
    assert.equal(
      await p.locator("#prices-tbody [data-price-id]").count(),
      2,
      "Retired view includes prices attached to stopped plans",
    );
    await p.evaluate(() => pricingTab("plans"));
    assert.equal(await p.locator("#plans-list [data-plan-id]").count(), 1);
    await p.locator("#pricing-status").selectOption("all");
    assert.equal(await p.locator("#plans-list [data-plan-id]").count(), 3);
    await p.close();
    if (process.env.PAGEFPT_QA_SERVER) {
      const ctx = await browser.newContext({
          viewport:
            type === webkit
              ? { width: 390, height: 844 }
              : { width: 1440, height: 900 },
        }),
        page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (r) =>
        r
          .request()
          .url()
          .startsWith(origin + "/")
          ? r.continue()
          : r.abort(),
      );
      assert.equal(
        (
          await ctx.request.post(origin + "/api/v1/auth/session", {
            data: {
              email: "qa-admin@example.test",
              password: "qa-only-password",
              otp: "123456",
            },
          })
        ).status(),
        200,
      );
      const csrf = (await ctx.cookies()).find(
        (x) => x.name === "pagefpt_csrf",
      ).value;
      const api = await request.newContext({
        storageState: await ctx.storageState(),
        extraHTTPHeaders: { "X-CSRF-Token": csrf },
      });
      const suffix = Date.now().toString(36),
        plans = [],
        prices = [];
      for (let i = 0; i < 3; i++) {
        const r = await api.post(origin + "/api/v1/admin/plans", {
          data: {
            name: "BulkQA " + suffix + " " + i,
            code: "bulkqa-" + suffix + "-" + i,
            service: "internet",
          },
        });
        assert.equal(r.status(), 201);
        plans.push(await r.json());
      }
      assert.equal(
        (
          await api.post(
            origin + "/api/v1/admin/plans/" + plans[2].id + "/retire",
            { data: { expected_version: plans[2].version } },
          )
        ).status(),
        200,
      );
      await page.goto(origin + "/admin/pricing");
      await page.locator("#pricing-search").fill(suffix);
      await page.locator("[data-tab=plans]").click();
      await page.locator("#plans-list [data-bulk-select]").first().waitFor();
      assert.equal(await page.locator("#plans-list [data-plan-id]").count(), 2);
      const bar = page.locator("[data-bulk-toolbar=plans]");
      await bar
        .getByRole("button", { name: "Chọn tất cả đang hiển thị", exact: true })
        .click();
      assert.equal(
        (
          await api.put(
            origin +
              "/api/v1/admin/plans/" +
              plans[0].id +
              "?expected_version=" +
              plans[0].version,
            {
              data: {
                ...plans[0].payload,
                description: "Concurrent bulk QA edit",
              },
            },
          )
        ).status(),
        200,
      );
      await bar
        .getByRole("button", { name: "Công bố đã chọn", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Xác nhận thao tác" })
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-bulk-toolbar=plans] [role=status]")
          ?.textContent.includes("Thành công 1/2"),
      );
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-plan-id="${id}"]`)?.dataset
            .bulkVersion === "2",
        plans[0].id,
      );
      assert.equal(
        await page.locator("#plans-list [data-bulk-select]:checked").count(),
        1,
      );
      assert.equal(
        await page.evaluate(
          (id) => PageFPTAdminLists.selected("plans").get(id).version,
          plans[0].id,
        ),
        plans[0].version,
      );
      const failed = page.locator(
        `[data-plan-id="${plans[0].id}"] [data-bulk-select]`,
      );
      await failed.uncheck();
      await failed.check();
      await bar
        .getByRole("button", { name: "Công bố đã chọn", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Xác nhận thao tác" })
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-bulk-toolbar=plans] [role=status]")
          ?.textContent.includes("Thành công 1/1"),
      );
      await page.waitForFunction(
        (ids) =>
          ids.every(
            (id) =>
              document.querySelector(`[data-plan-id="${id}"]`)?.dataset
                .bulkStatus === "published",
          ),
        plans.slice(0, 2).map((x) => x.id),
      );
      await bar
        .getByRole("button", { name: "Chọn tất cả đang hiển thị", exact: true })
        .click();
      await bar
        .getByRole("button", { name: "Công bố đã chọn", exact: true })
        .click();
      assert.match(
        await bar.locator("[role=status]").textContent(),
        /Không có bản ghi phù hợp/,
      );
      assert.equal(
        await page.getByRole("dialog", { name: "Xác nhận thao tác" }).count(),
        0,
      );
      await bar.getByRole("button", { name: "Bỏ chọn", exact: true }).click();
      for (const plan of plans.slice(0, 2)) {
        const r = await api.post(origin + "/api/v1/admin/prices", {
          data: {
            plan_id: plan.id,
            scope_kind: "default",
            scope_id: "00000000-0000-0000-0000-000000000000",
            billing_months: 6,
            monthly_vnd: 220000,
            source: "Synthetic bulk QA",
            start: "2026-01-01T00:00:00+07:00",
          },
        });
        assert.equal(r.status(), 201, await r.text());
        prices.push(await r.json());
      }
      await page
        .getByRole("button", { name: "Làm mới dữ liệu", exact: true })
        .click();
      await page.locator("[data-tab=prices]").click();
      await page.locator("#prices-tbody [data-bulk-select]").first().waitFor();
      assert.equal(
        await page.locator("#prices-tbody [data-price-id]").count(),
        2,
      );
      await page.locator("thead input").check();
      const pricebar = page.locator("[data-bulk-toolbar=prices]");
      await pricebar
        .getByRole("button", { name: "Công bố đã chọn", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Xác nhận thao tác" })
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-bulk-toolbar=prices] [role=status]")
          ?.textContent.includes("Thành công 2/2"),
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll("#prices-tbody [data-price-id]")].every(
          (x) => x.dataset.bulkStatus === "published",
        ),
      );
      await pricebar
        .getByRole("button", { name: "Chọn tất cả đang hiển thị", exact: true })
        .click();
      await pricebar
        .getByRole("button", { name: "Ngừng đã chọn", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Xác nhận thao tác" })
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll("#prices-tbody [data-price-id]").length ===
          0,
      );
      await page.locator("#pricing-status").selectOption("retired");
      assert.equal(
        await page.locator("#prices-tbody [data-price-id]").count(),
        2,
      );
      for (const row of prices)
        assert.equal(
          (
            await (
              await api.get(origin + "/api/v1/admin/prices/" + row.id)
            ).json()
          ).status,
          "retired",
        );
      await page.locator("#pricing-status").selectOption("");
      await page.locator("[data-tab=plans]").click();
      await bar
        .getByRole("button", { name: "Chọn tất cả đang hiển thị", exact: true })
        .click();
      await bar
        .getByRole("button", { name: "Ngừng đã chọn", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Xác nhận thao tác" })
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll("#plans-list [data-plan-id]").length === 0,
      );
      await page.locator("#pricing-status").selectOption("retired");
      assert.equal(await page.locator("#plans-list [data-plan-id]").count(), 3);
      assert.deepEqual(errors, []);
      await api.dispose();
      await ctx.close();
    }
    console.log(
      type.name() +
        ": bulk identity, filters, header state, plan/price publish and retirement passed",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
