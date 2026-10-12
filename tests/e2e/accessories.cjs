const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = "http://127.0.0.1:8098";
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium,
    b = await type.launch(
      type === chromium
        ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
        : {},
    );
  try {
    const ctx = await b.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      }),
      p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) =>
      r
        .request()
        .url()
        .startsWith(origin + "/")
        ? r.continue()
        : r.abort(),
    );
    let api = ctx.request;
    assert.equal(
      (
        await api.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        })
      ).status(),
      200,
    );
    await p.goto(origin + "/admin/accessories");
    await p.locator("#accessory-add:not(:disabled)").waitFor();
    const published = (await (await api.get(origin + "/api/v1/catalog")).json())
      .items;
    const plan = published.find((p) => p.service === "internet");
    assert.ok(plan);
    const suffix = Date.now().toString(36);
    const names = [];
    for (const [mode, price] of [
      ["one_time", 500000],
      ["monthly", 30000],
    ]) {
      const name = "QA " + mode + " " + suffix;
      names.push(name);
      await p.locator("#accessory-add").click();
      await p.locator("#accessory-name").fill(name);
      await p
        .locator("#accessory-code")
        .fill("qa-" + mode.replace("_", "-") + "-" + suffix);
      await p.locator("#accessory-price").fill(String(price));
      await p.locator("#accessory-mode").selectOption(mode);
      await p
        .locator('#accessory-plans input[value="' + plan.id + '"]')
        .check();
      await p.locator("#accessory-save").click();
      console.log(
        await p.evaluate(() => ({
          valid: document.querySelector("#accessory-form").checkValidity(),
          invalid: [
            ...document.querySelectorAll("#accessory-form input:invalid"),
          ].map((x) => ({
            id: x.id,
            error: x.validationMessage,
            value: x.value,
          })),
          error: document.querySelector("#accessory-error").textContent,
        })),
      );
      await p.locator("#accessory-editor").waitFor({ state: "hidden" });
      const card = p
        .locator("#accessory-list article")
        .filter({ hasText: name });
      await card.getByRole("button", { name: "Công bố", exact: true }).click();
      await card.getByText("Đã công bố", { exact: false }).waitFor();
    }
    api = await require("playwright").request.newContext({
      storageState: await ctx.storageState(),
      extraHTTPHeaders: {
        "X-CSRF-Token": (await ctx.cookies()).find(
          (c) => c.name === "pagefpt_csrf",
        ).value,
      },
    });
    const originalPlan = (
      await (await api.get(origin + "/api/v1/admin/plans/" + plan.id)).json()
    ).payload;
    for (const [index, description] of [
      "Gói gọn",
      "Nội dung mô tả dài để kiểm tra thẻ có cùng kích thước khi lượng văn bản và phụ kiện khác nhau",
    ].entries()) {
      const extra = await (
        await api.post(origin + "/api/v1/admin/plans", {
          data: {
            ...originalPlan,
            name: "QA Layout " + index + " " + suffix,
            code: "qa-layout-" + index + "-" + suffix,
            description,
          },
        })
      ).json();
      assert.ok(extra.id, JSON.stringify(extra));
      assert.equal(
        (
          await api.post(
            origin + "/api/v1/admin/plans/" + extra.id + "/publish",
            { data: { expected_version: extra.version } },
          )
        ).status(),
        200,
      );
    }
    const region = await (
      await api.post(origin + "/api/v1/admin/regions", {
        data: {
          name: "QA Province " + suffix,
          code: "qa-province-" + suffix,
          branch_id: "00000000-0000-0000-0000-000000000000",
        },
      })
    ).json();
    assert.ok(region.id, JSON.stringify(region));
    assert.equal(
      (
        await api.post(
          origin + "/api/v1/admin/regions/" + region.id + "/publish",
          { data: { expected_version: region.version } },
        )
      ).status(),
      200,
    );
    for (const months of [1, 6, 12]) {
      const row = await (
        await api.post(origin + "/api/v1/admin/prices", {
          data: {
            plan_id: plan.id,
            scope_id: region.id,
            scope_kind: "region",
            billing_months: months,
            monthly_vnd: 200000,
            start: "2026-01-01T00:00:00+07:00",
            source: "QA devices",
          },
        })
      ).json();
      assert.ok(row.id, JSON.stringify(row));
      assert.equal(
        (
          await api.post(
            origin + "/api/v1/admin/prices/" + row.id + "/publish",
            { data: { expected_version: row.version } },
          )
        ).status(),
        200,
      );
    }
    await p.goto(origin + "/");
    await p.waitForFunction(
      () => document.querySelector("#home-province-select").options.length > 1,
    );
    const options = await p
      .locator("#home-province-select option")
      .evaluateAll((a) => a.map((x) => x.value).filter(Boolean));
    await p.locator("#home-province-select").selectOption(region.id);
    await p.waitForFunction(
      (id) =>
        document
          .querySelector('[data-quote-plan="' + id + '"]')
          .textContent.includes("đ"),
      plan.id,
    );
    const inputs = p.locator(".is-center [data-accessory-id]");
    assert.ok((await inputs.count()) >= 2);
    const ids = await p
      .locator(".is-center [data-accessory-id]")
      .evaluateAll((a) => a.map((x) => x.dataset.accessoryId));
    const accessoryData = JSON.parse(
      await p.locator("#published-accessories-data").textContent(),
    );
    const once = accessoryData.find((x) => x.name === names[0]),
      monthly = accessoryData.find((x) => x.name === names[1]);
    assert.ok(ids.includes(once.id));
    const base = (
      await (
        await api.post(origin + "/api/v1/quotes", {
          data: { plan_id: plan.id, region_id: region.id, billing_months: 6 },
        })
      ).json()
    ).initial_total_vnd;
    const immediate = await p.evaluate(
      ({ id, plan }) => {
        document
          .querySelector('.is-center [data-accessory-id="' + id + '"]')
          .click();
        return document.querySelector('[data-accessory-total="' + plan + '"]')
          .textContent;
      },
      { id: once.id, plan: plan.id },
    );
    assert.ok(
      immediate.includes(new Intl.NumberFormat("vi-VN").format(base + 500000)),
      immediate,
    );
    await p
      .locator('.is-center [data-accessory-id="' + monthly.id + '"]')
      .check();
    await p.waitForFunction(
      ({ id, total }) =>
        document
          .querySelector('[data-accessory-total="' + id + '"]')
          .textContent.includes(total),
      {
        id: plan.id,
        total: new Intl.NumberFormat("vi-VN").format(base + 680000),
      },
    );
    await p.locator(".is-center .btn-select-plan").first().click();
    await p.locator("#bottom-sheet-backdrop.active").waitFor();
    await p.waitForFunction(
      (total) =>
        document.querySelector("#form-plan-fee").textContent.includes(total),
      new Intl.NumberFormat("vi-VN").format(base + 680000),
    );
    await p.locator("#lead-phone").fill("0984567890");
    await p.locator("#lead-name").fill("QA Accessories");
    await p.locator("#lead-address").fill("Địa chỉ QA");
    await p.locator("#lead-consent").check();
    await p.locator("#btn-submit-lead").click();
    await p.locator("#confirmation-backdrop.active").waitFor();
    await p.evaluate(() => closeConfirmationModal());
    const sizes = [];
    for (const width of [320, 390, 768, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const v = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        heights: [...document.querySelectorAll(".plan-card-3d-wrapper")].map(
          (e) => parseFloat(getComputedStyle(e).height),
        ),
        inner: [...document.querySelectorAll(".plan-card-3d-inner")].map((e) =>
          parseFloat(getComputedStyle(e).height),
        ),
      }));
      assert.equal(v.overflow, false, JSON.stringify(v));
      assert.ok(
        v.heights.length >= 3,
        "Compare at least three cards with different content",
      );
      assert.ok(
        v.heights.every((h) => h === 650),
        JSON.stringify(v),
      );
      assert.ok(
        v.inner.every((h) => h === 650),
        JSON.stringify(v),
      );
      sizes.push({ width, ...v });
    }
    assert.deepEqual(errors, []);
    fs.mkdirSync(".local/qa/accessories", { recursive: true });
    fs.writeFileSync(
      ".local/qa/accessories/" + type.name() + ".json",
      JSON.stringify({ sizes, errors, passed: true }, null, 2),
    );
    await p.screenshot({
      path: ".local/qa/accessories/" + type.name() + ".png",
      fullPage: true,
    });
    console.log(
      "Accessory admin/client/instant quote/form/cards passed",
      type.name(),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
