const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = "http://127.0.0.1:8098";
(async () => {
  fs.mkdirSync(".local/qa/card-periods", { recursive: true });
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium,
    b = await type.launch(
      type === chromium
        ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
        : {},
    );
  const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    p = await ctx.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/*", (r) => {
    const req = r.request(),
      url = req.url();
    if (url.startsWith(origin + "/")) return r.continue();
    if (url.startsWith("https://media.example.test/uploads/"))
      return r.fulfill({
        status: req.method() === "OPTIONS" ? 204 : 200,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "PUT",
          "access-control-allow-headers": "content-type",
        },
      });
    if (url.startsWith("https://media.example.test/images/"))
      return r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ff7b24"/><text x="30" y="200" fill="white" font-size="40">QA product</text></svg>',
      });
    return r.abort();
  });
  const api = (path, method = "GET", data) =>
    p.evaluate(
      async ({ path, method, data }) => {
        const r = await adminFetch("/api/v1" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        const body = await r.json();
        if (!r.ok) throw Error(JSON.stringify({ status: r.status, body }));
        return body;
      },
      { path, method, data },
    );
  try {
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
    await p.goto(origin + "/admin/pricing");
    await p.waitForFunction(() => typeof adminFetch === "function");
    const initial = await api("/system/display-settings");
    await api("/system/display-settings", "POST", {
      expected_version: initial.version,
      navigation_items: initial.navigation_items.filter(
        (i) => i.label !== "QA menu",
      ),
    });
    const suffix = Date.now().toString(36),
      region = (await api("/regions")).items[0],
      media = (await api("/admin/workspace/media")).items.find(
        (x) => x.payload.state === "ready",
      );
    const plan = await api("/admin/plans", "POST", {
      name: "QA Period " + suffix,
      code: "qa-period-" + suffix,
      service: "internet",
      description: "Mô tả đầy đủ.\nDòng thứ hai để khách đọc trong popup.",
      speed_mbps: 300,
      equipment: ["Modem Wi-Fi", "Hỗ trợ lắp đặt"],
      image_id: media.id,
      card_labels: {
        badge: "Theo nhu cầu",
        register: "Chọn gói này",
        details: "Xem toàn bộ",
      },
    });
    await api("/admin/plans/" + plan.id + "/publish", "POST", {
      expected_version: plan.version,
    });
    for (const [months, factor] of [
      [1, 1],
      [6, 0.98],
      [12, 0.95],
    ]) {
      const price = await api("/admin/prices", "POST", {
        plan_id: plan.id,
        scope_id: region.id,
        scope_kind: "region",
        billing_months: months,
        monthly_vnd: 220000,
        monthly_coefficient: String(factor),
        start: "2026-01-01T00:00:00+07:00",
        source: "QA",
      });
      await api("/admin/prices/" + price.id + "/publish", "POST", {
        expected_version: price.version,
      });
    }
    // Accessory form performs real save, publish and direct upload/finalize.
    await p.goto(origin + "/admin/accessories");
    await p.locator("#accessory-add:not(:disabled)").waitFor();
    await p.locator("#accessory-add").click();
    await p.locator("#accessory-name").fill("QA Offer " + suffix);
    await p.locator("#accessory-code").fill("qa-offer-" + suffix);
    await p.locator("#accessory-price").fill("30000");
    await p.locator("#accessory-original-price").fill("50000");
    await p.locator("#accessory-offer").fill("Ưu đãi cùng gói");
    await p.locator("#accessory-mode").selectOption("monthly");
    await p.locator(`#accessory-plans input[value="${plan.id}"]`).check();
    await p
      .locator("#accessory-file")
      .setInputFiles(".local/qa/package-upload.png");
    await p.waitForFunction(() =>
      document
        .getElementById("accessory-upload-state")
        .textContent.startsWith("Ảnh sẵn sàng"),
    );
    assert.match(
      await p.locator("#accessory-preview-price").textContent(),
      /50.000đ.*30.000đ/,
    );
    await p.locator("#accessory-save").click();
    await p.locator("#accessory-editor").waitFor({ state: "hidden" });
    const row = p
      .locator("#accessory-list article")
      .filter({ hasText: "QA Offer " + suffix });
    await row.getByRole("button", { name: "Công bố", exact: true }).click();
    await row.getByText("Đã công bố", { exact: false }).waitFor();
    const accessory = (await api("/accessories")).items.find(
      (x) => x.name === "QA Offer " + suffix,
    );
    // Reopening during an old image upload keeps the new editor usable.
    let releaseUpload, markUpload;
    const uploadStarted = new Promise((resolve) => (markUpload = resolve));
    await p.route("https://media.example.test/uploads/**", (r) => {
      if (r.request().method() === "OPTIONS")
        return r.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "PUT",
            "access-control-allow-headers": "content-type",
          },
        });
      markUpload();
      return new Promise((resolve) => {
        releaseUpload = () =>
          r
            .fulfill({
              status: 200,
              headers: { "access-control-allow-origin": origin },
            })
            .then(resolve);
      });
    });
    await p.locator("#accessory-add").click();
    await p
      .locator("#accessory-file")
      .setInputFiles(".local/qa/package-upload.png");
    await uploadStarted;
    assert.equal(await p.locator("#accessory-save").isDisabled(), true);
    await p.keyboard.press("Escape");
    await p.locator("#accessory-add").click();
    assert.equal(await p.locator("#accessory-save").isDisabled(), false);
    const finalized = p.waitForResponse(
      (r) => r.url().includes("/media/") && r.url().endsWith("/finalize"),
    );
    await releaseUpload();
    await finalized;
    assert.equal(await p.locator("#accessory-save").isDisabled(), false);
    assert.equal(await p.locator("#accessory-image").inputValue(), "");
    await p.keyboard.press("Escape");
    await p.unroute("https://media.example.test/uploads/**");
    // Appearance: directly upload a slide, live preview, save with CAS.
    await p.goto(origin + "/admin/appearance");
    await p.locator("#home-save-merchandising:not(:disabled)").waitFor();
    await p.locator("#home-add-slide").click();
    const slide = p.locator("#home-slide-editor details").last();
    await slide.locator("[data-key=title]").fill("QA Ưu đãi " + suffix);
    await slide
      .locator("[data-key=description]")
      .fill("Ưu đãi thử nghiệm giao diện");
    await slide
      .locator("input[type=file]")
      .setInputFiles(".local/qa/package-upload.png");
    await p.waitForFunction(() =>
      [...document.querySelectorAll("#home-slide-editor details")]
        .at(-1)
        .textContent.includes("Ảnh sẵn sàng"),
    );
    assert.match(
      await p.locator("#appearance-slide-preview").textContent(),
      /QA Ưu đãi/,
    );
    await p.screenshot({
      path: `.local/qa/card-periods/${type.name()}-appearance.png`,
      fullPage: true,
    });
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.screenshot({
      path: `.local/qa/card-periods/${type.name()}-appearance-desktop.png`,
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator("#home-save-merchandising").click();
    await p.waitForFunction(() =>
      document
        .getElementById("home-merchandising-state")
        .textContent.startsWith("Đã lưu"),
    );
    // Menu: add/edit/preview/save; restore default menus after exercising a custom one.
    const settings = await api("/system/display-settings");
    await p.goto(origin + "/admin/navigation");
    await p.locator("#navigation-save:not(:disabled)").waitFor();
    await p.locator("#navigation-add").click();
    const menu = p.locator("#navigation-editor>article").last();
    await menu.locator("[data-key=label]").fill("QA menu");
    await menu.locator("[data-key=href]").fill("/khuyen-mai");
    await menu
      .getByRole("button", { name: "+ Thêm mục con", exact: true })
      .click();
    const menu2 = p.locator("#navigation-editor>article").last();
    await menu2.locator("[data-key=child-label]").fill("Đo mạng QA");
    await menu2.locator("[data-key=child-href]").fill("/do-toc-do");
    assert.match(
      await p.locator("#navigation-preview").textContent(),
      /Đo mạng QA/,
    );
    await p.locator("#navigation-save").click();
    await p.waitForFunction(() =>
      document
        .getElementById("navigation-state")
        .textContent.startsWith("Đã lưu."),
    );
    await p.goto(origin + "/");
    assert.equal(
      await p
        .locator(".main-nav-desktop")
        .getByText("QA menu", { exact: true })
        .count(),
      2,
    );
    await p.locator(".btn-mobile-menu-toggle").click();
    const mobile = p.locator(".mobile-nav-body");
    await mobile.getByRole("button", { name: "QA menu" }).click();
    assert.equal(
      await mobile.getByRole("link", { name: "Đo mạng QA" }).isVisible(),
      true,
    );
    await p.locator("#mobile-nav-drawer .btn-close-sheet").click();
    await p.waitForFunction(
      () => document.querySelector("#home-province-select").options.length > 0,
    );
    await p.locator("#home-province-select").selectOption(region.id);
    await p.waitForFunction(
      (id) =>
        document.querySelector(`[data-quote-plan="${id}"]`).textContent ===
        "215.600đ",
      plan.id,
    );
    // Position the test card through the carousel's public selection function.
    await p.evaluate((id) => {
      currentMultitaskIndex = [
        ...document.querySelectorAll(
          "#plans-slider-track .plan-card-3d-wrapper",
        ),
      ]
        .filter((c) => c.dataset.categoryHidden !== "true")
        .findIndex((c) => c.dataset.planId === id);
      renderMultitaskState(false);
    }, plan.id);
    const card = p.locator(`.plan-card-3d-wrapper[data-plan-id="${plan.id}"]`);
    const immediate = await card
      .locator("[data-billing-months]")
      .evaluate((el) => {
        el.value = "12";
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return el.closest(".card-face").querySelector("[data-quote-plan]")
          .textContent;
      });
    assert.equal(immediate, "209.000đ");
    const instantDevice = await card
      .locator(`[data-accessory-id="${accessory.id}"]`)
      .evaluate((el) => {
        el.click();
        return el.closest(".card-face").querySelector("[data-quote-plan]")
          .textContent;
      });
    assert.equal(instantDevice, "239.000đ");
    await card.locator("[data-plan-detail]").click();
    await p.locator("#plan-details-dialog[open]").waitFor();
    assert.match(
      await p.locator("#plan-details-description").textContent(),
      /Dòng thứ hai/,
    );
    assert.match(
      await p.locator("#plan-details-accessories").textContent(),
      /Giá gốc 50.000đ.*Giá ưu đãi 30.000đ/,
    );
    await p.keyboard.press("Escape");
    assert.equal(
      await card
        .locator("[data-plan-detail]")
        .evaluate((el) => document.activeElement === el),
      true,
    );
    for (const width of [320, 390, 430, 768, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.evaluate(() => {
        renderMultitaskState(false);
        return new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      const sizes = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        cards: [...document.querySelectorAll(".plan-card-3d-wrapper")].map(
          (el) => ({
            h: parseFloat(getComputedStyle(el).height),
            image: parseFloat(
              getComputedStyle(el.querySelector(".plan-card-image-wrap"))
                .height,
            ),
            body: el.querySelector(".plan-card-body").scrollHeight,
            bodyClient: el.querySelector(".plan-card-body").clientHeight,
          }),
        ),
      }));
      if (sizes.overflow) {
        console.log(
          await p.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > innerWidth + 1 &&
                  el.getClientRects().length,
              )
              .map((el) => ({
                tag: el.tagName,
                id: el.id,
                cls: el.className,
                right: el.getBoundingClientRect().right,
                width: el.getBoundingClientRect().width,
                overflow: getComputedStyle(el).overflowX,
              }))
              .slice(0, 25),
          ),
        );
        await p.screenshot({ path: ".local/qa/card-overflow.png" });
      }
      assert.equal(sizes.overflow, false, "overflow " + width);
      for (const size of sizes.cards) {
        assert.equal(size.h, 650);
        assert.equal(size.image, 238);
        assert.ok(size.body <= size.bodyClient + 2, JSON.stringify(size));
      }
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    fs.mkdirSync(".local/qa/card-periods", { recursive: true });
    await p.screenshot({
      path: `.local/qa/card-periods/${type.name()}-cards.png`,
    });
    // Register keeps plan, accessories and selected term in the signed fresh quote.
    await card.locator(".btn-select-plan").click();
    await p.locator("#bottom-sheet-backdrop.active").waitFor();
    await p.waitForFunction(() =>
      document
        .getElementById("form-plan-fee")
        .textContent.includes("2.868.000"),
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        browser: type.name(),
        checks: [
          "upload close/reopen race",
          "accessory CRUD/upload/offer preview",
          "slide upload/live preview/save",
          "menu CRUD/submenu/mobile/CAS",
          "period instant price",
          "checkbox instant price",
          "popup description/focus",
          "reference image/equal heights/mobile layouts",
          "registration 12-month selection",
        ],
        passed: true,
      }),
    );
    // Restore navigation so other regression scenarios see standard service groups.
    await p.evaluate(() => closeBottomSheet());
    await p.goto(origin + "/admin/navigation");
    const latest = await api("/system/display-settings");
    await api("/system/display-settings", "POST", {
      expected_version: latest.version,
      navigation_items: settings.navigation_items,
    });
  } finally {
    await b.close();
  }
})();
