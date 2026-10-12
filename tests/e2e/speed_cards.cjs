const { chromium, webkit } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8099";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
const fixture = JSON.parse(fs.readFileSync(".local/qa/speedtest-fixture.json"));
(async () => {
  const type = process.env.PAGEFPT_QA_WEBKIT ? webkit : chromium;
  const browser = await type.launch(
    type === chromium
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (r) => {
    const u = r.request().url();
    if (u.startsWith("https://media.example.test/"))
      return r.fulfill({
        contentType: "image/png",
        body: fs.readFileSync(".local/qa/package-upload.png"),
      });
    if (u === origin + "/api/v1/regions/hierarchy")
      return r.fulfill({
        json: {
          mien_nam: {
            name: "Miền Nam",
            provinces: [
              {
                name: "Tỉnh kiểm thử",
                code: fixture.province,
                zone_id: "mien_nam",
              },
            ],
          },
        },
      });
    if (u.startsWith(origin + "/api/v1/regions/") && u.includes("/wards?"))
      return r.fulfill({
        json: {
          items: [{ id: fixture.ward, name: "Phường kiểm thử" }],
          next_cursor: null,
        },
      });
    if (u === origin + "/api/v1/quotes") {
      const plan = fixture.plans.find(
        (p) => p.id === r.request().postDataJSON().plan_id,
      );
      return r.fulfill({
        json: {
          status: "confirmed",
          monthly_vnd: plan.speed_mbps === 1000 ? null : 220000,
          initial_total_vnd: 1320000,
          billing_months: 6,
          service_months: 6,
          vat_included: true,
        },
      });
    }
    return u.startsWith(origin + "/") ? r.continue() : r.abort();
  });
  try {
    await page.goto(origin + "/do-toc-do");
    await page.locator('[data-consent-choice="deny"]').click();
    await page.waitForFunction(
      (code) =>
        [...document.getElementById("home-province-select").options].some(
          (o) => o.value === code,
        ),
      fixture.province,
    );
    await page.locator("#home-province-select").selectOption(fixture.province);
    await page.locator("#home-ward-select").selectOption(fixture.ward);
    await page.evaluate(() => window.PageFPTSpeedRecommendations.update(149));
    await page.waitForFunction(
      () =>
        document.querySelector(
          ".speed-plan-card.is-highlighted .speed-plan-price",
        ).textContent === "220.000đ",
    );
    assert.equal(
      await page.locator(".speed-plan-card.is-highlighted").count(),
      1,
    );
    assert.match(
      await page.locator("#speed-recommend-result").textContent(),
      /149 Mbps/,
    );
    const prepaid = page.locator(
      `[data-speed-plan="${fixture.plans.find((p) => p.speed_mbps === 1000).id}"]`,
    );
    await page.waitForFunction(
      (id) =>
        document.querySelector(
          `[data-speed-plan="${id}"] .speed-plan-price-label`,
        ).textContent === "Thanh toán ban đầu",
      fixture.plans.find((p) => p.speed_mbps === 1000).id,
    );
    assert.equal(
      await prepaid.locator(".speed-plan-price").textContent(),
      "1.320.000đ",
    );
    assert.equal(
      await prepaid.locator(".speed-plan-price-unit").textContent(),
      "",
    );
    for (const card of await page.locator(".speed-plan-card:visible").all()) {
      await card.scrollIntoViewIfNeeded();
      await card
        .locator("img")
        .evaluate((img) =>
          img.complete && img.naturalWidth
            ? Promise.resolve()
            : new Promise((resolve) =>
                img.addEventListener("load", resolve, { once: true }),
              ),
        );
    }
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#speedtest-plan-grid").scrollIntoViewIfNeeded();
      const boxes = await page
        .locator(".speed-plan-card:visible")
        .evaluateAll((cards) =>
          cards.map((c) => {
            const r = c.getBoundingClientRect(),
              image = c
                .querySelector(".speed-plan-artwork")
                .getBoundingClientRect(),
              cta = c.querySelector(".speed-plan-cta").getBoundingClientRect(),
              detail = c
                .querySelector(".speed-plan-details")
                .getBoundingClientRect();
            return {
              width: r.width,
              height: r.height,
              ratio: image.height / r.height,
              ctaHeight: cta.height,
              detailHeight: detail.height,
              ctaBottom: cta.bottom - r.bottom,
              overflow: c.scrollWidth > c.clientWidth + 1,
              broken:
                !c.querySelector("img").complete ||
                c.querySelector("img").naturalWidth === 0,
            };
          }),
        );
      assert.equal(boxes.length, 3);
      assert.ok(
        boxes.every((r) => r.ctaBottom <= -44),
        JSON.stringify({ width, boxes }),
      );
      assert.ok(
        boxes.every(
          (r) =>
            r.height === 700 &&
            r.ratio > 0.29 &&
            r.ratio < 0.31 &&
            r.ctaHeight >= 44 &&
            r.detailHeight >= 44 &&
            !r.overflow &&
            !r.broken,
        ),
        JSON.stringify({ width, boxes }),
      );
      assert.ok(
        Math.max(...boxes.map((r) => r.width)) -
          Math.min(...boxes.map((r) => r.width)) <
          2,
      );
      if (width >= 1024)
        assert.ok(
          Math.max(...boxes.map((r) => r.ctaBottom)) -
            Math.min(...boxes.map((r) => r.ctaBottom)) <
            3,
          JSON.stringify({ width, boxes }),
        );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      fs.mkdirSync(".local/qa/speed-cards", { recursive: true });
      await page.locator("#speedtest-recommendations").screenshot({
        path: `.local/qa/speed-cards/${type.name()}-${width}.png`,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const count of [1, 2]) {
      await page.evaluate((n) => {
        window.qaOriginalSpeedRank ||= window.PageFPTSpeedModel.rank;
        window.PageFPTSpeedModel.rank = (...args) =>
          window.qaOriginalSpeedRank(...args).slice(0, n);
        window.PageFPTSpeedRecommendations.update(149);
      }, count);
      await page.waitForFunction(
        (n) =>
          document.querySelectorAll(".speed-plan-card:not([hidden])").length ===
          n,
        count,
      );
      const columns = await page
        .locator("#speedtest-plan-grid")
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        );
      assert.equal(
        columns,
        count,
        "A short recommendation list must not leave empty grid columns",
      );
      const rect = await page.locator("#speedtest-plan-grid").boundingBox();
      assert.ok(
        Math.abs(rect.x + rect.width / 2 - 720) < 2,
        "Short list stays centered",
      );
    }
    await page.evaluate(() => {
      window.PageFPTSpeedModel.rank = window.qaOriginalSpeedRank;
      window.PageFPTSpeedRecommendations.update(149);
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".speed-plan-card:not([hidden])").length ===
        3,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const long = page.locator(
      `[data-speed-plan="${fixture.plans.find((p) => p.speed_mbps === 500).id}"]`,
    );
    await long.locator(".speed-plan-details").click();
    await page.locator("#plan-details-dialog").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#plan-details-title").textContent(),
      fixture.plans.find((p) => p.speed_mbps === 500).name,
    );
    assert.match(
      await page.locator("#plan-details-description").textContent(),
      /Mô tả QA đầy đủ/,
    );
    assert.match(
      await page.locator("#plan-details-facts").textContent(),
      /220.000đ/,
    );
    assert.equal(
      await page.locator("#plan-details-description script").count(),
      0,
    );
    await page.locator("#plan-details-dialog .detail-close").click();
    await prepaid.locator(".speed-plan-details").click();
    const facts = await page
      .locator("#plan-details-facts")
      .evaluate((el) =>
        [...el.querySelectorAll("dt")].map((dt) => [
          dt.textContent,
          dt.nextElementSibling.textContent,
        ]),
      );
    assert.equal(facts.find((p) => p[0] === "Cước mỗi tháng")[1], "Cần tư vấn");
    await page.locator("#plan-details-dialog .detail-close").click();
    await long.locator(".speed-plan-cta").click();
    assert.equal(
      await page.evaluate(() => selectedPlanId),
      fixture.plans.find((p) => p.speed_mbps === 500).id,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        browser: type.name(),
        widths: [320, 375, 390, 768, 1024, 1440],
        uniformHeight: 700,
        imageRatio: 0.3,
        adminLabels: true,
        prepaid: true,
        details: true,
        selection: true,
        customerData: false,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
