const { chromium, webkit, devices } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(origin + "/")
      ? r.continue()
      : r.abort(),
  );
  const api = (path, method = "GET", body) =>
    page.evaluate(
      async ({ path, method, body }) => {
        const r = await adminFetch("/api/v1" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, data: await r.json() };
      },
      { path, method, body },
    );
  async function inspect(label) {
    const bad = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      footerHeight:
        innerWidth < 768
          ? document.querySelector("#main-footer")?.getBoundingClientRect()
              .height
          : null,
      clipped: [
        ...document.querySelectorAll(
          ".combobox-field,.combobox-cta,.segment-tab-btn,.utility-title,.btn-sticky-title",
        ),
      ]
        .filter(
          (e) =>
            e.getClientRects().length &&
            (e.scrollWidth > e.clientWidth + 2 ||
              e.getBoundingClientRect().right > innerWidth + 1),
        )
        .map((e) => ({
          name: e.id || e.className,
          width: e.clientWidth,
          scroll: e.scrollWidth,
          right: e.getBoundingClientRect().right,
          html: e.outerHTML.slice(0, 200),
        })),
    }));
    assert.equal(bad.overflow, false, label);
    if (bad.footerHeight !== null && bad.footerHeight !== undefined)
      assert.ok(bad.footerHeight < 640, label + " compact footer");
    assert.deepEqual(bad.clipped, [], label);
    checks.push(label);
    await page.screenshot({
      path: ".local/qa/home-mobile/" + type.name() + "-" + label + ".png",
      fullPage: true,
    });
  }
  try {
    fs.mkdirSync(".local/qa/home-mobile", { recursive: true });
    assert.equal(
      (
        await context.request.post(origin + "/api/v1/auth/session", {
          data: {
            email: "qa-admin@example.test",
            password: "qa-only-password",
            otp: "123456",
          },
        })
      ).status(),
      200,
    );
    await page.goto(origin + "/admin/appearance");
    const before = await api("/system/display-settings");
    assert.equal(
      (
        await api("/system/display-settings", "POST", {
          expected_version: before.data.version,
          promo_slides: [],
        })
      ).status,
      200,
    );
    await page.reload();
    await page.waitForFunction(() =>
      document
        .querySelector("#home-merchandising-state")
        .textContent.includes("Đã tải"),
    );
    await inspect("admin-390");
    const rows = page.locator("#home-category-editor details");
    assert.equal(await rows.count(), 3);
    await rows.nth(0).locator("summary").click();
    await rows.nth(0).locator("[data-key=short_name]").fill("Nổi bật");
    await page.locator("#home-add-slide").click();
    let slide = page.locator("#home-slide-editor details").last();
    await slide.locator("[data-key=title]").fill("Ưu đãi theo địa bàn");
    await slide
      .locator("[data-key=description]")
      .fill("Chọn gói phù hợp với gia đình bạn.");
    await slide.locator("[data-key=plan_id]").selectOption({ index: 1 });
    const chosen = await slide.locator("[data-key=plan_id]").inputValue();
    await page.locator("#home-add-slide").click();
    slide = page.locator("#home-slide-editor details").last();
    await slide.locator("[data-key=title]").fill("Kết nối cho công việc");
    await page.locator("#home-save-merchandising").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#home-merchandising-state")
        .textContent.includes("Đã lưu"),
    );
    const saved = await api("/system/display-settings");
    assert.equal(saved.data.promo_slides.length, 2);
    assert.equal(saved.data.plan_categories[0].short_name, "Nổi bật");
    await page.goto(origin + "/");
    await page.locator('[data-consent-choice="deny"]').click();
    assert.equal(await page.locator("#home-promo-slider").count(), 1);
    assert.equal(await page.locator("[data-plan-category]").count(), 3);
    assert.equal(await page.locator(".footer-disclaimer-card").count(), 0);
    assert.equal(await page.locator(".process-illustration svg").count(), 4);
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction((width) => innerWidth === width, width);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await inspect("home-" + width);
      if (width === 320) {
        await page.evaluate(() => {
          const dots = document.querySelector(".home-promo-dots");
          while (dots.children.length < 12)
            dots.append(dots.firstElementChild.cloneNode(true));
        });
        await inspect("home-320-max-slides");
        await page.evaluate(() => {
          const dots = document.querySelector(".home-promo-dots");
          while (dots.children.length > 2) dots.lastElementChild.remove();
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-promo-next]").click();
    assert.ok(
      (
        await page
          .locator(".home-promo-slide:visible a")
          .getAttribute("aria-label")
      ).includes("Kết nối cho công việc"),
    );
    await page.locator("[data-promo-prev]").click();
    await page.locator(".home-promo-slide:visible [data-promo-plan]").click();
    await page.locator("#bottom-sheet-backdrop").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => selectedPlanId), chosen);
    await page.evaluate(() => closeBottomSheet());
    await page.locator('[data-plan-category="2"]').click();
    assert.equal(
      await page.locator("#plans-3d-stage.catalog-empty").count(),
      1,
    );
    assert.ok(
      (await page.locator("#plans-3d-stage").boundingBox()).height < 180,
      "Empty catalog must not reserve card height",
    );
    const card = page.locator(".solution-card").first(),
      box = await card.boundingBox();
    assert.ok(Math.abs(box.width - 390 * 0.75) < 2, "75% viewport");
    await card.locator(".solution-front [data-solution-flip]").click();
    assert.equal(
      await card.locator(".solution-front").getAttribute("inert"),
      "",
    );
    assert.equal(
      await card.locator(".solution-back").getAttribute("inert"),
      null,
    );
    await card.locator(".solution-back [data-solution-flip]").click();
    assert.equal(
      await card.locator(".solution-front").getAttribute("inert"),
      null,
    );
    await page.locator('[data-solution-dir="1"]').click();
    await page.waitForFunction(
      () => document.querySelector(".solution-track").scrollLeft > 100,
    );
    checks.push(
      "slider-controls-package-cta-category-empty-75percent-flip-swipe",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      ".local/qa/home-mobile/report-" + type.name() + ".json",
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log("Home mobile passed:", checks);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
